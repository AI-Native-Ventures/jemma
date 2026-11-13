import { afterEach, describe, expect, test, vi } from 'vitest'
import { failEvent } from '../src/consumer'
import type { Env } from '../src/env'

// The last queue delivery blew up: failEvent ends the event failed, and when it was the read of a paper's photo the paper says so too.
// No network and no database: `fetch` answers for the database, and the calls are kept so the test can read them.

afterEach(() => vi.restoreAllMocks())

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const TEST = '33333333-3333-4333-8333-333333333333'
const TEACHER = '44444444-4444-4444-8444-444444444444'
const PAPER = '77777777-7777-4777-8777-777777777777'
const EVENT = '99999999-9999-4999-8999-999999999999'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const env = { SUPABASE_URL: 'http://localhost:1', SUPABASE_SERVICE_ROLE_KEY: 'x' } as unknown as Env

type Call = { method: string; table: string; search: URLSearchParams; body: unknown }

/** Answers like the tables of a school with one teacher's paper. `ended` is what the write of the event gives back. */
function setup(ended: unknown[], paperStatus = 'reading') {
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const table = url.pathname.split('/').pop()!
    calls.push({ method, table, search: url.searchParams, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null })
    const accept = new Headers(init?.headers).get('accept') ?? ''
    const rows: Record<string, unknown[]> = {
      events: ended,
      papers: [{ id: PAPER, test_id: TEST, child_id: null, status: paperStatus }],
      tests: [{ id: TEST, class_id: CLASS, title: 'Class Test 1: Fractions', held: true }],
      classes: [{ id: CLASS, school_id: SCHOOL, teacher_id: TEACHER }],
    }
    const found = rows[table] ?? []
    if (method === 'GET') return json(accept.includes('pgrst.object') ? (found[0] ?? null) : found, accept.includes('pgrst.object') && !found[0] ? 406 : 200)
    return json(method === 'DELETE' || method === 'PATCH' || method === 'POST' ? (table === 'events' ? found : [{ id: 'x' }]) : [])
  })
  return calls
}
const writes = (calls: Call[], table: string, method: string) => calls.filter((c) => c.table === table && c.method === method)

describe('failEvent', () => {
  test("a paper's read that fails on the last delivery ends the event failed and the paper needs a retake", async () => {
    const calls = setup([{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', payload: { paperId: PAPER } }])
    await failEvent(env, EVENT, 'the queue gave up')
    const event = writes(calls, 'events', 'PATCH')[0]!
    expect(event.body).toMatchObject({ status: 'failed', error: 'the queue gave up' })
    expect(event.search.get('id')).toBe(`eq.${EVENT}`)
    expect(event.search.get('status')).toBe('in.(queued,running)')
    expect(writes(calls, 'papers', 'PATCH')[0]!.body).toEqual({ status: 'needs_you', error: 'read_failed', name_read: null })
    expect(writes(calls, 'needs_you_items', 'POST')[0]!.body).toMatchObject({ owner_id: TEACHER, kind: 'confirm_scan', ref_id: PAPER, title: 'Jemma could not read this photo' })
  })

  test('an event of another kind is ended failed and nothing else is touched', async () => {
    const calls = setup([{ id: EVENT, school_id: SCHOOL, type: 'key.snapped', payload: { testId: TEST } }])
    await failEvent(env, EVENT, 'the queue gave up')
    expect(writes(calls, 'events', 'PATCH')).toHaveLength(1)
    expect(calls.filter((c) => c.table !== 'events')).toEqual([])
  })

  test('an event that is no longer queued or running (it finished, or was cancelled) leaves its paper alone', async () => {
    const calls = setup([])
    await failEvent(env, EVENT, 'the queue gave up')
    expect(calls.filter((c) => c.table !== 'events')).toEqual([])
  })

  test('a paper that is already marked is left alone', async () => {
    const calls = setup([{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', payload: { paperId: PAPER } }], 'marked')
    await failEvent(env, EVENT, 'the queue gave up')
    expect(writes(calls, 'papers', 'PATCH')).toEqual([])
    expect(writes(calls, 'needs_you_items', 'POST')).toEqual([])
  })
})
