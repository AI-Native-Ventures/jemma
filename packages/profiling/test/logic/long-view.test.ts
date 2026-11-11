import { describe, expect, test } from 'vitest'
import {
  BANNED_WORDS,
  MIN_POINTS,
  MIN_TERMS,
  STRENGTH_FROM,
  STRUGGLE_BELOW,
  bannedWords,
  buildTable,
  compareSlots,
  findPatterns,
  historySlots,
  missingSlots,
  patternKey,
  plainDate,
  recordsForSubject,
  resultsForSubject,
  slotKey,
  slotOf,
  subjectsOf,
  termOf,
  type LongViewRecord,
  type LongViewResult,
} from '../../src/logic'

let n = 0
/** A clear, marked quiz in a family, in one slot. */
function rec(over: Partial<LongViewRecord> & { family?: string | null; year: number; term: number }): LongViewRecord {
  n++
  const month = String((over.term - 1) * 3 + 2).padStart(2, '0')
  return {
    id: `rec-${n}`,
    source: 'quiz',
    grade: 5,
    happenedOn: `${over.year}-${month}-14`,
    loggedAt: `${over.year}-${month}-16T09:00:00Z`,
    teacherName: 'Mrs Naidoo',
    title: `Quiz ${n}`,
    family: 'fractions',
    topicName: null,
    marks: 5,
    outOf: 10,
    quality: 'clear',
    text: null,
    present: null,
    total: null,
    ...over,
  }
}

/** A quiz out of 10 that scored `percent` (a multiple of 10) in the slot. */
const quiz = (year: number, term: number, percent: number, family = 'fractions') =>
  rec({ year, term, family, marks: percent / 10, outOf: 10 })

const result = (over: Partial<LongViewResult> & { id: string }): LongViewResult => ({
  correct: true,
  family: 'fractions',
  isoDate: '2026-10-05',
  label: 'Class Test 1, question 1',
  ...over,
})

const only = (records: LongViewRecord[], results: LongViewResult[] = []) => findPatterns(buildTable(records, results).table)

describe('constants', () => {
  test('the thresholds are the ones the rules page promises', () => {
    expect([STRUGGLE_BELOW, STRENGTH_FROM, MIN_TERMS, MIN_POINTS]).toEqual([50, 80, 3, 3])
  })
})

describe('terms are calendar quarters', () => {
  test.each([
    ['2026-01-01', 1],
    ['2026-03-31', 1],
    ['2026-04-01', 2],
    ['2026-06-30', 2],
    ['2026-07-01', 3],
    ['2026-09-30', 3],
    ['2026-10-01', 4],
    ['2026-12-31', 4],
  ])('termOf(%s) is %i', (date, term) => {
    expect(termOf(date)).toBe(term)
  })

  test('a full timestamp is read in UTC', () => {
    expect(termOf('2026-09-30T23:30:00-05:00')).toBe(4)
    expect(termOf('2026-04-01T00:00:00Z')).toBe(2)
    expect(slotOf('2025-11-02T10:00:00.000Z')).toEqual({ year: 2025, term: 4 })
  })

  test('a bad date throws', () => {
    expect(() => termOf('not a date')).toThrow()
  })

  test('slots sort by year then term, and the key sorts the same way', () => {
    const slots = [
      { year: 2026, term: 1 },
      { year: 2025, term: 4 },
      { year: 2025, term: 2 },
      { year: 2024, term: 3 },
    ]
    const sorted = [...slots].sort(compareSlots)
    expect(sorted.map(slotKey)).toEqual(['2024-3', '2025-2', '2025-4', '2026-1'])
    expect([...sorted.map(slotKey)].sort()).toEqual(sorted.map(slotKey))
  })

  test('plainDate says a date in words', () => {
    expect(plainDate('2025-05-14')).toBe('14 May 2025')
    expect(plainDate('2025-01-02T08:00:00Z')).toBe('2 Jan 2025')
  })
})

describe('buildTable', () => {
  test('percent is summed marks over summed out of, points is summed out of', () => {
    const { table } = buildTable(
      [rec({ year: 2025, term: 1, marks: 3, outOf: 10 }), rec({ year: 2025, term: 1, marks: 9, outOf: 20 })],
      [],
    )
    expect(table).toHaveLength(1)
    expect(table[0]!.family).toBe('fractions')
    expect(table[0]!.slots).toHaveLength(1)
    // 12 of 30 is 40, not the mean of 30 and 45.
    expect(table[0]!.slots[0]).toMatchObject({ year: 2025, term: 1, grade: 5, percent: 40, points: 30 })
    expect(table[0]!.slots[0]!.sources.map((s) => s.kind)).toEqual(['record', 'record'])
  })

  test('only quizzes, assignments and projects with a family and marks count', () => {
    const { table, notCounted } = buildTable(
      [
        rec({ year: 2025, term: 1, source: 'assignment', marks: 4, outOf: 10 }),
        rec({ year: 2025, term: 1, source: 'project', marks: 4, outOf: 10 }),
        rec({ year: 2025, term: 1, source: 'note', marks: 10, outOf: 10, text: 'Great term' }),
        rec({ year: 2025, term: 1, source: 'attendance', marks: 10, outOf: 10, present: 50, total: 60 }),
        rec({ year: 2025, term: 1, family: null, marks: 10, outOf: 10 }),
        rec({ year: 2025, term: 1, marks: null, outOf: 10 }),
        rec({ year: 2025, term: 1, marks: 5, outOf: null }),
        rec({ year: 2025, term: 1, marks: 5, outOf: 0 }),
        rec({ year: 2025, term: 1, marks: 12, outOf: 10 }),
      ],
      [],
    )
    expect(table[0]!.slots[0]).toMatchObject({ percent: 40, points: 20 })
    expect(notCounted).toEqual([])
  })

  test('an unclear record never counts and comes back in notCounted with its label', () => {
    const unclear = rec({ year: 2025, term: 2, quality: 'unclear', marks: 1, outOf: 10, title: 'Quiz on halves', teacherName: 'Mrs Naidoo', happenedOn: '2025-05-14' })
    const { table, notCounted } = buildTable([unclear, quiz(2025, 2, 90)], [])
    expect(table[0]!.slots[0]).toMatchObject({ percent: 90, points: 10 })
    expect(table[0]!.slots[0]!.sources).toHaveLength(1)
    expect(notCounted).toEqual([{ id: unclear.id, label: 'Quiz on halves, Mrs Naidoo, 14 May 2025', subject: 'Mathematics' }])
  })

  test('an unclear note is not a mark, so it is not listed as not counted', () => {
    const { notCounted } = buildTable([rec({ year: 2025, term: 2, source: 'note', quality: 'unclear', marks: null, outOf: null, text: 'hard to read' })], [])
    expect(notCounted).toEqual([])
  })

  test('fewer than MIN_POINTS in a slot is no data for that family', () => {
    const thin = rec({ year: 2025, term: 1, marks: 2, outOf: 2 })
    const enough = rec({ year: 2025, term: 2, marks: 1, outOf: 3 })
    const { table } = buildTable([thin, enough], [])
    expect(table[0]!.slots.map((s) => [s.year, s.term, s.points])).toEqual([[2025, 2, 3]])
  })

  test('current results join the table: points is the number of answers, the slot comes from the date', () => {
    const results = [
      result({ id: 'r1', correct: true, isoDate: '2026-10-05' }),
      result({ id: 'r2', correct: false, isoDate: '2026-10-05' }),
      result({ id: 'r3', correct: false, isoDate: '2026-10-05', label: 'Homework, question 3' }),
      result({ id: 'r4', correct: false, isoDate: '2026-10-05', family: 'decimals' }),
    ]
    const { table } = buildTable([], results)
    const fractions = table.find((f) => f.family === 'fractions')!
    expect(fractions.slots).toHaveLength(1)
    expect(fractions.slots[0]).toMatchObject({ year: 2026, term: 4, percent: 33, points: 3 })
    expect(fractions.slots[0]!.sources.every((s) => s.kind === 'result')).toBe(true)
    expect(fractions.slots[0]!.sources.map((s) => s.label).sort()).toEqual(['Class Test 1, question 1', 'Class Test 1, question 1', 'Homework, question 3'])
    // One answer in decimals is below MIN_POINTS.
    expect(table.find((f) => f.family === 'decimals')).toBeUndefined()
  })

  test('records and results in one slot add up', () => {
    const { table } = buildTable(
      [rec({ year: 2026, term: 4, marks: 2, outOf: 10, grade: 6 })],
      [result({ id: 'r1', correct: true }), result({ id: 'r2', correct: true }), result({ id: 'r3', correct: true }), result({ id: 'r4', correct: true })],
    )
    // 2 + 4 right of 10 + 4 answers.
    expect(table[0]!.slots[0]).toMatchObject({ percent: 43, points: 14, grade: 6 })
  })

  test('a result with no grade takes the grade of the slot, else of the latest record', () => {
    const results = [result({ id: 'r1' }), result({ id: 'r2' }), result({ id: 'r3' })]
    expect(buildTable([rec({ year: 2026, term: 4, grade: 6 })], results).table.find((f) => f.family === 'fractions')!.slots[0]!.grade).toBe(6)
    expect(buildTable([rec({ year: 2025, term: 1, grade: 5, family: 'shapes' })], results).table.find((f) => f.family === 'fractions')!.slots[0]!.grade).toBe(5)
    expect(buildTable([], [{ ...result({ id: 'r1' }), grade: 6 }, result({ id: 'r2' }), result({ id: 'r3' })]).table[0]!.slots[0]!.grade).toBe(6)
  })

  test('sources inside a slot are newest first', () => {
    const a = rec({ year: 2025, term: 1, happenedOn: '2025-01-10', title: 'A' })
    const b = rec({ year: 2025, term: 1, happenedOn: '2025-03-10', title: 'B' })
    const c = rec({ year: 2025, term: 1, happenedOn: '2025-02-10', title: 'C' })
    const { table } = buildTable([a, b, c], [])
    expect(table[0]!.slots[0]!.sources.map((s) => s.id)).toEqual([b.id, c.id, a.id])
  })

  test('the result does not depend on the order the rows come in', () => {
    const rows = [quiz(2025, 1, 30), quiz(2025, 2, 20), quiz(2025, 3, 40), quiz(2025, 1, 90, 'shapes')]
    const one = buildTable(rows, [])
    const two = buildTable([...rows].reverse(), [])
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })
})

describe('findPatterns thresholds', () => {
  const run = (percents: number[], family = 'fractions') => only(percents.map((p, i) => quiz(2025 + Math.floor(i / 4), (i % 4) + 1, p, family)))

  test('below 50 is a struggle, 50 is not', () => {
    expect(run([40, 40, 40]).map((c) => c.kind)).toEqual(['struggle'])
    expect(run([40, 40, 50])).toEqual([])
    expect(run([50, 40, 40])).toEqual([])
  })

  test('49 is a struggle and 50 is not, on an exact percent', () => {
    const rows = (marks: number) => [1, 2, 3].map((term) => rec({ year: 2025, term, marks, outOf: 100 }))
    expect(only(rows(49)).map((c) => c.kind)).toEqual(['struggle'])
    expect(only(rows(50))).toEqual([])
  })

  test('80 and above is a strength, 79 is not', () => {
    expect(run([80, 90, 100]).map((c) => c.kind)).toEqual(['strength'])
    expect(run([80, 90, 70])).toEqual([])
    const rows = (marks: number) => [1, 2, 3].map((term) => rec({ year: 2025, term, marks, outOf: 100 }))
    expect(only(rows(80)).map((c) => c.kind)).toEqual(['strength'])
    expect(only(rows(79))).toEqual([])
  })

  test('a percent is rounded before it is compared, so what the teacher reads is what was judged', () => {
    // 49.5 shows as 50.
    const rows = [1, 2, 3].map((term) => rec({ year: 2025, term, marks: 99, outOf: 200 }))
    expect(only(rows)).toEqual([])
  })

  test('two terms are not enough, three are', () => {
    expect(run([20, 20])).toEqual([])
    expect(run([20, 20, 20])).toHaveLength(1)
  })

  test('a struggle and a strength do not mix in one run', () => {
    expect(run([20, 90, 20])).toEqual([])
    expect(run([90, 20, 20, 20]).map((c) => [c.kind, c.terms.length])).toEqual([['struggle', 3]])
  })

  test('the run may be followed by 0, 1 or 2 newer slots with data, and never by 3', () => {
    const since = (percents: number[]) => run(percents)[0]?.since.map((s) => s.percent)
    // A struggle.
    expect(since([20, 20, 20])).toEqual([])
    expect(since([20, 20, 20, 60])).toEqual([60])
    expect(since([20, 20, 20, 60, 70])).toEqual([60, 70])
    expect(run([20, 20, 20, 60, 70, 80])).toEqual([])
    // A strength.
    expect(since([90, 90, 90])).toEqual([])
    expect(since([90, 90, 90, 50])).toEqual([50])
    expect(since([90, 90, 90, 50, 60])).toEqual([50, 60])
    expect(run([90, 90, 90, 50, 60, 70])).toEqual([])
    // Newer slots that go back to the same side do not make the pattern longer once something in between broke it.
    expect(since([20, 20, 20, 60, 20])).toEqual([60, 20])
    expect(run([20, 20, 20, 60, 20, 20])).toEqual([])
  })

  test('a run that reaches the latest slot is the longest one, with nothing after it', () => {
    expect(run([20, 20, 20, 20, 20])[0]).toMatchObject({ since: [] })
    expect(run([20, 20, 20, 20, 20])[0]!.terms).toHaveLength(5)
  })

  test('the longest run that ends at the latest slot is taken', () => {
    const [c] = run([60, 40, 30, 20, 10])
    expect(c!.kind).toBe('struggle')
    expect(c!.terms.map((t) => t.percent)).toEqual([40, 30, 20, 10])
  })

  test('families are judged on their own', () => {
    const rows = [
      ...[1, 2, 3, 4].map((t) => quiz(2025, t, 30, 'fractions')),
      ...[1, 2, 3, 4].map((t) => quiz(2025, t, 90, 'shapes')),
      ...[1, 2, 3, 4].map((t) => quiz(2025, t, 60, 'data')),
    ]
    const found = only(rows)
    expect(found.map((c) => c.key)).toEqual(['struggle:fractions', 'strength:shapes'])
    expect(found.map((c) => patternKey(c.kind, c.family))).toEqual(['struggle:fractions', 'strength:shapes'])
  })

  test('a candidate lists its terms oldest first with grade, year, term, percent and points', () => {
    const [c] = only([
      rec({ year: 2024, term: 4, grade: 4, marks: 3, outOf: 10 }),
      rec({ year: 2025, term: 1, grade: 5, marks: 2, outOf: 10 }),
      rec({ year: 2025, term: 2, grade: 5, marks: 4, outOf: 10 }),
    ])
    expect(c!.terms).toEqual([
      { grade: 4, year: 2024, term: 4, percent: 30, points: 10 },
      { grade: 5, year: 2025, term: 1, percent: 20, points: 10 },
      { grade: 5, year: 2025, term: 2, percent: 40, points: 10 },
    ])
  })
})

describe('newer results after a pattern (since)', () => {
  const run = (percents: number[], family = 'fractions') => only(percents.map((p, i) => quiz(2025 + Math.floor(i / 4), (i % 4) + 1, p, family)))

  test('a struggle followed by one newer slot carries it in since', () => {
    const [c] = run([20, 30, 40, 60])
    expect(c).toMatchObject({ key: 'struggle:fractions', kind: 'struggle' })
    expect(c!.terms.map((t) => t.percent)).toEqual([20, 30, 40])
    expect(c!.since).toHaveLength(1)
    expect(c!.since[0]).toMatchObject({ grade: 5, year: 2025, term: 4, percent: 60, points: 10 })
    expect(c!.since[0]!.sources).toHaveLength(1)
    expect(c!.since[0]!.sources[0]).toMatchObject({ kind: 'record', label: expect.stringContaining('Mrs Naidoo') })
    // The newer result is the newest evidence, and the run's evidence follows it.
    expect(c!.evidence).toHaveLength(4)
    expect(c!.evidence[0]).toEqual(c!.since[0]!.sources[0])
  })

  test('two newer slots are listed oldest first, and their sources are the newest evidence, newest first', () => {
    const [c] = run([20, 30, 40, 60, 70])
    expect(c!.terms.map((t) => t.percent)).toEqual([20, 30, 40])
    expect(c!.since.map((s) => [s.year, s.term, s.percent])).toEqual([[2025, 4, 60], [2026, 1, 70]])
    expect(c!.evidence).toHaveLength(5)
    expect(c!.evidence[0]).toEqual(c!.since[1]!.sources[0])
    expect(c!.evidence[1]).toEqual(c!.since[0]!.sources[0])
  })

  test('a strength followed by weaker slots carries them', () => {
    const [c] = run([85, 90, 95, 50, 40], 'shapes')
    expect(c).toMatchObject({ key: 'strength:shapes', kind: 'strength' })
    expect(c!.terms).toHaveLength(3)
    expect(c!.since.map((s) => s.percent)).toEqual([50, 40])
  })

  test('a newer slot may swing all the way to the other side, or go back to the same side after one in between', () => {
    expect(run([20, 30, 40, 90])[0]).toMatchObject({ kind: 'struggle', since: [{ percent: 90 }] })
    expect(run([90, 85, 80, 10])[0]).toMatchObject({ kind: 'strength', since: [{ percent: 10 }] })
    expect(run([20, 30, 40, 60, 20])[0]).toMatchObject({ kind: 'struggle', since: [{ percent: 60 }, { percent: 20 }] })
  })

  test('a run that reaches the latest slot has no since, and a newer slot that continues it is part of the run', () => {
    expect(run([60, 20, 30, 40])[0]).toMatchObject({ terms: [{ percent: 20 }, { percent: 30 }, { percent: 40 }], since: [] })
    expect(run([20, 30, 40, 45])[0]).toMatchObject({ since: [] })
    expect(run([20, 30, 40, 45])[0]!.terms).toHaveLength(4)
  })

  test('a run that is too short is not rescued by the newer slots', () => {
    expect(run([20, 30, 60])).toEqual([])
    expect(run([20, 30, 60, 70])).toEqual([])
    expect(run([60, 20, 30, 60])).toEqual([])
  })

  test('a slot with too few marks is not a newer slot with data', () => {
    const thin = rec({ year: 2026, term: 1, marks: 2, outOf: 2 })
    const [c] = only([quiz(2025, 2, 20), quiz(2025, 3, 30), quiz(2025, 4, 40), thin])
    expect(c!.since).toEqual([])
    expect(c!.terms).toHaveLength(3)
  })

  test('newer slots may be a year later, and the terms between stay out of the run', () => {
    const [c] = only([quiz(2025, 1, 20), quiz(2025, 2, 30), quiz(2025, 3, 40), quiz(2026, 2, 70)])
    expect(c!.since).toMatchObject([{ year: 2026, term: 2, percent: 70 }])
    // 2025 T4 and 2026 T1 lie between the run and the newer result: they are not inside the run, so nothing is listed.
    expect(c!.missingTerms).toEqual([])
  })

  test('current answers can be the newer results, and are named by their test', () => {
    const results = [1, 2, 3, 4].map((n) => result({ id: `ct-${n}`, correct: n <= 3, isoDate: '2026-08-20', label: `Class Test 1, question ${n}` }))
    const [c] = only([quiz(2025, 4, 20), quiz(2026, 1, 30), quiz(2026, 2, 40)], results)
    expect(c!.since).toHaveLength(1)
    expect(c!.since[0]).toMatchObject({ grade: 5, year: 2026, term: 3, percent: 75, points: 4 })
    expect(c!.since[0]!.sources.map((x) => x.label).sort()).toEqual([1, 2, 3, 4].map((n) => `Class Test 1, question ${n}`))
    expect(c!.since[0]!.sources.every((x) => x.kind === 'result')).toBe(true)
  })

  test('the sources of one newer slot are cut at 6 in since', () => {
    const results = Array.from({ length: 10 }, (_, n) => result({ id: `ct-${n}`, correct: true, isoDate: '2026-08-20', label: `Class Test 1, question ${n + 1}` }))
    const [c] = only([quiz(2025, 4, 20), quiz(2026, 1, 30), quiz(2026, 2, 40)], results)
    expect(c!.since[0]!.sources).toHaveLength(6)
    expect(c!.since[0]!.points).toBe(10)
  })

  test('evidence is cut at 12, and newer results never crowd out the run: the run keeps at least 6 places', () => {
    const answers = (day: string, test: string) => Array.from({ length: 10 }, (_, n) => result({ id: `${test}-${n}`, correct: true, isoDate: day, label: `${test}, question ${n + 1}` }))
    // A short run (3 records): the newer result lists its 6 sources, then the 3 records.
    const [short] = only([quiz(2025, 4, 20), quiz(2026, 1, 30), quiz(2026, 2, 40)], answers('2026-08-20', 'Class Test 1'))
    expect(short!.evidence).toHaveLength(9)
    expect(short!.evidence.slice(0, 6).every((e) => e.kind === 'result')).toBe(true)
    expect(short!.evidence.slice(6).map((e) => e.kind)).toEqual(['record', 'record', 'record'])
    // 10 answers and 3 records were there, 9 are listed.
    expect(short!.more).toBe(4)

    // A long run (12 records): the newer results get 6 places and the run the other 6.
    const many = [[2025, 4], [2026, 1], [2026, 2]].flatMap(([y, t]) => [1, 2, 3, 4].map((i) => rec({ year: y!, term: t!, marks: 5, outOf: 20, happenedOn: `${y}-${String((t! - 1) * 3 + 1).padStart(2, '0')}-0${i}` })))
    const [long] = only(many, answers('2026-08-20', 'Class Test 1'))
    expect(long!.evidence).toHaveLength(12)
    expect(long!.evidence.slice(0, 6).every((e) => e.kind === 'result')).toBe(true)
    expect(long!.evidence.slice(6).every((e) => e.kind === 'record')).toBe(true)
    expect(long!.more).toBe(10)

    // Two newer slots with a long run: the newest slot's sources come first.
    const [two] = only(many, [...answers('2026-08-20', 'Class Test 1'), ...answers('2026-11-05', 'Class Test 2')])
    expect(two!.since.map((s) => s.term)).toEqual([3, 4])
    expect(two!.evidence).toHaveLength(12)
    expect(two!.evidence.slice(0, 6).every((e) => e.label.startsWith('Class Test 2'))).toBe(true)
    expect(two!.evidence.slice(6).every((e) => e.kind === 'record')).toBe(true)
    expect(two!.more).toBe(20)
  })
})

describe('missing terms', () => {
  test('a term with no data inside the span is skipped, never guessed, and listed', () => {
    const [c] = only([quiz(2025, 1, 90), quiz(2025, 4, 85), quiz(2026, 1, 95)])
    expect(c!.kind).toBe('strength')
    expect(c!.terms.map((t) => [t.year, t.term])).toEqual([[2025, 1], [2025, 4], [2026, 1]])
    // The grade of a missing term comes from the term before it.
    expect(c!.missingTerms).toEqual([
      { grade: 5, year: 2025, term: 2 },
      { grade: 5, year: 2025, term: 3 },
    ])
  })

  test('a thin slot (fewer than MIN_POINTS) in the span is skipped and listed too', () => {
    const thin = rec({ year: 2025, term: 2, family: 'fractions', marks: 2, outOf: 2 })
    const [c] = only([quiz(2025, 1, 20), thin, quiz(2025, 3, 30), quiz(2025, 4, 10)])
    expect(c!.terms).toHaveLength(3)
    expect(c!.missingTerms).toEqual([{ grade: 5, year: 2025, term: 2 }])
  })

  test('a run with no gap lists none', () => {
    const [c] = only([quiz(2025, 1, 20), quiz(2025, 2, 30), quiz(2025, 3, 10)])
    expect(c!.missingTerms).toEqual([])
  })

  test('a gap before the run is not part of the run', () => {
    const [c] = only([quiz(2024, 1, 90), quiz(2025, 2, 20), quiz(2025, 3, 30), quiz(2025, 4, 10)])
    expect(c!.terms).toHaveLength(3)
    expect(c!.missingTerms).toEqual([])
  })

  test('historySlots lists every slot with any record or result, and missingSlots the empty ones between', () => {
    const records = [
      rec({ year: 2025, term: 1, grade: 5 }),
      rec({ year: 2025, term: 1, grade: 5, source: 'note', family: null, marks: null, outOf: null, text: 'x' }),
      rec({ year: 2025, term: 4, grade: 5, source: 'attendance', family: null, marks: null, outOf: null, present: 50, total: 60 }),
      rec({ year: 2026, term: 1, grade: 6 }),
    ]
    const slots = historySlots(records, [])
    expect(slots).toEqual([
      { grade: 5, year: 2025, term: 1 },
      { grade: 5, year: 2025, term: 4 },
      { grade: 6, year: 2026, term: 1 },
    ])
    expect(missingSlots(slots)).toEqual([
      { grade: 5, year: 2025, term: 2 },
      { grade: 5, year: 2025, term: 3 },
    ])
    // Without grades, a missing term has none.
    expect(missingSlots(slots.map(({ year, term }) => ({ year, term })))).toEqual([
      { year: 2025, term: 2 },
      { year: 2025, term: 3 },
    ])
    // A missing term in a later year moves the grade on by the years in between.
    expect(missingSlots([{ grade: 5, year: 2025, term: 4 }, { grade: 6, year: 2026, term: 3 }])).toEqual([
      { grade: 6, year: 2026, term: 1 },
      { grade: 6, year: 2026, term: 2 },
    ])
    expect(missingSlots([])).toEqual([])
    expect(missingSlots(slots.slice(0, 1))).toEqual([])
  })

  test('historySlots counts current results and gives them the grade passed in', () => {
    const slots = historySlots([rec({ year: 2025, term: 4, grade: 5 })], [result({ id: 'r1', isoDate: '2026-02-03' })], 6)
    expect(slots).toEqual([
      { grade: 5, year: 2025, term: 4 },
      { grade: 6, year: 2026, term: 1 },
    ])
    expect(missingSlots(slots)).toEqual([])
  })
})

describe('evidence', () => {
  test('evidence is the sources of the run, newest first', () => {
    const a = rec({ year: 2025, term: 1, marks: 2, outOf: 10, happenedOn: '2025-02-01' })
    const b = rec({ year: 2025, term: 2, marks: 2, outOf: 10, happenedOn: '2025-05-01' })
    const c = rec({ year: 2025, term: 3, marks: 2, outOf: 10, happenedOn: '2025-08-01' })
    const [cand] = only([a, b, c])
    expect(cand!.evidence.map((e) => e.id)).toEqual([c.id, b.id, a.id])
    expect(cand!.evidence[0]).toEqual({ kind: 'record', id: c.id, label: expect.stringContaining('1 Aug 2025') })
    expect(cand!.more).toBeUndefined()
  })

  test('at most 12 sources are kept, and the rest are counted in more', () => {
    const rows = [1, 2, 3].flatMap((term) => Array.from({ length: 6 }, (_, i) => rec({ year: 2025, term, marks: 1, outOf: 10, happenedOn: `2025-0${term * 3 - 1}-${String(i + 1).padStart(2, '0')}` })))
    const [cand] = only(rows)
    expect(cand!.evidence).toHaveLength(12)
    expect(cand!.more).toBe(6)
    // Newest first: the whole of term 3 and term 2 come before term 1.
    expect(cand!.evidence.slice(0, 6).every((e) => rows.find((r) => r.id === e.id)!.term === 3)).toBe(true)
  })

  test('current results are evidence of kind result', () => {
    const results = ['a', 'b', 'c'].map((id) => result({ id, correct: false, isoDate: '2026-10-05', label: `Class Test 1, question ${id}` }))
    const [cand] = only([quiz(2026, 1, 20), quiz(2026, 2, 30)], results)
    expect(cand!.terms.map((t) => [t.year, t.term])).toEqual([[2026, 1], [2026, 2], [2026, 4]])
    expect(cand!.evidence.slice(0, 3).map((e) => e.kind)).toEqual(['result', 'result', 'result'])
    expect(cand!.missingTerms).toEqual([{ grade: 5, year: 2026, term: 3 }])
  })
})

describe('bannedWords', () => {
  test('finds whole words, case-insensitive', () => {
    expect(bannedWords('A Gifted and SMART learner')).toEqual(['gifted', 'smart'])
    expect(bannedWords('Finds fractions hard in Terms 1 to 3.')).toEqual([])
  })

  test('does not fire inside other words', () => {
    expect(bannedWords('The slowly rising marks, the brightness of the ink, a doctoral thesis, mainstream, tracks, ranking')).toEqual([])
  })

  test('finds phrases, even with extra spaces or a line break', () => {
    expect(bannedWords('He is at the top  of the class')).toEqual(['top of'])
    expect(bannedWords('a weak\nlearner')).toEqual(['weak learner'])
    expect(bannedWords('She does better than the class and than her classmates')).toEqual(['than the class', 'than her classmates'])
  })

  test('every word on the list is found on its own', () => {
    for (const word of BANNED_WORDS) expect(bannedWords(`Something ${word.toUpperCase()}.`)).toContain(word)
  })

  test('ranking and career talk is caught', () => {
    expect(bannedWords('Could be an engineer or a doctor one day. She should study maths. Best in Grade 6.')).toEqual(['engineer', 'doctor', 'should study', 'best in'])
    expect(bannedWords('She is on track and in the top stream')).toEqual(['track', 'stream'])
  })

  test('a word is reported once', () => {
    expect(bannedWords('lazy, so lazy, lazy')).toEqual(['lazy'])
  })
})


describe('subjects', () => {
  const inSubject = (subject: string | null, over: Parameters<typeof rec>[0]) => rec({ ...over, subject })
  /** Three terms of one strand in one subject, one quiz of 10 each, at the given percent. */
  const strand = (subject: string | null, family: string, percents: number[], year = 2025) =>
    percents.map((p, i) => inSubject(subject, { year: year + Math.floor(i / 4), term: (i % 4) + 1, family, marks: p / 10, outOf: 10 }))

  test('two subjects of one child give two tables, and the same strand name in two subjects stays apart', () => {
    const records = [...strand('Mathematics', 'data', [40, 40, 40]), ...strand('Natural Sciences', 'data', [90, 90, 90])]
    const { table } = buildTable(records, [])
    expect(table.map((f) => [f.subject, f.family])).toEqual([
      ['Mathematics', 'data'],
      ['Natural Sciences', 'data'],
    ])
    expect(table[0]!.slots.map((s) => s.percent)).toEqual([40, 40, 40])
    expect(table[1]!.slots.map((s) => s.percent)).toEqual([90, 90, 90])
  })

  test('the same family in two subjects gives two patterns, each with its own kind, terms and evidence', () => {
    const records = [...strand('Mathematics', 'data', [40, 40, 40]), ...strand('Natural Sciences', 'data', [90, 90, 90])]
    const found = only(records)
    expect(found.map((c) => [c.subject, c.key, c.kind])).toEqual([
      ['Mathematics', 'struggle:data', 'struggle'],
      ['Natural Sciences', 'strength:data', 'strength'],
    ])
    const ids = (c: (typeof found)[number]) => c.evidence.map((e) => e.id)
    for (const id of ids(found[0]!)) expect(ids(found[1]!)).not.toContain(id)
  })

  test('the same kind and family in two subjects gives two candidates with the same key and a different subject', () => {
    const found = only([...strand('Mathematics', 'data', [40, 40, 40]), ...strand('English', 'data', [30, 30, 30])])
    expect(found.map((c) => [c.subject, c.key])).toEqual([
      ['Mathematics', 'struggle:data'],
      ['English', 'struggle:data'],
    ])
  })

  test('there is no pattern across subjects: two weak terms in one subject and one in another are not three in a row', () => {
    const records = [
      inSubject('Mathematics', { year: 2025, term: 1, family: 'data', marks: 4, outOf: 10 }),
      inSubject('Mathematics', { year: 2025, term: 2, family: 'data', marks: 4, outOf: 10 }),
      inSubject('Natural Sciences', { year: 2025, term: 3, family: 'data', marks: 4, outOf: 10 }),
    ]
    expect(only(records)).toEqual([])
  })

  test('the rule of 3 terms in a row holds inside one subject', () => {
    expect(only(strand('English', 'reading', [40, 40, 40])).map((c) => [c.subject, c.key])).toEqual([['English', 'struggle:reading']])
    expect(only(strand('English', 'reading', [40, 40]))).toEqual([])
  })

  test('a record with a family and no subject counts as Mathematics, beside records that say so', () => {
    const records = [
      inSubject(null, { year: 2025, term: 1, family: 'fractions', marks: 4, outOf: 10 }),
      inSubject('Mathematics', { year: 2025, term: 2, family: 'fractions', marks: 4, outOf: 10 }),
      rec({ year: 2025, term: 3, family: 'fractions', marks: 4, outOf: 10 }), // no subject key at all
    ]
    const { table } = buildTable(records, [])
    expect(table).toHaveLength(1)
    expect(table[0]).toMatchObject({ subject: 'Mathematics', family: 'fractions' })
    expect(table[0]!.slots).toHaveLength(3)
    expect(only(records).map((c) => c.subject)).toEqual(['Mathematics'])
  })

  test('Maths and Mathematics are one subject, so a class that says Maths and records that say Mathematics share one table', () => {
    const records = [
      inSubject('Mathematics', { year: 2025, term: 1, family: 'fractions', marks: 4, outOf: 10 }),
      inSubject('Maths', { year: 2025, term: 2, family: 'fractions', marks: 4, outOf: 10 }),
    ]
    const answers = ['a', 'b', 'c'].map((id) => ({ ...result({ id, correct: false, isoDate: '2025-08-10' }), subject: 'maths ' }))
    const { table } = buildTable(records, answers)
    expect(table.map((f) => [f.subject, f.family, f.slots.length])).toEqual([['Mathematics', 'fractions', 3]])
    expect(subjectsOf(records, answers)).toEqual(['Mathematics'])
  })

  test('notes and attendance have no subject: they never make one, and they belong to every subject', () => {
    const note = rec({ year: 2025, term: 1, source: 'note', family: null, marks: null, outOf: null, text: 'Quiet today.' })
    const away = rec({ year: 2025, term: 2, source: 'attendance', family: null, marks: null, outOf: null, present: 8, total: 10 })
    expect(subjectsOf([note, away], [])).toEqual([])
    const both = [...strand('Mathematics', 'data', [40, 40, 40]), ...strand('English', 'reading', [40, 40, 40]), note, away]
    expect(recordsForSubject(both, 'English').filter((r) => r.source === 'note' || r.source === 'attendance')).toHaveLength(2)
    expect(recordsForSubject(both, 'English').filter((r) => r.family === 'data')).toEqual([])
    expect(recordsForSubject(both, 'Mathematics').filter((r) => r.family === 'reading')).toEqual([])
  })

  test('subjectsOf lists the subjects with marked work or answers, Mathematics first', () => {
    const records = [...strand('Natural Sciences', 'life_living', [40, 40, 40]), ...strand(null, 'fractions', [40, 40, 40]), ...strand('English', 'reading', [40])]
    expect(subjectsOf(records, [])).toEqual(['Mathematics', 'English', 'Natural Sciences'])
    expect(subjectsOf([], [{ ...result({ id: 'r1' }), subject: 'Social Sciences' }])).toEqual(['Social Sciences'])
    expect(subjectsOf([], [result({ id: 'r1' })])).toEqual(['Mathematics'])
  })

  test('this year\'s marked answers carry the subject and grade of the class they were written in, and the term of their date', () => {
    const answer = (id: string, correct: boolean) => ({ ...result({ id, correct, isoDate: '2026-02-10' }), family: 'reading', subject: 'English', grade: 7 })
    const { table } = buildTable([], [answer('a', false), answer('b', false), answer('c', true)])
    expect(table).toHaveLength(1)
    expect(table[0]).toMatchObject({ subject: 'English', family: 'reading' })
    expect(table[0]!.slots[0]).toMatchObject({ grade: 7, year: 2026, term: 1, percent: 33, points: 3 })
    expect(resultsForSubject([answer('a', true), { ...answer('b', true), subject: 'Mathematics' }], 'English').map((r) => r.id)).toEqual(['a'])
  })

  test('two subjects keep their own grade for the same term', () => {
    const records = [
      inSubject('Mathematics', { year: 2025, term: 1, grade: 5, family: 'fractions', marks: 5, outOf: 10 }),
      inSubject('English', { year: 2025, term: 1, grade: 7, family: 'reading', marks: 5, outOf: 10 }),
    ]
    const { table } = buildTable(
      records.map((r) => ({ ...r, outOf: 30, marks: 15 })),
      [],
    )
    expect(table.find((f) => f.subject === 'Mathematics')!.slots[0]!.grade).toBe(5)
    expect(table.find((f) => f.subject === 'English')!.slots[0]!.grade).toBe(7)
  })

  test('an unclear marked piece with no subject is counted as not counted under Mathematics', () => {
    const { notCounted } = buildTable([inSubject(null, { year: 2025, term: 2, family: 'fractions', quality: 'unclear' })], [])
    expect(notCounted).toMatchObject([{ subject: 'Mathematics' }])
  })
})

describe('bannedWords with names that come from the data', () => {
  test('a subject, a strand or a title that holds a banned word is taken out of the text before the check', () => {
    expect(bannedWords('Marks in Rank and file stayed high.')).toEqual(['rank'])
    expect(bannedWords('Marks in Rank and file stayed high.', ['Rank and file'])).toEqual([])
    expect(bannedWords('Marks in the Track and field quiz stayed high.', ['Track and field'])).toEqual([])
    expect(bannedWords('Streams of the Nile: marks stayed low.', ['Streams of the Nile'])).toEqual([])
    expect(bannedWords('Quiz: Stream study, Mrs Naidoo, 14 May 2025 was low', ['Quiz: Stream study, Mrs Naidoo, 14 May 2025'])).toEqual([])
  })

  test('only the whole name is taken out, in any case, and the rest of the text is still checked', () => {
    expect(bannedWords('The rank and file topic was slow.', ['Rank and file'])).toEqual(['slow'])
    expect(bannedWords('RANK AND FILE was fine, then a lazy term.', ['Rank and file'])).toEqual(['lazy'])
    expect(bannedWords('The rankings in rank and filed work', ['rank and file'])).toEqual(['rank'])
  })

  test('a name that is itself a banned word hides nothing: "on track" is still caught', () => {
    expect(bannedWords('She is on track.', ['Track'])).toEqual(['track'])
    expect(bannedWords('A gifted learner.', ['gifted'])).toEqual(['gifted'])
  })

  test('names with punctuation are matched as written and a blank name changes nothing', () => {
    expect(bannedWords('Quiz (Stream) results were low', ['Quiz (Stream) results'])).toEqual([])
    expect(bannedWords('A lazy term', ['', '   '])).toEqual(['lazy'])
  })
})
