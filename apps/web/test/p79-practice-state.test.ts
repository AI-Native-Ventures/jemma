// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// The state of "Practise now" on the learner's home is worked out from three facts and nothing else, so every row of its table is tested here
// with no database: the status of the newest practice.requested event of the learner (or none), whether there is a session to start tonight,
// and the cheap check "the learner can practise".

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({}) }))

import { lessonHasQuestions, practiceState, type PracticeState } from '../lib/data/p27'

type Row = { event: string | null; session: boolean; canPractise: boolean; expected: PracticeState }

// Every combination: 6 kinds of newest event (queued, running, failed, none, done, cancelled) x a session to start or not x can practise or not.
const table: Row[] = [
  // a practice that is queued or running is `writing`, whatever else is true
  ...['queued', 'running'].flatMap((event) => [true, false].flatMap((session) => [true, false].map((canPractise) => ({ event, session, canPractise, expected: 'writing' as const })))),
  // a practice that failed: `failed` when there is no session to start tonight, else the home is as it would be without it
  { event: 'failed', session: false, canPractise: true, expected: 'failed' },
  { event: 'failed', session: false, canPractise: false, expected: 'failed' },
  { event: 'failed', session: true, canPractise: true, expected: 'ready' },
  { event: 'failed', session: true, canPractise: false, expected: 'none' },
  // no event, or one that is over (done, cancelled): `ready` when the learner can practise, else `none`
  ...[null, 'done', 'cancelled'].flatMap((event) => [true, false].flatMap((session) => [{ event, session, canPractise: true, expected: 'ready' as const }, { event, session, canPractise: false, expected: 'none' as const }])),
]

describe('practiceState: every row of the table', () => {
  it('the table covers 6 kinds of event, a session or not, and can practise or not (24 rows)', () => {
    expect(table).toHaveLength(24)
    expect(new Set(table.map((r) => `${r.event}|${r.session}|${r.canPractise}`)).size).toBe(24)
  })

  for (const row of table) {
    it(`event ${String(row.event)}, session ${row.session}, can practise ${row.canPractise}: ${row.expected}`, () => {
      expect(practiceState({ event: row.event, session: row.session, canPractise: row.canPractise })).toBe(row.expected)
    })
  }
})

describe('lessonHasQuestions', () => {
  it('a lesson with questions has them, a placeholder or an empty list has none', () => {
    expect(lessonHasQuestions({ questions: [{ n: 1 }] })).toBe(true)
    expect(lessonHasQuestions({})).toBe(false)
    expect(lessonHasQuestions({ questions: [] })).toBe(false)
    expect(lessonHasQuestions({ questions: 'x' })).toBe(false)
    expect(lessonHasQuestions(null)).toBe(false)
    expect(lessonHasQuestions(undefined)).toBe(false)
  })
})
