// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `own_test.snapped` through `sendEvent`: the event is stored in the school of the learner it names (the learner's own twin can sit in a school
// of their own), and the agent is told about it. The database is in memory and `fetch` is the agent's stand-in: no network.

type Row = Record<string, unknown>
function memoryDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let added: Row | null = null
    const hit = () => (tables[name] ??= []).filter((r) => filters.every((f) => f(r)))
    const q = {
      select: () => q,
      insert: (row: Row) => {
        added = { id: `event-${(tables[name] ??= []).length + 1}`, ...row }
        tables[name]!.push(added)
        return q
      },
      eq: (key: string, value: unknown) => (filters.push((r) => r[key] === value), q),
      single: async () => {
        const rows = added ? [added] : hit()
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row of ${name}, found ${rows.length}` } }
      },
    }
    return q
  }
  return { from, tables }
}
const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@jemma/profiling/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@jemma/profiling/db')>()), createServiceClient: () => state.db }))

import { sendEvent } from '../lib/agent'

const TWIN_SCHOOL = 'personal-school'
const TWIN = 'twin-child'
const PAPER = 'paper-1'
let db: ReturnType<typeof memoryDb>
let posted: unknown[]

beforeEach(() => {
  process.env.AGENT_URL = 'http://agent.test'
  process.env.EVENTS_SECRET = 'secret'
  posted = []
  db = memoryDb({
    children: [{ id: TWIN, school_id: TWIN_SCHOOL }],
    papers: [{ id: PAPER, child_id: TWIN, test_id: null }],
  })
  state.db = db
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    posted.push(JSON.parse(String(init?.body)))
    return new Response('{"queued":true}', { status: 202 })
  })
})
afterEach(() => vi.restoreAllMocks())

describe('sendEvent own_test.snapped', () => {
  it('stores the event in the school of the learner it names, with its payload, and tells the agent', async () => {
    const id = await sendEvent('own_test.snapped', { childId: TWIN, paperId: PAPER })
    expect(db.tables.events).toHaveLength(1)
    expect(db.tables.events![0]).toMatchObject({ school_id: TWIN_SCHOOL, type: 'own_test.snapped', payload: { childId: TWIN, paperId: PAPER } })
    expect(posted).toEqual([{ eventId: id }])
  })

  it('refuses an event with no paper, before anything is stored', async () => {
    await expect(sendEvent('own_test.snapped', { childId: TWIN } as never)).rejects.toThrow()
    expect(db.tables.events ?? []).toHaveLength(0)
    expect(posted).toEqual([])
  })

  it('refuses a learner that does not exist', async () => {
    await expect(sendEvent('own_test.snapped', { childId: 'nobody', paperId: PAPER })).rejects.toThrow('sendEvent')
    expect(db.tables.events ?? []).toHaveLength(0)
  })
})
