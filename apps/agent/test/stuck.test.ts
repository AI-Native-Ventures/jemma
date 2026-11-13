import { afterEach, describe, expect, test, vi } from 'vitest'
import { checkStuck } from '../src/consumer'
import type { Env } from '../src/env'

// The every-minute check of jobs that stopped half way, wired to the queue. No network and no database: `fetch` answers for
// the database, and the queue is a double. What the check decides is tested in packages/profiling/test/stuck-events.test.ts.

afterEach(() => vi.restoreAllMocks())

const EVENT_ID = '44444444-4444-4444-8444-444444444444'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function setup(answers: { events?: unknown[]; claim?: unknown[]; fail?: boolean } = {}) {
  const send = vi.fn(async () => {})
  const env = { SUPABASE_URL: 'http://localhost:1', SUPABASE_SERVICE_ROLE_KEY: 'x', EVENTS_QUEUE: { send } } as unknown as Env
  const calls: { method: string; url: URL; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null })
    if (answers.fail) return json({ message: 'the pool is full' }, 500)
    if (url.pathname.endsWith('/events') && method === 'GET') return json(answers.events ?? [])
    if (url.pathname.endsWith('/events') && method === 'PATCH') return json(answers.claim ?? [{ id: EVENT_ID }])
    return json([])
  })
  return { env, send, calls }
}

describe('checkStuck', () => {
  test('a stuck event goes back to queued and its id is sent to the events queue, as checkOperator does', async () => {
    const { env, send, calls } = setup({ events: [{ id: EVENT_ID, attempts: 1, payload: { type: 'key.snapped', testId: 't1' } }] })
    expect(await checkStuck(env)).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ eventId: EVENT_ID })
    const read = calls.find((c) => c.method === 'GET' && c.url.pathname.endsWith('/events'))!
    expect(read.url.searchParams.get('status')).toBe('eq.running')
    expect(read.url.searchParams.get('runner')).toBe('eq.cloud')
    expect(read.url.searchParams.get('claimed_by')).toBe('is.null')
    expect(read.url.searchParams.get('created_at')).toMatch(/^lte\.\d{4}-\d{2}-\d{2}T/)
    const write = calls.find((c) => c.method === 'PATCH')!
    expect(write.body).toEqual({ status: 'queued', payload: { type: 'key.snapped', testId: 't1', revived: 1 } })
    expect(write.url.searchParams.get('status')).toBe('eq.running')
    expect(write.url.searchParams.get('id')).toBe(`eq.${EVENT_ID}`)
  })

  test('with nothing stuck it sends nothing', async () => {
    const { env, send } = setup({ events: [] })
    expect(await checkStuck(env)).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  test('a database that does not answer is logged once and never throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { env, send } = setup({ fail: true })
    await expect(checkStuck(env)).resolves.toBe(0)
    expect(send).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('stuck jobs check failed: the pool is full')
  })
})
