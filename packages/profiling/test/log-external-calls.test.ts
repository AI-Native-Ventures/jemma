import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { MemoryStore } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { connectInMemory } from '../src/server'
import { OutOfScopeError, type ToolContext } from '../src/tools/context'
import { registry } from '../src/tools/registry'
import { logExternalCalls } from '../src/tools/save/log-external-calls'
import { loadEnv } from './helpers/env'
import { createSandbox, type Sandbox } from './helpers/sandbox'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({
  SUPABASE_URL: env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
})
const tag = `lec${Date.now()}`
let a: Sandbox
let b: Sandbox
let eventA: string
let eventB: string

const ctxFor = (s: Sandbox, extra: Partial<ToolContext> = {}): ToolContext => ({
  db,
  schoolId: s.schoolId,
  eventId: null,
  env: { replayStore: new MemoryStore(), LLM_MODEL: 'test/model:free' },
  now: () => new Date('2026-11-10T10:00:00Z'),
  ...extra,
})

async function newEvent(s: Sandbox) {
  const { data, error } = await db
    .from('events')
    .insert({ school_id: s.schoolId, type: 'paper.snapped', payload: { type: 'paper.snapped', paperId: s.paperId } })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

const rowsFor = async (schoolId: string) =>
  (await db.from('tool_calls').select('*').eq('school_id', schoolId).order('started_at', { ascending: true })).data ?? []

const call = (over: Partial<{ server: string; tool: string; input: unknown; output: unknown; ok: boolean; at: string }> = {}) => ({
  server: 'files',
  tool: 'read_file',
  input: { path: 'notes.txt' },
  output: { text: 'hello' },
  ok: true,
  at: '2026-11-10T09:00:00.000Z',
  ...over,
})

beforeAll(async () => {
  a = await createSandbox(db, `${tag}a`)
  b = await createSandbox(db, `${tag}b`)
  eventA = await newEvent(a)
  eventB = await newEvent(b)
})
afterAll(async () => {
  await a?.cleanup()
  await b?.cleanup()
})

describe('log_external_calls', () => {
  test('is in the registry with the contract the runner calls', () => {
    expect(registry).toHaveLength(27)
    expect(registry.map((t) => t.name)).toContain('log_external_calls')
    expect(logExternalCalls.input.parse({ eventId: eventA, engine: 'goose', model: null, usage: null, calls: [] })).toBeTruthy()
  })

  test('saves one row per call, plus one for the usage', async () => {
    const out = await logExternalCalls.run(ctxFor(a), {
      eventId: eventA,
      engine: 'goose',
      model: 'some/model',
      usage: { inputTokens: 1200, outputTokens: 340, costUsd: 0.0123 },
      calls: [
        call({ at: '2026-11-10T09:00:01.000Z' }),
        call({ server: 'maps', tool: 'lookup', input: { q: 'x' }, output: { error: 'nope' }, ok: false, at: '2026-11-10T09:00:02.000Z' }),
      ],
    })
    expect(out).toEqual({ logged: 2 })
    const rows = await rowsFor(a.schoolId)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      school_id: a.schoolId,
      event_id: eventA,
      server: 'files',
      tool: 'read_file',
      via: 'runner',
      engine: 'goose',
      model: 'some/model',
      input: { path: 'notes.txt' },
      output: { text: 'hello' },
      ok: true,
    })
    expect(new Date(rows[0]!.started_at).toISOString()).toBe('2026-11-10T09:00:01.000Z')
    expect(rows[1]).toMatchObject({ server: 'maps', tool: 'lookup', ok: false, output: { error: 'nope' } })
    const usage = rows[2]!
    expect(usage).toMatchObject({
      server: 'runner',
      tool: 'agent_run',
      via: 'runner',
      engine: 'goose',
      model: 'some/model',
      ok: true,
      output: { inputTokens: 1200, outputTokens: 340, costUsd: 0.0123 },
    })
    // It writes its own rows and no row for itself.
    expect(rows.some((r) => r.tool === 'log_external_calls')).toBe(false)
  })

  test('long strings are cut like the rest of the log', async () => {
    await logExternalCalls.run(ctxFor(a), {
      eventId: eventA,
      engine: 'claude',
      model: null,
      usage: null,
      calls: [call({ tool: 'long', input: { text: 'z'.repeat(2500) }, output: ['ok', 'q'.repeat(2001)], at: '2026-11-10T09:10:00.000Z' })],
    })
    const row = (await rowsFor(a.schoolId)).find((r) => r.tool === 'long')!
    expect(row.input).toEqual({ text: '<2500 characters>' })
    expect(row.output).toEqual(['ok', '<2001 characters>'])
    expect(row.model).toBeNull()
  })

  test('a call to the jemma server is refused and nothing is saved', async () => {
    const before = (await rowsFor(a.schoolId)).length
    await expect(
      logExternalCalls.run(ctxFor(a), {
        eventId: eventA,
        engine: 'claude',
        model: null,
        usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
        calls: [call({ tool: 'fine' }), call({ server: 'jemma', tool: 'get_paper' })],
      }),
    ).rejects.toThrow(/jemma/)
    expect((await rowsFor(a.schoolId)).length).toBe(before)
  })

  test('an event of another school is refused and nothing is saved', async () => {
    const beforeA = (await rowsFor(a.schoolId)).length
    const beforeB = (await rowsFor(b.schoolId)).length
    await expect(
      logExternalCalls.run(ctxFor(a), { eventId: eventB, engine: 'codex', model: null, usage: null, calls: [call()] }),
    ).rejects.toBeInstanceOf(OutOfScopeError)
    await expect(
      logExternalCalls.run(ctxFor(a), { eventId: '00000000-0000-4000-8000-000000000000', engine: 'codex', model: null, usage: null, calls: [call()] }),
    ).rejects.toBeInstanceOf(OutOfScopeError)
    expect((await rowsFor(a.schoolId)).length).toBe(beforeA)
    expect((await rowsFor(b.schoolId)).length).toBe(beforeB)
  })

  test('more than 50 calls or a time that is not a time is refused', async () => {
    await expect(
      logExternalCalls.run(ctxFor(a), { eventId: eventA, engine: 'goose', model: null, usage: null, calls: Array.from({ length: 51 }, () => call()) }),
    ).rejects.toThrow(/50/)
    await expect(
      logExternalCalls.run(ctxFor(a), { eventId: eventA, engine: 'goose', model: null, usage: null, calls: [call({ at: 'yesterday-ish' })] }),
    ).rejects.toThrow(/time/)
  })

  test('works through the MCP server', async () => {
    const { client, close } = await connectInMemory(ctxFor(a, { via: 'mcp' }))
    try {
      const listed = await client.listTools()
      expect(listed.tools).toHaveLength(27)
      expect(JSON.stringify(listed.tools.find((t) => t.name === 'log_external_calls')!.inputSchema)).toContain('calls')
      const res = await client.callTool({
        name: 'log_external_calls',
        arguments: { eventId: eventA, engine: 'claude', model: 'm', usage: null, calls: [call({ tool: 'through_mcp', at: '2026-11-10T09:20:00.000Z' })] },
      })
      expect(res.isError).toBeFalsy()
      expect(res.structuredContent).toEqual({ logged: 1 })
    } finally {
      await close()
    }
    expect((await rowsFor(a.schoolId)).some((r) => r.tool === 'through_mcp' && r.via === 'runner')).toBe(true)
  })
})

describe('every tool call is on the log', () => {
  test('a read through MCP is saved with its input and output', async () => {
    const { client, close } = await connectInMemory(ctxFor(a, { via: 'mcp', engine: 'claude', model: 'claude-test' }))
    try {
      const res = await client.callTool({ name: 'get_learner_profile', arguments: { childId: a.aminaId } })
      expect(res.isError).toBeFalsy()
    } finally {
      await close()
    }
    const row = (await rowsFor(a.schoolId)).find((r) => r.tool === 'get_learner_profile' && r.via === 'mcp')!
    expect(row).toBeTruthy()
    expect(row).toMatchObject({ server: 'jemma', engine: 'claude', model: 'claude-test', ok: true, error: null, input: { childId: a.aminaId } })
    expect(JSON.stringify(row.output)).toContain('Amina')
    expect(row.duration_ms).toBeGreaterThanOrEqual(0)
  })

  test('a call that is refused is saved as failed, with the reason', async () => {
    const { client, close } = await connectInMemory(ctxFor(a, { via: 'mcp' }))
    try {
      const res = await client.callTool({ name: 'get_learner_profile', arguments: { childId: b.aminaId } })
      expect(res.isError).toBe(true)
    } finally {
      await close()
    }
    const rows = (await rowsFor(a.schoolId)).filter((r) => r.tool === 'get_learner_profile' && r.input && (r.input as { childId?: string }).childId === b.aminaId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ok: false, output: null })
    expect(rows[0]!.error).toContain('not in this school')
  })

  test('a job that calls a tool directly is saved as a cloud call with the event and model', async () => {
    const { registry: tools } = await import('../src/tools/registry')
    const getJob = tools.find((t) => t.name === 'get_job')!
    await getJob.run(ctxFor(a), { eventId: eventA })
    const row = (await rowsFor(a.schoolId)).find((r) => r.tool === 'get_job')!
    expect(row).toMatchObject({ via: 'cloud', event_id: eventA, model: 'test/model:free', ok: true })
  })

  test('a photo read keeps the output and the number of photos, never the photos', async () => {
    const getPaper = registry.find((t) => t.name === 'get_paper')!
    const res = await getPaper.run(ctxFor(a), { paperId: a.paperId })
    expect((res as { images: unknown[] }).images.length).toBeGreaterThan(0)
    const row = (await rowsFor(a.schoolId)).find((r) => r.tool === 'get_paper')!
    const out = row.output as { output: unknown; images: number }
    expect(out.images).toBe((res as { images: unknown[] }).images.length)
    expect(out.output).toBeTruthy()
    expect(JSON.stringify(row)).not.toContain('iVBOR')
  })
})
