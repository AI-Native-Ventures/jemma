import { MemoryStore, type AiEnv, type ModelUsage } from '@jemma/profiling/ai'
import { createServiceClient } from '@jemma/profiling/db'
import type { ToolContext } from '@jemma/profiling/tools'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resetUsageWarning, withUsage } from '../src/usage'

// P137: the agent writes one `ai_usage` row for every model call a job step made, after the step, with the ids the step knows. It is a best effort:
// a failed insert (the table is missing, a policy, the network, a database that hangs) is logged once and never fails, retries or slows the job.
// No network and no database: `fetch` answers for the database, and the calls are kept so the test can read them.

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const TEST = '33333333-3333-4333-8333-333333333333'
const CHILD = '55555555-5555-4555-8555-555555555555'
const PAPER = '77777777-7777-4777-8777-777777777777'
const SESSION = '88888888-8888-4888-8888-888888888888'
const EVENT = '99999999-9999-4999-8999-999999999999'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Call = { method: string; table: string; search: URLSearchParams; body: unknown }
type Answer = (call: Call) => Response | Promise<Response>

/** The tables of one school with one test and one paper. `usage` is how the write to `ai_usage` is answered. */
function database(usage: Answer = () => json(null, 201), reads: Answer | null = null) {
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const call: Call = { method, table: url.pathname.split('/').pop()!, search: url.searchParams, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null }
    calls.push(call)
    if (call.table === 'ai_usage') return usage(call)
    if (reads) return reads(call)
    const accept = new Headers(init?.headers).get('accept') ?? ''
    const rows: Record<string, unknown[]> = {
      papers: [{ id: PAPER, test_id: TEST, child_id: CHILD }],
      tests: [{ id: TEST, class_id: CLASS }],
      enrolments: [{ class_id: CLASS }],
    }
    const found = rows[call.table] ?? []
    return json(accept.includes('pgrst.object') ? (found[0] ?? null) : found, accept.includes('pgrst.object') && !found[0] ? 406 : 200)
  })
  return calls
}
const usageWrites = (calls: Call[]) => calls.filter((c) => c.table === 'ai_usage')

const REPORTED: ModelUsage = { provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', promptTokens: 120, completionTokens: 30, totalTokens: 150, reported: true }
const UNREPORTED: ModelUsage = { provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free', promptTokens: null, completionTokens: null, totalTokens: null, reported: false }

function context(): ToolContext {
  const db = createServiceClient({ SUPABASE_URL: 'http://localhost:1', SUPABASE_SERVICE_ROLE_KEY: 'x' })
  return { db, schoolId: SCHOOL, eventId: EVENT, env: { AI_MODE: 'live', replayStore: new MemoryStore() } as AiEnv, now: () => new Date('2026-11-16T10:00:00Z') }
}

let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  resetUsageWarning()
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

/** A job that makes the given model calls, the way a real one does through `ctx.env`. */
const jobCalling = (...usages: ModelUsage[]) => vi.fn(async (ctx: ToolContext) => void usages.forEach((u) => ctx.env.onUsage?.(u)))

describe('withUsage', () => {
  test('one row for each model call of the step, with the school, the learner, the test and the class the step belongs to', async () => {
    const calls = database()
    const run = jobCalling(REPORTED, UNREPORTED)
    await withUsage('read_paper', run)(context(), EVENT, { paperId: PAPER })
    const writes = usageWrites(calls)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.method).toBe('POST')
    expect(writes[0]!.body).toEqual([
      { school_id: SCHOOL, class_id: CLASS, child_id: CHILD, test_id: TEST, session_id: null, lesson_id: null, job: 'read_paper', provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, reported: true },
      { school_id: SCHOOL, class_id: CLASS, child_id: CHILD, test_id: TEST, session_id: null, lesson_id: null, job: 'read_paper', provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free', prompt_tokens: null, completion_tokens: null, total_tokens: null, reported: false },
    ])
  })

  test('the ids the step was given are used as they are, and a learner only step finds its class through the enrolment', async () => {
    const calls = database()
    await withUsage('write_lesson', jobCalling(REPORTED))(context(), EVENT, { childId: CHILD, sessionId: SESSION })
    expect(usageWrites(calls)[0]!.body).toMatchObject([{ job: 'write_lesson', child_id: CHILD, session_id: SESSION, class_id: CLASS, test_id: null }])
  })

  test('a step with no model call (a recorded answer, or code only) writes nothing and asks the database nothing', async () => {
    const calls = database()
    await withUsage('diagnose', jobCalling())(context(), EVENT, { childId: CHILD })
    expect(calls).toEqual([])
  })

  test('the job sees the reporter on its env, and the env the caller passed in is left as it was', async () => {
    database()
    const ctx = context()
    const seen: unknown[] = []
    await withUsage('guidance', async (c) => void seen.push(c.env.onUsage))(ctx, EVENT, { childId: CHILD })
    expect(typeof seen[0]).toBe('function')
    expect(ctx.env.onUsage).toBeUndefined()
  })

  test('an insert error does not fail the job: the job result is the same, and one line is logged', async () => {
    const calls = database(() => json({ code: '42P01', message: 'relation "public.ai_usage" does not exist' }, 404))
    const run = jobCalling(REPORTED)
    await expect(withUsage('class_report', run)(context(), EVENT, { classId: CLASS, testId: TEST })).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledTimes(1)
    expect(usageWrites(calls)).toHaveLength(1) // not retried
    expect(errors).toHaveBeenCalledTimes(1)
    expect(String(errors.mock.calls[0]![0])).toContain('ai_usage')
  })

  test('the error is logged once however many steps fail to save', async () => {
    database(() => json({ message: 'permission denied for table ai_usage' }, 403))
    for (let i = 0; i < 4; i++) await withUsage('diagnose', jobCalling(REPORTED))(context(), EVENT, { childId: CHILD })
    expect(errors).toHaveBeenCalledTimes(1)
  })

  test('a network failure on the insert does not fail the job either', async () => {
    database(() => {
      throw new TypeError('fetch failed')
    })
    await expect(withUsage('guidance', jobCalling(REPORTED))(context(), EVENT, { childId: CHILD })).resolves.toBeUndefined()
    expect(errors).toHaveBeenCalledTimes(1)
  })

  test('a database that never answers does not hold the job: it ends after the wait that was set', async () => {
    database(() => new Promise<Response>(() => undefined))
    const started = Date.now()
    await withUsage('guidance', jobCalling(REPORTED), { waitMs: 30 })(context(), EVENT, { childId: CHILD })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(errors).toHaveBeenCalledTimes(1)
  })

  test('a job that fails still has the usage of its calls saved, and its own error goes up unchanged', async () => {
    const calls = database()
    const boom = new Error('the model answered nonsense')
    const run = vi.fn(async (ctx: ToolContext) => {
      ctx.env.onUsage?.(REPORTED)
      throw boom
    })
    await expect(withUsage('diagnose', run)(context(), EVENT, { childId: CHILD })).rejects.toBe(boom)
    expect(usageWrites(calls)).toHaveLength(1)
  })

  test('ids that cannot be looked up still save the row: the unknown ones are null', async () => {
    const calls = database(undefined, () => json({ message: 'the database is down' }, 500))
    await withUsage('read_paper', jobCalling(REPORTED))(context(), EVENT, { paperId: PAPER })
    const writes = usageWrites(calls)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.body).toMatchObject([{ school_id: SCHOOL, job: 'read_paper', class_id: null, child_id: null, test_id: null, total_tokens: 150 }])
  })
})
