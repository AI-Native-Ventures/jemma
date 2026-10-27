import type { z } from 'zod'
import type { AiEnv } from '../ai'
import type { JemmaDb } from '../db'

export type ToolContext = {
  db: JemmaDb
  /** The school this run works for. */
  schoolId: string
  /** Extra schools a user token covers (a teacher's class school, a parent's linked children's schools). Defaults to `[schoolId]`. */
  schoolIds?: string[]
  eventId: string | null
  env: AiEnv
  now: () => Date
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

export function defineTool<I extends z.ZodObject, O extends z.ZodType>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def
}
