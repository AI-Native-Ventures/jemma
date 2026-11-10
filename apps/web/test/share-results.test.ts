import type { JemmaDb } from '@jemma/profiling/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareResults, type ShareDeps } from '@/lib/share-results'

// "Share with parents": what the action does, with the database as an in-memory double. The real rows are checked in
// supabase/test/share-gate.actions.test.ts. Nothing here talks to an agent or a model.

type Row = Record<string, unknown>
type State = { classes: Row[]; tests: Row[]; papers: Row[]; parent_links: Row[]; profiles: Row[]; approvals: Row[]; notifications: Row[] }

const CLASS = 'class-1'
const TEST = 'test-1'
const SCHOOL = 'school-1'
const TEACHER = 'teacher-1'
const [AMINA, THABO, SIPHO, LERATO] = ['amina', 'thabo', 'sipho', 'lerato']

function fresh(over: Partial<State> = {}): State {
  return {
    classes: [{ id: CLASS, school_id: SCHOOL }],
    tests: [{ id: TEST, class_id: CLASS, title: 'Class Test 1', out_of: 10, held: true, shared_at: null, shared_by: null }],
    papers: [
      { id: 'p1', test_id: TEST, child_id: AMINA, status: 'marked', total: 6, created_at: '2026-11-10T08:00:00Z' },
      { id: 'p2', test_id: TEST, child_id: THABO, status: 'marked', total: 8, created_at: '2026-11-10T08:01:00Z' },
      { id: 'p3', test_id: TEST, child_id: SIPHO, status: 'needs_you', total: 5, created_at: '2026-11-10T08:02:00Z' },
      { id: 'p4', test_id: TEST, child_id: null, status: 'marked', total: 3, created_at: '2026-11-10T08:03:00Z' },
    ],
    parent_links: [
      { parent_id: 'thandi', child_id: AMINA, status: 'approved' },
      { parent_id: 'pending-mum', child_id: AMINA, status: 'pending' },
      { parent_id: 'declined-dad', child_id: THABO, status: 'declined' },
      { parent_id: 'sipho-mum', child_id: SIPHO, status: 'approved' }, // no marked paper yet, so nothing to tell her
      { parent_id: 'thandi', child_id: THABO, status: 'approved' }, // one parent, two learners: two messages
      { parent_id: 'lerato-mum', child_id: LERATO, status: 'approved' }, // her child has no paper in this test
    ],
    profiles: [{ user_id: TEACHER, display_name: 'Ms Banda' }],
    approvals: [],
    notifications: [],
    ...over,
  }
}

/** The few calls `shareResults` makes. `update` on `tests` only changes rows that match every filter, like the database does. */
function memoryDb(state: State, opts: { teaches?: boolean; failNotify?: boolean } = {}) {
  const calls: string[] = []
  const query = (table: keyof State) => {
    // Filters are applied when the query runs, not when it is built, so two updates at once cannot both match.
    const filters: ((r: Row) => boolean)[] = []
    const matching = () => state[table].filter((r) => filters.every((f) => f(r)))
    let patch: Row | null = null
    let inserted: Row[] | null = null
    const q = {
      select: () => q,
      order: () => q,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v)
        return q
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]))
        return q
      },
      update: (p: Row) => {
        patch = p
        return q
      },
      insert: (r: Row | Row[]) => {
        inserted = Array.isArray(r) ? r : [r]
        return q
      },
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (inserted) {
          if (table === 'notifications' && opts.failNotify) return Promise.resolve({ data: null, error: { message: 'notifications are down' } }).then(resolve, reject)
          calls.push(`insert ${table} x${inserted.length}`)
          state[table].push(...inserted)
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        }
        const rows = matching()
        if (patch) {
          calls.push(`update ${table}`)
          for (const r of rows) Object.assign(r, patch)
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return q
  }
  const db = {
    from: (table: keyof State) => query(table),
    rpc: async (name: string, args: Record<string, unknown>) => ({ data: name === 'teaches_class' && args.cls === CLASS ? (opts.teaches ?? true) : false, error: null }),
  }
  return { db: db as unknown as JemmaDb, calls }
}

function setup(state = fresh(), opts: { teaches?: boolean; failNotify?: boolean } = {}, over: Partial<ShareDeps> = {}) {
  const teacher = memoryDb(state, opts)
  const admin = memoryDb(state, opts)
  const send = vi.fn(async () => 'event-1')
  const askLongView = vi.fn(async (ids: string[]) => ({ sent: ids, skipped: [], failed: [] }))
  const deps: ShareDeps = { teacher: teacher.db, admin: admin.db, userId: TEACHER, send, askLongView, now: () => new Date('2026-11-10T09:30:00Z'), ...over }
  return { state, deps, send, askLongView, admin }
}

afterEach(() => vi.restoreAllMocks())

describe('shareResults', () => {
  it('opens the test: held off, the time and the teacher kept', async () => {
    const { state, deps } = setup()
    expect(await shareResults(deps, CLASS, TEST)).toMatchObject({ ok: true, shared: true })
    expect(state.tests[0]).toMatchObject({ held: false, shared_at: '2026-11-10T09:30:00.000Z', shared_by: TEACHER })
  })

  it('writes the approval with the teacher name and the test title', async () => {
    const { state, deps } = setup()
    await shareResults(deps, CLASS, TEST)
    expect(state.approvals).toEqual([
      { school_id: SCHOOL, kind: 'share_results', ref_id: TEST, child_id: null, decision: 'shared', decided_by: TEACHER, decided_by_name: 'Ms Banda', note: 'Class Test 1' },
    ])
  })

  it('tells approved parents of learners with a marked paper, one message per learner, with that learner mark', async () => {
    const { state, deps } = setup()
    await shareResults(deps, CLASS, TEST)
    const byParent = (id: string) => state.notifications.filter((n) => n.user_id === id).map((n) => [n.title, n.body, n.href])
    expect(byParent('thandi')).toEqual([
      ['Class Test 1 is marked', '6 out of 10', `/p/${AMINA}/tests`],
      ['Class Test 1 is marked', '8 out of 10', `/p/${THABO}/tests`],
    ])
    for (const nobody of ['pending-mum', 'declined-dad', 'sipho-mum', 'lerato-mum']) expect(byParent(nobody)).toEqual([])
    expect(state.notifications).toHaveLength(2)
  })

  it('asks for the Long view of exactly the learners with a marked paper, once, and sends test.shared once', async () => {
    const { deps, send, askLongView } = setup()
    await shareResults(deps, CLASS, TEST)
    expect(askLongView).toHaveBeenCalledTimes(1)
    expect(askLongView).toHaveBeenCalledWith([AMINA, THABO])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('test.shared', { testId: TEST })
  })

  it('sharing twice does nothing the second time: no approval, no message, no event', async () => {
    const { state, deps, send, askLongView } = setup()
    await shareResults(deps, CLASS, TEST)
    const again = await shareResults(deps, CLASS, TEST)
    expect(again).toMatchObject({ ok: true, shared: false })
    expect(state.approvals).toHaveLength(1)
    expect(state.notifications).toHaveLength(2)
    expect(send).toHaveBeenCalledTimes(1)
    expect(askLongView).toHaveBeenCalledTimes(1)
    expect(state.tests[0]!.shared_at).toBe('2026-11-10T09:30:00.000Z') // the first time stays
  })

  it('two taps at once share once', async () => {
    const { state, deps, send } = setup()
    const [a, b] = await Promise.all([shareResults(deps, CLASS, TEST), shareResults(deps, CLASS, TEST)])
    expect([a, b].filter((r) => r.ok && r.shared)).toHaveLength(1)
    expect(state.approvals).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('refuses someone who does not teach the class, and writes nothing', async () => {
    const { state, deps, send, askLongView } = setup(fresh(), { teaches: false })
    expect(await shareResults(deps, CLASS, TEST)).toEqual({ ok: false, message: 'Only the class teacher can share results.' })
    expect(state.tests[0]).toMatchObject({ held: true, shared_at: null, shared_by: null })
    expect(state.approvals).toEqual([])
    expect(state.notifications).toEqual([])
    expect(send).not.toHaveBeenCalled()
    expect(askLongView).not.toHaveBeenCalled()
  })

  it('refuses a test that is not in this class', async () => {
    const { state, deps } = setup()
    expect(await shareResults(deps, CLASS, 'some-other-test')).toEqual({ ok: false, message: 'That test is not in this class.' })
    expect(state.approvals).toEqual([])
  })

  it('refuses a test with no marked paper yet, and leaves it held', async () => {
    const waiting = fresh()
    for (const p of waiting.papers) p.status = 'needs_you'
    const { state, deps, send } = setup(waiting)
    expect(await shareResults(deps, CLASS, TEST)).toEqual({ ok: false, message: 'No paper of this test is marked yet.' })
    expect(state.tests[0]).toMatchObject({ held: true })
    expect(state.approvals).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('a paper with no learner does not count as marked', async () => {
    const nameless = fresh({ papers: [{ id: 'p9', test_id: TEST, child_id: null, status: 'marked', total: 3, created_at: '2026-11-10T08:03:00Z' }] })
    const { deps } = setup(nameless)
    expect(await shareResults(deps, CLASS, TEST)).toMatchObject({ ok: false })
  })

  it('still shares when the agent cannot be told: the fields and the approval are already written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn(async () => {
      throw new Error('agent /events answered 500')
    })
    const { state, deps, askLongView } = setup(fresh(), {}, { send })
    expect(await shareResults(deps, CLASS, TEST)).toMatchObject({ ok: true, shared: true })
    expect(state.tests[0]).toMatchObject({ held: false })
    expect(state.approvals).toHaveLength(1)
    expect(askLongView).toHaveBeenCalledTimes(1) // the Long view is asked for even when test.shared failed
  })

  it('still shares when the Long view request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const askLongView = vi.fn(async () => {
      throw new Error('boom')
    })
    const { state, deps, send } = setup(fresh(), {}, { askLongView })
    expect(await shareResults(deps, CLASS, TEST)).toMatchObject({ ok: true, shared: true })
    expect(state.approvals).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('still shares when the messages cannot be saved', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { state, deps, send, askLongView } = setup(fresh(), { failNotify: true })
    expect(await shareResults(deps, CLASS, TEST)).toMatchObject({ ok: true, shared: true })
    expect(state.tests[0]).toMatchObject({ held: false })
    expect(state.notifications).toEqual([])
    expect(spy).toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(askLongView).toHaveBeenCalledTimes(1)
  })
})
