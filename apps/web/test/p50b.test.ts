import { describe, expect, it } from 'vitest'
import { dateTimeLabel, getShareCard, getShareState, shareCardOf } from '@/lib/data/p50b'
import type { JemmaDb } from '@jemma/profiling/db'

const paper = (status: string, child: string | null = 'c') => ({ status, child_id: child })

describe('shareCardOf', () => {
  it('shows nothing for a test that is not held', () => {
    expect(shareCardOf('t', false, [paper('marked')])).toBeNull()
  })

  it('shows nothing while no paper is marked yet', () => {
    expect(shareCardOf('t', true, [paper('queued'), paper('reading'), paper('needs_you')])).toBeNull()
    expect(shareCardOf('t', true, [])).toBeNull()
  })

  it('counts marked papers that have a learner, and the papers that still wait in Needs you', () => {
    expect(shareCardOf('t', true, [paper('marked'), paper('marked'), paper('marked', null), paper('needs_you'), paper('queued')])).toEqual({ testId: 't', marked: 2, waiting: 1 })
  })
})

describe('dateTimeLabel', () => {
  it('writes the day and the clock in South African time', () => {
    expect(dateTimeLabel('2026-11-10T07:30:00+00:00')).toBe('Tue 10 Nov 09:30')
    expect(dateTimeLabel('2026-11-10T22:15:00+00:00')).toBe('Wed 11 Nov 00:15')
  })
})

/** Rows for `tests`, `papers`, `approvals` and `profiles`, filtered the way the calls ask. */
function dbWith(tables: Record<string, Record<string, unknown>[]>): JemmaDb {
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = []
    let limit = Infinity
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit)
    const q = {
      select: () => q,
      order: () => q,
      limit: (n: number) => {
        limit = n
        return q
      },
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v)
        return q
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]))
        return q
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    }
    return q
  }
  return { from } as unknown as JemmaDb
}

describe('getShareCard (class home)', () => {
  it('picks the newest held test that has a marked paper', async () => {
    const db = dbWith({
      tests: [{ id: 'new', class_id: 'k', held: true }, { id: 'old', class_id: 'k', held: true }, { id: 'done', class_id: 'k', held: false }],
      papers: [
        { test_id: 'new', status: 'queued', child_id: 'a' },
        { test_id: 'old', status: 'marked', child_id: 'a' },
        { test_id: 'old', status: 'needs_you', child_id: 'b' },
        { test_id: 'done', status: 'marked', child_id: 'a' },
      ],
    })
    expect(await getShareCard('k', db)).toEqual({ testId: 'old', marked: 1, waiting: 1 })
  })

  it('is null when every test is shared', async () => {
    expect(await getShareCard('k', dbWith({ tests: [{ id: 'done', class_id: 'k', held: false }], papers: [] }))).toBeNull()
  })
})

describe('getShareState (test page and progress page)', () => {
  const base = { id: 't', class_id: 'k' }

  it('gives the card while the test is held and has a marked paper', async () => {
    const db = dbWith({ tests: [{ ...base, held: true, shared_at: null, shared_by: null }], papers: [{ test_id: 't', status: 'marked', child_id: 'a' }] })
    expect(await getShareState('k', 't', db)).toEqual({ card: { testId: 't', marked: 1, waiting: 0 }, sharedLine: null })
  })

  it('gives the quiet line with the name kept with the approval, once the test is shared', async () => {
    const db = dbWith({
      tests: [{ ...base, held: false, shared_at: '2026-11-10T07:30:00+00:00', shared_by: 'u1' }],
      approvals: [{ kind: 'share_results', ref_id: 't', decided_by_name: 'Ms Banda', decided_at: '2026-11-10T07:30:00+00:00' }],
    })
    expect(await getShareState('k', 't', db)).toEqual({ card: null, sharedLine: 'Shared with parents by Ms Banda, Tue 10 Nov 09:30' })
  })

  it('falls back to the profile of the person who shared when the approval is missing', async () => {
    const db = dbWith({ tests: [{ ...base, held: false, shared_at: '2026-11-10T07:30:00+00:00', shared_by: 'u1' }], profiles: [{ user_id: 'u1', display_name: 'Ms Banda' }] })
    expect((await getShareState('k', 't', db)).sharedLine).toBe('Shared with parents by Ms Banda, Tue 10 Nov 09:30')
  })

  it('shows neither for a test that was never held', async () => {
    const db = dbWith({ tests: [{ ...base, held: false, shared_at: null, shared_by: null }] })
    expect(await getShareState('k', 't', db)).toEqual({ card: null, sharedLine: null })
  })

  it('shows neither for a test that is not in this class', async () => {
    expect(await getShareState('k', 'nope', dbWith({ tests: [] }))).toEqual({ card: null, sharedLine: null })
  })
})
