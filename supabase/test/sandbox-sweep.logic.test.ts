import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JemmaDb } from '../../packages/profiling/src/db'
import { sweepOldSandboxes } from '../seed/teardown'

// The rules of the sweep, with the database as an in-memory double: no network, nothing real can be reached.
// The same rules run against real rows in sandbox-sweep.test.ts.

const DAY = 24 * 60 * 60_000
const NOW = new Date('2026-11-20T12:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

type Box = { id: string; school_id: string; created_at: string; stage?: string; users: Record<string, string | null | 'unreadable'> }

/** A sandbox row with three users. `users` maps a user id to the last sign-in time (null: never; 'unreadable': the lookup fails). */
function box(n: number, ageDays: number, users: Partial<Record<'teacher' | 'parent' | 'learner', string | null | 'unreadable'>> = {}): Box {
  return {
    id: `sandbox-${n}`,
    school_id: `school-${n}`,
    created_at: ago(ageDays),
    users: { [`t${n}`]: users.teacher ?? null, [`p${n}`]: users.parent ?? null, [`l${n}`]: users.learner ?? null },
  }
}
const loginsOf = (b: Box) => {
  const [t, p, l] = Object.keys(b.users)
  return { teacher: { userId: t }, parent: { userId: p }, learner: { userId: l } }
}

/** The calls the sweep and the teardown make. It records every school deleted and every user deleted. */
function fakeAdmin(boxes: Box[], opts: { activity?: Record<string, string>; failSchool?: string } = {}) {
  const schoolsDeleted: string[] = []
  const usersDeleted: string[] = []
  const lookedAt: string[][] = []
  const rows = () => boxes.map((b) => ({ id: b.id, school_id: b.school_id, created_at: b.created_at, logins: loginsOf(b), stage: b.stage ?? 'start' }))

  const builder = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = []
    let order: { col: string; asc: boolean } | null = null
    let max = Infinity
    let op: 'select' | 'delete' | 'update' = 'select'
    const eqs: Record<string, unknown> = {}
    const q = {
      select: () => q,
      update: () => ((op = 'update'), q),
      delete: () => ((op = 'delete'), q),
      eq: (k: string, v: unknown) => ((eqs[k] = v), filters.push((r) => r[k] === v), q),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), q),
      // The teardown also reads the learners and staff of the school (tables this double leaves empty): `.not(col, 'is', null)`.
      not: (k: string, _op: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
      lt: (k: string, v: string) => (filters.push((r) => String(r[k]) < v), q),
      gt: (k: string, v: string) => (filters.push((r) => String(r[k]) > v), q),
      order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), q),
      limit: (n: number) => ((max = n), q),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (op === 'delete' && table === 'schools') {
          const target = String(eqs.id)
          schoolsDeleted.push(target)
          // A failure of the network, as `fetch` raises it.
          if (target === opts.failSchool) return Promise.reject(new Error('network down')).then(resolve, reject)
        }
        return Promise.resolve({ data: run(), error: null }).then(resolve, reject)
      },
    }
    function run(): Record<string, unknown>[] {
      let list: Record<string, unknown>[] = []
      if (table === 'demo_sandboxes') list = rows()
      else if (table === 'activity_log') list = Object.entries(opts.activity ?? {}).map(([school_id, created_at]) => ({ school_id, created_at, id: `log-${school_id}` }))
      list = list.filter((r) => filters.every((f) => f(r)))
      if (order) list = [...list].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1))
      if (table === 'demo_sandboxes' && op === 'select') lookedAt.push(list.slice(0, max).map((r) => String(r.id)))
      return list.slice(0, max)
    }
    return q
  }

  const userById = new Map(boxes.flatMap((b) => Object.entries(b.users)))
  const admin = {
    from: builder,
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: null, error: null }) }) },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const seen = userById.get(id)
          if (seen === 'unreadable') throw new Error('cannot read this user')
          return { data: { user: { id, last_sign_in_at: seen ?? null } }, error: null }
        },
        deleteUser: async (id: string) => (usersDeleted.push(id), { data: null, error: null }),
      },
    },
  }
  return { admin: admin as unknown as JemmaDb, schoolsDeleted, usersDeleted, lookedAt }
}

afterEach(() => vi.restoreAllMocks())

describe('sweepOldSandboxes', () => {
  test('removes an old sandbox nobody used, with its school and its three users', async () => {
    const f = fakeAdmin([box(1, 10)])
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual(['sandbox-1'])
    expect(f.schoolsDeleted).toEqual(['school-1'])
    expect(f.usersDeleted.sort()).toEqual(['l1', 'p1', 't1'])
  })

  test('keeps a sandbox younger than the cutoff', async () => {
    const f = fakeAdmin([box(1, 6.9), box(2, 1), box(3, 0)])
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual([])
    expect(f.schoolsDeleted).toEqual([])
  })

  test('keeps an old sandbox whose school has activity after the cutoff, and removes one whose activity is older', async () => {
    const f = fakeAdmin([box(1, 10), box(2, 10)], { activity: { 'school-1': ago(2), 'school-2': ago(9) } })
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual(['sandbox-2'])
    expect(f.schoolsDeleted).toEqual(['school-2'])
  })

  test('keeps an old sandbox when any one of its three users signed in after the cutoff', async () => {
    const f = fakeAdmin([
      box(1, 10, { teacher: ago(3) }),
      box(2, 10, { parent: ago(1) }),
      box(3, 10, { learner: ago(6.5) }),
      box(4, 10, { teacher: ago(8), parent: ago(30), learner: null }), // all older than the cutoff
    ])
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual(['sandbox-4'])
  })

  test('a user that cannot be read counts as not signed in', async () => {
    const f = fakeAdmin([box(1, 10, { teacher: 'unreadable', parent: 'unreadable', learner: 'unreadable' })])
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual(['sandbox-1'])
  })

  test('removes at most `limit`, oldest first, and leaves the rest for the next call', async () => {
    const boxes = [box(1, 40), box(2, 30), box(3, 20), box(4, 50), box(5, 10), box(6, 60), box(7, 15)]
    const f = fakeAdmin(boxes)
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual(['sandbox-6', 'sandbox-4', 'sandbox-1', 'sandbox-2', 'sandbox-3'])
    expect(f.schoolsDeleted).toHaveLength(5)
    const g = fakeAdmin(boxes)
    expect(await sweepOldSandboxes(g.admin, { now: NOW, limit: 2 })).toEqual(['sandbox-6', 'sandbox-4'])
  })

  test('looks at 20 old sandboxes a call: a kept one does not use up the limit, and a run of kept ones stops the look at 20', async () => {
    const active = Array.from({ length: 22 }, (_, i) => box(i + 1, 100 - i, { teacher: ago(1) })) // the 22 oldest are all in use
    const idle = box(99, 8)
    const f = fakeAdmin([...active, idle])
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual([]) // the idle one is the 23rd by age: not looked at this time
    expect(f.lookedAt[0]).toHaveLength(20)
    const g = fakeAdmin([...active.slice(0, 3), idle])
    expect(await sweepOldSandboxes(g.admin, { now: NOW })).toEqual(['sandbox-99'])
  })

  test('one sandbox that fails to delete is logged and skipped, and the sweep goes on', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeAdmin([box(1, 30), box(2, 20), box(3, 10)], { failSchool: 'school-2' })
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual(['sandbox-1', 'sandbox-3'])
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toContain('sandbox-2')
  })

  test('the school it removes is the one named in the sandbox row, never another school', async () => {
    const f = fakeAdmin([box(1, 10), box(2, 10)])
    await sweepOldSandboxes(f.admin, { now: NOW, onlySandboxIds: ['sandbox-1'] })
    expect(f.schoolsDeleted).toEqual(['school-1'])
  })

  test('onlySandboxIds limits the look to those ids: another sandbox is never reached, an unknown id removes nothing', async () => {
    const f = fakeAdmin([box(1, 10), box(2, 10), box(3, 10)])
    expect(await sweepOldSandboxes(f.admin, { now: NOW, onlySandboxIds: ['sandbox-2'] })).toEqual(['sandbox-2'])
    expect(f.schoolsDeleted).toEqual(['school-2'])
    const g = fakeAdmin([box(1, 10)])
    expect(await sweepOldSandboxes(g.admin, { now: NOW, onlySandboxIds: ['a-school-with-no-sandbox-row'] })).toEqual([])
    expect(await sweepOldSandboxes(g.admin, { now: NOW, onlySandboxIds: [] })).toEqual([])
    expect(g.schoolsDeleted).toEqual([])
  })

  test('a cutoff that is not above zero, or a limit of zero, removes nothing', async () => {
    const f = fakeAdmin([box(1, 400)])
    for (const opts of [{ olderThanDays: 0 }, { olderThanDays: -3 }, { olderThanDays: Number.NaN }, { olderThanDays: Infinity }, { limit: 0 }]) {
      expect(await sweepOldSandboxes(f.admin, { now: NOW, ...opts })).toEqual([])
    }
    expect(f.schoolsDeleted).toEqual([])
  })

  test('the cutoff counts days back from `now`, and `olderThanDays` moves it', async () => {
    const f = fakeAdmin([box(1, 3)])
    expect(await sweepOldSandboxes(f.admin, { now: NOW })).toEqual([])
    expect(await sweepOldSandboxes(f.admin, { now: NOW, olderThanDays: 2 })).toEqual(['sandbox-1'])
  })
})
