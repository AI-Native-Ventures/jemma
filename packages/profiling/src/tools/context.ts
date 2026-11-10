import type { z } from 'zod'
import type { AiEnv } from '../ai'
import type { JemmaDb, Json } from '../db'

export type ToolContext = {
  db: JemmaDb
  /** The school this run works for. */
  schoolId: string
  /** Extra schools a user token covers (a teacher's class school, a parent's linked children's schools). Defaults to `[schoolId]`. */
  schoolIds?: string[]
  eventId: string | null
  env: AiEnv
  now: () => Date
  /** How the tool is reached: inside a cloud job (the default) or through the MCP server. It is saved on the tool log. */
  via?: 'cloud' | 'mcp'
  /** The engine that drives an MCP client (claude, codex, goose), when it is known. Saved on the tool log. */
  engine?: string | null
  /** The model behind the call. A cloud call falls back to `env.LLM_MODEL`. Saved on the tool log. */
  model?: string | null
}

export class OutOfScopeError extends Error {
  constructor(table: string, ids: string[]) {
    super(`${table} ${ids.join(', ')} not in this school`)
    this.name = 'OutOfScopeError'
  }
}

export type ScopedTable = 'children' | 'classes' | 'tests' | 'papers' | 'sessions' | 'curriculum_maps' | 'events'

type Result<T> = PromiseLike<{ data: T; error: { message: string } | null }>

/** Awaits a Supabase query and returns its data; throws on an error or a missing row. */
export async function ok<T>(q: Result<T>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  if (data === null || data === undefined) throw new Error('row not found')
  return data
}

/** Like `ok` for `maybeSingle()` queries, where no row is a valid answer. */
export async function maybe<T>(q: Result<T>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const allowed = (ctx: ToolContext) => new Set(ctx.schoolIds?.length ? ctx.schoolIds : [ctx.schoolId])

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Maps each id to the school that owns it. Ids that do not exist are missing from the map. */
export async function schoolsOf(ctx: ToolContext, table: ScopedTable, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const wanted = [...new Set(ids)]
  if (wanted.length === 0 || wanted.some((id) => !UUID.test(id))) return out
  const db = ctx.db
  const viaClass = async (found: { id: string; class_id: string }[]) => {
    const classes = await rows(db.from('classes').select('id, school_id').in('id', [...new Set(found.map((r) => r.class_id))]))
    const school = new Map(classes.map((c) => [c.id, c.school_id]))
    for (const r of found) if (school.has(r.class_id)) out.set(r.id, school.get(r.class_id)!)
  }
  const viaChild = async (found: { id: string; child_id: string }[]) => {
    const kids = await rows(db.from('children').select('id, school_id').in('id', [...new Set(found.map((r) => r.child_id))]))
    const school = new Map(kids.map((c) => [c.id, c.school_id]))
    for (const r of found) if (school.has(r.child_id)) out.set(r.id, school.get(r.child_id)!)
  }
  switch (table) {
    case 'children':
    case 'classes':
    case 'events':
      for (const r of await rows(db.from(table).select('id, school_id').in('id', wanted))) out.set(r.id, r.school_id)
      break
    case 'tests':
    case 'curriculum_maps':
      await viaClass(await rows(db.from(table).select('id, class_id').in('id', wanted)))
      break
    case 'sessions':
      await viaChild(await rows(db.from('sessions').select('id, child_id').in('id', wanted)))
      break
    case 'papers': {
      const found = await rows(db.from('papers').select('id, test_id, child_id').in('id', wanted))
      await viaChild(found.filter((p) => p.child_id && !p.test_id).map((p) => ({ id: p.id, child_id: p.child_id! })))
      const withTest = found.filter((p) => p.test_id)
      if (withTest.length) {
        const tests = await schoolsOf(ctx, 'tests', withTest.map((p) => p.test_id!))
        for (const p of withTest) if (tests.has(p.test_id!)) out.set(p.id, tests.get(p.test_id!)!)
      }
      break
    }
  }
  return out
}

/** Throws `OutOfScopeError` when any id is missing or belongs to a school this context does not cover. */
export async function assertInSchool(ctx: ToolContext, table: ScopedTable, ids: string[]): Promise<void> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return
  const owners = await schoolsOf(ctx, table, wanted)
  const ok = allowed(ctx)
  const bad = wanted.filter((id) => !owners.has(id) || !ok.has(owners.get(id)!))
  if (bad.length) throw new OutOfScopeError(table, bad)
}

/** Context for the school that owns one record, so logs and writes land in the right school under a user token. */
export async function contextFor(ctx: ToolContext, table: ScopedTable, id: string): Promise<ToolContext> {
  await assertInSchool(ctx, table, [id])
  const owner = (await schoolsOf(ctx, table, [id])).get(id)!
  return owner === ctx.schoolId ? ctx : { ...ctx, schoolId: owner }
}

/** Writes one "What Jemma did" line. */
export async function logActivity(
  ctx: ToolContext,
  entry: { text: string; tool: string; classId?: string; childId?: string },
): Promise<void> {
  const { error } = await ctx.db.from('activity_log').insert({
    school_id: ctx.schoolId,
    class_id: entry.classId ?? null,
    child_id: entry.childId ?? null,
    at: ctx.now().toISOString(),
    text: entry.text,
    tool: entry.tool,
    event_id: ctx.eventId,
  })
  if (error) throw new Error(`activity_log write failed: ${error.message}`)
}

export type ToolImage = { data: string; mimeType: string }
const WITH_IMAGES = Symbol('withImages')
export type WithImages<T> = { [WITH_IMAGES]: true; output: T; images: ToolImage[] }

/** Read tools return the structured output plus page images; the server turns the images into MCP image content. */
export function withImages<T>(output: T, images: ToolImage[]): WithImages<T> {
  return { [WITH_IMAGES]: true, output, images }
}
export function isWithImages<T>(value: T | WithImages<T>): value is WithImages<T> {
  return typeof value === 'object' && value !== null && WITH_IMAGES in value
}

export type ToolDef<I extends z.ZodObject = z.ZodObject, O extends z.ZodType = z.ZodType> = {
  name: string
  description: string
  input: I
  output: O
  run(ctx: ToolContext, input: z.infer<I>): Promise<z.infer<O> | WithImages<z.infer<O>>>
}

/** Longest string the tool log keeps whole. A longer one is stored as its length. */
const LOG_MAX_STRING = 2000
const LOG_MAX_DEPTH = 12

const noNul = (text: string) => (text.includes('\u0000') ? text.replaceAll('\u0000', '') : text)

function trimValue(value: unknown, depth: number, parents: WeakSet<object>): Json | undefined {
  if (value === null) return null
  switch (typeof value) {
    case 'string': {
      const text = noNul(value)
      return text.length > LOG_MAX_STRING ? `<${text.length} characters>` : text
    }
    case 'number':
      return Number.isFinite(value) ? value : null
    case 'boolean':
      return value
    case 'bigint':
      return String(value)
    case 'object':
      break
    default:
      return undefined
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `<${value.byteLength} bytes>`
  if (depth >= LOG_MAX_DEPTH || parents.has(value)) return '<too deep>'
  parents.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => trimValue(item, depth + 1, parents) ?? null)
    const out: { [key: string]: Json | undefined } = {}
    for (const [key, item] of Object.entries(value)) {
      const trimmed = trimValue(item, depth + 1, parents)
      if (trimmed !== undefined) out[noNul(key)] = trimmed
    }
    return out
  } finally {
    parents.delete(value)
  }
}

/** A copy of `value` that is safe to keep in the tool log: plain JSON, with every string over 2000 characters replaced by `<N characters>`. */
export function trimForLog(value: unknown): Json {
  return trimValue(value, 0, new WeakSet()) ?? null
}

/** What the log keeps of a tool result. Image data is never stored: only the output and how many images there were. */
function outputForLog(result: unknown): Json {
  return isWithImages(result) ? { output: trimForLog(result.output), images: result.images.length } : trimForLog(result)
}

const messageOf = (err: unknown) => noNul(err instanceof Error ? err.message : String(err))

function eventIdOf(ctx: ToolContext, input: unknown): string | null {
  if (ctx.eventId) return ctx.eventId
  const fromInput = typeof input === 'object' && input !== null ? (input as { eventId?: unknown }).eventId : undefined
  return typeof fromInput === 'string' && UUID.test(fromInput) ? fromInput : null
}

type Outcome = { ok: true; result: unknown } | { ok: false; error: unknown }

/** Saves one row on the tool log. It never throws: a logging failure must not change what the tool returns or cause a retry of a save. */
async function logToolCall(ctx: ToolContext, tool: string, input: unknown, outcome: Outcome, startedAt: Date, durationMs: number): Promise<void> {
  try {
    const via = ctx.via ?? 'cloud'
    const row = {
      school_id: ctx.schoolId,
      event_id: eventIdOf(ctx, input),
      server: 'jemma',
      tool,
      via,
      engine: ctx.engine ?? null,
      model: ctx.model !== undefined ? ctx.model : via === 'cloud' ? (ctx.env.LLM_MODEL ?? null) : null,
      input: trimForLog(input) ?? {},
      output: outcome.ok ? outputForLog(outcome.result) : null,
      ok: outcome.ok,
      error: outcome.ok ? null : messageOf(outcome.error),
      started_at: startedAt.toISOString(),
      duration_ms: Math.max(0, Math.round(durationMs)),
    }
    let res = await ctx.db.from('tool_calls').insert(row)
    // A made-up event id (an out of scope or wrong call) must not hide the call itself: log it with no event.
    if (res.error?.code === '23503' && row.event_id) res = await ctx.db.from('tool_calls').insert({ ...row, event_id: null })
    if (res.error) console.error(`tool log: could not save the call to ${tool}: ${res.error.message}`)
  } catch (e) {
    console.error(`tool log: could not save the call to ${tool}: ${messageOf(e)}`)
  }
}

/**
 * Defines a tool. Every call is saved on the tool log (`tool_calls`) with its input, output, time and who ran it, whether it
 * comes through the MCP server or straight from a cloud job. `log_external_calls` writes its own rows, so it is left alone.
 */
export function defineTool<I extends z.ZodObject, O extends z.ZodType>(def: ToolDef<I, O>): ToolDef<I, O> {
  if (def.name === 'log_external_calls') return def
  return {
    ...def,
    async run(ctx, input) {
      const startedAt = ctx.now()
      const began = Date.now()
      let outcome: Outcome
      try {
        outcome = { ok: true, result: await def.run(ctx, input) }
      } catch (error) {
        outcome = { ok: false, error }
      }
      await logToolCall(ctx, def.name, input, outcome, startedAt, Date.now() - began)
      if (!outcome.ok) throw outcome.error
      return outcome.result as Awaited<ReturnType<ToolDef<I, O>['run']>>
    },
  }
}
