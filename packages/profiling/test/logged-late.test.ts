import { describe, expect, test } from 'vitest'
import { isBroughtIn, isLoggedLate, LATE_AFTER_DAYS } from '../src/logic'
import { loadHistory } from '../src/tools/read/get-learner-history'
import type { ToolContext } from '../src/tools/context'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// "Logged late" (decision 3 of P73): a record written more than 60 days after it happened, unless a teacher brought it in through
// "Add past records". A record that came in from a file or was typed in by hand is written long after it happened by nature.

/** The tool reads `question_results` with `.not(...)`, which the in-memory database does not know. Nothing here has an answer, so it filters nothing. */
function withNot(db: MemoryDb): MemoryDb {
  const from = db.from.bind(db) as unknown as (t: string) => Record<string, unknown>
  return { ...db, from: (t: string) => Object.assign(from(t), { not() { return this } }) } as unknown as MemoryDb
}

const record = (over: Record<string, unknown>) => ({
  id: 'r',
  child_id: 'kid-1',
  source: 'quiz',
  grade: 5,
  year: 2025,
  term: 1,
  happened_on: '2025-03-04',
  // 400 days later.
  logged_at: '2026-04-08T10:00:00Z',
  teacher_name: 'Mrs Naidoo',
  title: 'Quiz',
  family: 'fractions',
  subject: 'Mathematics',
  topic_name: null,
  marks: 6,
  out_of: 10,
  quality: 'clear',
  text: null,
  present: null,
  total: null,
  import_id: null,
  source_row: null,
  added_by: null,
  added_by_name: null,
  ...over,
})

const ctxOf = (rows: ReturnType<typeof record>[]): ToolContext =>
  ({ db: withNot(memoryDb({ children: [{ id: 'kid-1', first_name: 'Amina', grade: 6 }], learner_records: rows, question_results: [], observations: [] })) }) as unknown as ToolContext

describe('the rule', () => {
  test('60 days is the line, and a seeded record over it is late', () => {
    expect(LATE_AFTER_DAYS).toBe(60)
    expect(isLoggedLate({ happenedOn: '2025-03-01', loggedAt: '2025-04-30T00:00:00Z' })).toBe(false)
    expect(isLoggedLate({ happenedOn: '2025-03-01', loggedAt: '2025-05-01T00:00:00Z' })).toBe(true)
    expect(isLoggedLate({ happenedOn: '2025-03-04', loggedAt: '2026-04-08T10:00:00Z' })).toBe(true)
  })

  test('a record from a file, or one typed by hand, is brought in; a seeded record is not', () => {
    expect(isBroughtIn({ importId: 'imp-1' })).toBe(true)
    expect(isBroughtIn({ addedBy: 'user-1' })).toBe(true)
    expect(isBroughtIn({ addedByName: 'Ms Banda' })).toBe(true)
    expect(isBroughtIn({})).toBe(false)
    expect(isBroughtIn({ importId: null, addedBy: null, addedByName: null })).toBe(false)
  })

  test('a record that was brought in is never late, however old it is', () => {
    const old = { happenedOn: '2025-03-04', loggedAt: '2026-04-08T10:00:00Z' }
    expect(isLoggedLate({ ...old, importId: 'imp-1' })).toBe(false)
    expect(isLoggedLate({ ...old, addedBy: 'user-1' })).toBe(false)
    expect(isLoggedLate({ ...old })).toBe(true)
  })
})

describe('get_learner_history: loggedLate', () => {
  test('a seeded record 400 days old is listed; one from a file and one typed by hand, just as old, are not', async () => {
    const { history } = await loadHistory(
      ctxOf([
        record({ id: 'seed', title: 'Seeded quiz' }),
        record({ id: 'file', title: 'File quiz', term: 2, happened_on: '2025-05-04', import_id: 'imp-1', source_row: 4, added_by: 'user-1', added_by_name: 'Ms Banda' }),
        record({ id: 'typed', title: 'Typed quiz', term: 3, happened_on: '2025-08-04', added_by: 'user-1', added_by_name: 'Ms Banda' }),
      ]),
      'kid-1',
    )
    expect(history.loggedLate.map((x) => x.id)).toEqual(['seed'])
  })

  test('the brought-in records still count in the table', async () => {
    const { history } = await loadHistory(
      ctxOf([
        record({ id: 'a', happened_on: '2025-03-04', marks: 3, out_of: 10, import_id: 'imp-1', added_by: 'user-1', added_by_name: 'Ms Banda' }),
        record({ id: 'b', term: 2, happened_on: '2025-05-04', marks: 4, out_of: 10, import_id: 'imp-1', added_by: 'user-1', added_by_name: 'Ms Banda' }),
      ]),
      'kid-1',
    )
    expect(history.loggedLate).toEqual([])
    expect(history.subjects[0]!.families[0]!.bySlot.map((s) => [s.term, s.percent])).toEqual([
      [1, 30],
      [2, 40],
    ])
  })
})
