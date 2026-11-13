// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A teacher's retry starts fresh: the stuck-jobs check counts `payload.revived`, and an event the teacher asks for again gets its two
// revivals again. The database is in memory and `fetch` is the agent's stand-in: no network.

type Row = Record<string, unknown>
/** The events table in memory, with the few calls `retryEvent` makes: select, update, eq, maybeSingle and awaiting the query. */
function memoryDb(seed: Row[]) {
  const tables = { events: seed.map((r) => ({ ...r })) }
  const from = (name: 'events') => {
    const filters: ((r: Row) => boolean)[] = []
    let patch: Row | null = null
    const hit = () => tables[name].filter((r) => filters.every((f) => f(r)))
    const q = {
      select: () => q,
      update: (p: Row) => ((patch = p), q),
      eq: (key: string, value: unknown) => (filters.push((r) => r[key] === value), q),
      maybeSingle: async () => ({ data: hit()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const rows = hit()
        if (patch) for (const r of rows) Object.assign(r, patch)
        return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(resolve, reject)
      },
    }
    return q
  }
  return { from, tables }
}
type MemoryDb = ReturnType<typeof memoryDb>
const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@jemma/profiling/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@jemma/profiling/db')>()), createServiceClient: () => state.db }))

import { retryEvent } from '../lib/agent'

const EVENT = '99999999-9999-4999-8999-999999999999'
const row = (over: Record<string, unknown> = {}) => ({
  id: EVENT,
  school_id: 's1',
  type: 'key.snapped',
  status: 'failed',
  error: 'Jemma stopped answering. Try again.',
  attempts: 3,
  finished_at: '2026-11-13T09:00:00.000Z',
  payload: { testId: 't1', revived: 2, progress: { job: 'read_key', step: 1, done: 0 } },
  ...over,
})
let db: MemoryDb
let posted: unknown[]

beforeEach(() => {
  process.env.AGENT_URL = 'http://agent.test'
  process.env.EVENTS_SECRET = 'secret'
  posted = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    posted.push(JSON.parse(String(init?.body)))
    return new Response('{"queued":true}', { status: 202 })
  })
})
afterEach(() => vi.restoreAllMocks())

const seed = (rows: Record<string, unknown>[]) => {
  db = memoryDb(rows)
  state.db = db
}

describe('retryEvent', () => {
  it('puts a failed event back to queued, takes revived out of the payload and keeps the rest', async () => {
    seed([row()])
    await retryEvent(EVENT)
    expect(db.tables.events![0]).toMatchObject({ status: 'queued', error: null, finished_at: null, payload: { testId: 't1', progress: { job: 'read_key', step: 1, done: 0 } } })
    expect(db.tables.events![0]!.payload).not.toHaveProperty('revived')
    expect(posted).toEqual([{ eventId: EVENT }])
  })

  it('leaves a payload that has no revived exactly as it was', async () => {
    seed([row({ payload: { paperId: 'p1' } })])
    await retryEvent(EVENT)
    expect(db.tables.events![0]!.payload).toEqual({ paperId: 'p1' })
    expect(db.tables.events![0]!.status).toBe('queued')
  })

  it('does not touch another event, and an event that is not failed is refused and not posted', async () => {
    seed([row({ status: 'running' }), row({ id: 'other', payload: { testId: 't2', revived: 1 } })])
    await expect(retryEvent(EVENT)).rejects.toThrow('retryEvent: event is not failed')
    expect(posted).toEqual([])
    expect(db.tables.events![0]!.payload).toMatchObject({ revived: 2 })
    expect(db.tables.events![1]!.payload).toMatchObject({ revived: 1 })
  })

  it('an event that does not exist is refused too', async () => {
    seed([])
    await expect(retryEvent(EVENT)).rejects.toThrow('retryEvent: event is not failed')
    expect(posted).toEqual([])
  })
})
