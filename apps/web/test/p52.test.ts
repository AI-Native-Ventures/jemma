import type { LongViewRecord } from '@jemma/profiling/logic'
import { describe, expect, it } from 'vitest'
import {
  buildLongView,
  cellAlt,
  groupTerms,
  inQuestionOrder,
  levelOf,
  linesFor,
  pillText,
  strandName,
  subjectLinkOf,
  summaryLine,
  whenLabel,
  type LongViewInput,
  type PatternRow,
} from '@/lib/data/p52'

const NOW = new Date('2026-11-10T12:00:00Z')

let n = 0
const record = (over: Partial<LongViewRecord>): LongViewRecord => ({
  id: `rec-${++n}`,
  source: 'quiz',
  grade: 5,
  year: 2025,
  term: 3,
  happenedOn: '2025-08-12',
  loggedAt: '2025-08-14T10:00:00Z',
  teacherName: 'Mrs Naidoo',
  title: 'Quiz: Adding fractions',
  family: 'fractions',
  topicName: 'Adding fractions',
  marks: 8,
  outOf: 20,
  quality: 'clear',
  text: null,
  present: null,
  total: null,
  ...over,
})

const pattern = (over: Partial<PatternRow> = {}): PatternRow => ({
  id: `pat-${++n}`,
  child_id: 'child-1',
  kind: 'struggle',
  subject: 'Mathematics',
  family: 'fractions',
  title: 'Fractions marks stayed low',
  statement: 'Fractions marks stayed low from Grade 5 Term 3 to Grade 6 Term 2.',
  terms: [
    { grade: 5, year: 2025, term: 3, percent: 40, points: 20 },
    { grade: 5, year: 2025, term: 4, percent: 35, points: 20 },
    { grade: 6, year: 2026, term: 1, percent: 30, points: 20 },
  ],
  evidence: [{ kind: 'record', id: 'rec-a', label: 'Quiz: Adding fractions, Mrs Naidoo, 12 Aug 2025' }],
  status: 'draft',
  active: true,
  created_at: '2026-11-10T08:00:00Z',
  updated_at: '2026-11-10T08:00:00Z',
  approved_by: null,
  approved_by_name: null,
  approved_at: null,
  discussed_by: null,
  discussed_by_name: null,
  discussed_at: null,
  dismissed_by: null,
  dismissed_at: null,
  ...over,
})

/** Three terms of fractions marks in a row (Grade 5 Terms 3 and 4, Grade 6 Term 1), 4 marks each, plus a shapes quiz. */
function input(over: Partial<LongViewInput> = {}): LongViewInput {
  const fractions = [
    record({ id: 'f1', term: 3, grade: 5, year: 2025, happenedOn: '2025-08-12', marks: 8, outOf: 20 }),
    record({ id: 'f2', term: 4, grade: 5, year: 2025, happenedOn: '2025-11-12', marks: 7, outOf: 20, teacherName: 'Mrs Naidoo' }),
    record({ id: 'f3', term: 1, grade: 6, year: 2026, happenedOn: '2026-02-12', marks: 12, outOf: 20, teacherName: 'Ms Banda' }),
  ]
  const shapes = [record({ id: 's1', term: 4, grade: 5, year: 2025, happenedOn: '2025-11-20', family: 'shapes', title: 'Quiz: Angles', marks: 19, outOf: 20 })]
  return {
    now: NOW,
    classId: 'class-1',
    className: '6B Mathematics',
    child: { id: 'child-1', firstName: 'Amina', grade: 6, parentFirstName: 'Thandi' },
    hasParent: true,
    records: [...fractions, ...shapes],
    results: [],
    observations: [],
    patterns: [],
    events: [],
    ...over,
  }
}

describe('plain words for the strands', () => {
  it('names the six strands and tidies any other family', () => {
    expect(strandName('whole_numbers')).toBe('Whole numbers')
    expect(strandName('fractions')).toBe('Fractions')
    expect(strandName('decimals')).toBe('Decimals')
    expect(strandName('shapes')).toBe('Shapes and space')
    expect(strandName('measurement')).toBe('Measurement')
    expect(strandName('data')).toBe('Data handling')
    expect(strandName('patterns_and_algebra')).toBe('Patterns and algebra')
  })
})

describe('the dots', () => {
  it('is full from 80, half from 50 to 79 and empty below 50', () => {
    expect(levelOf(100)).toBe('full')
    expect(levelOf(80)).toBe('full')
    expect(levelOf(79)).toBe('half')
    expect(levelOf(50)).toBe('half')
    expect(levelOf(49)).toBe('empty')
    expect(levelOf(0)).toBe('empty')
  })

  it('gives every cell a text alternative, with or without results', () => {
    expect(cellAlt('Fractions', 5, 2, { percent: 40, points: 10 })).toBe('Fractions, Grade 5 Term 2: 40 percent, 10 marks')
    expect(cellAlt('Fractions', 5, 2, { percent: 100, points: 1 })).toBe('Fractions, Grade 5 Term 2: 100 percent, 1 mark')
    expect(cellAlt('Shapes and space', 6, 1, null)).toBe('Shapes and space, Grade 6 Term 1: no results')
  })
})

describe('the grid', () => {
  it('has one row per strand with data, in the strand order, and one column per term from the first to the last', () => {
    const v = buildLongView(input())
    expect(v.rows.map((r) => r.name)).toEqual(['Fractions', 'Shapes and space'])
    expect(v.columns.map((c) => `${c.grade}.${c.term}`)).toEqual(['5.3', '5.4', '6.1'])
    expect(v.gradeGroups).toEqual([
      { grade: 5, span: 2 },
      { grade: 6, span: 1 },
    ])
  })

  it('marks a term with no results for that strand as dashed, and says so in the text alternative', () => {
    const v = buildLongView(input())
    const shapes = v.rows.find((r) => r.family === 'shapes')!
    expect(shapes.cells.map((c) => c.level)).toEqual(['none', 'full', 'none'])
    expect(shapes.cells[0]!.alt).toBe('Shapes and space, Grade 5 Term 3: no results')
    expect(shapes.cells[1]!.alt).toBe('Shapes and space, Grade 5 Term 4: 95 percent, 20 marks')
  })

  it('uses the same table the tool uses: marks are added up over the term', () => {
    const v = buildLongView(input())
    const fractions = v.rows.find((r) => r.family === 'fractions')!
    expect(fractions.cells.map((c) => [c.level, c.percent])).toEqual([
      ['empty', 40],
      ['empty', 35],
      ['half', 60],
    ])
  })

  it("counts this year's marked answers beside the past records", () => {
    const v = buildLongView(
      input({
        records: [],
        results: Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, correct: i < 3, family: 'fractions', isoDate: '2026-11-03', label: `Class Test 1, question ${i + 1}`, grade: 6, paperId: 'paper-1', n: i + 1 })),
      }),
    )
    expect(v.rows[0]!.cells.map((c) => [c.level, c.percent, c.points])).toEqual([['half', 75, 4]])
    expect(v.columns.map((c) => `${c.grade}.${c.term}`)).toEqual(['6.4'])
  })

  it('says the span in one quiet line: grades, terms and teachers', () => {
    const v = buildLongView(input())
    expect(v.spanLine).toBe('Grade 5 to Grade 6 · 3 terms · 2 teachers')
    const one = buildLongView(input({ records: [record({ grade: 6, year: 2026, term: 1, happenedOn: '2026-02-03' })] }))
    expect(one.spanLine).toBe('Grade 6 · 1 term · 1 teacher')
  })

  it('shows a term nobody recorded anything in as a dashed column', () => {
    const v = buildLongView(
      input({
        records: [
          record({ id: 'a', grade: 5, year: 2025, term: 1, happenedOn: '2025-02-03' }),
          record({ id: 'b', grade: 5, year: 2025, term: 4, happenedOn: '2025-11-03' }),
        ],
      }),
    )
    expect(v.columns.map((c) => `${c.grade}.${c.term}`)).toEqual(['5.1', '5.2', '5.3', '5.4'])
    expect(v.missing).toEqual(['No results for Grade 5, Terms 2 and 3'])
  })

  it('has no rows and no span when there is nothing', () => {
    const v = buildLongView(input({ records: [], results: [] }))
    expect(v.rows).toEqual([])
    expect(v.columns).toEqual([])
    expect(v.spanLine).toBeNull()
  })
})

describe('what Jemma could not use', () => {
  it('names the unclear records that were not counted and the ones logged late', () => {
    const v = buildLongView(
      input({
        records: [
          record({ id: 'u', quality: 'unclear', title: 'Quiz: Fractions', happenedOn: '2025-08-12', term: 3 }),
          record({ id: 'late', title: 'Assignment: Angles', family: 'shapes', happenedOn: '2025-03-04', term: 1, loggedAt: '2025-08-30T10:00:00Z' }),
          record({ id: 'ok', term: 2, happenedOn: '2025-05-04', loggedAt: '2025-05-06T10:00:00Z' }),
        ],
      }),
    )
    expect(v.unclear).toEqual(['Quiz: Fractions, Mrs Naidoo, 12 Aug 2025'])
    expect(v.late).toEqual(['Assignment: Angles, Mrs Naidoo, 4 Mar 2025'])
  })

  it('writes missing terms by grade in plain words', () => {
    expect(linesFor([{ grade: 5, year: 2025, term: 2 }, { grade: 5, year: 2025, term: 3 }])).toEqual(['No results for Grade 5, Terms 2 and 3'])
    expect(linesFor([{ grade: 5, year: 2025, term: 2 }])).toEqual(['No results for Grade 5, Term 2'])
    expect(
      linesFor([
        { grade: 5, year: 2025, term: 1 },
        { grade: 5, year: 2025, term: 2 },
        { grade: 5, year: 2025, term: 3 },
        { grade: 6, year: 2026, term: 1 },
      ]),
    ).toEqual(['No results for Grade 5, Terms 1, 2 and 3', 'No results for Grade 6, Term 1'])
  })
})

describe('the patterns', () => {
  it('puts drafts first, then approved, then shared, and sets the rest aside', () => {
    const v = buildLongView(
      input({
        patterns: [
          pattern({ id: 'shared', status: 'discussed', family: 'shapes', kind: 'strength', discussed_by_name: 'Ms Banda', discussed_at: '2026-11-09T09:00:00Z' }),
          pattern({ id: 'approved', status: 'approved', family: 'decimals', kind: 'strength', approved_at: '2026-11-08T09:00:00Z' }),
          pattern({ id: 'draft' }),
          pattern({ id: 'dismissed', status: 'dismissed', family: 'data', kind: 'strength', dismissed_at: '2026-11-07T09:00:00Z' }),
          pattern({ id: 'gone', status: 'approved', family: 'measurement', active: false }),
        ],
      }),
    )
    expect(v.groups.drafts.map((p) => p.id)).toEqual(['draft'])
    expect(v.groups.approved.map((p) => p.id)).toEqual(['approved'])
    expect(v.groups.shared.map((p) => p.id)).toEqual(['shared'])
    expect(v.groups.setAside.map((p) => p.id)).toEqual(['dismissed', 'gone'])
    expect(v.groups.setAside.find((p) => p.id === 'gone')!.noLongerShows).toBe(true)
    expect(v.groups.setAside.find((p) => p.id === 'dismissed')!.noLongerShows).toBe(false)
  })

  it('says the length of the run in the pill, and never says running when newer terms exist', () => {
    const run = [
      { grade: 5, year: 2025, term: 3, percent: 40, points: 20 },
      { grade: 5, year: 2025, term: 4, percent: 35, points: 20 },
      { grade: 6, year: 2026, term: 1, percent: 30, points: 20 },
    ]
    expect(pillText('struggle', 3, false)).toBe('Struggle · 3 terms running')
    expect(pillText('struggle', 3, true)).toBe('Struggle · 3 terms')
    expect(pillText('strength', 6, false)).toBe('Strength · 6 terms')
    expect(pillText('strength', 4, true)).toBe('Strength · 4 terms')
    const v = buildLongView(
      input({
        patterns: [
          pattern({
            terms: [...run, { grade: 6, year: 2026, term: 3, percent: 63, points: 16, since: true }, { grade: 6, year: 2026, term: 4, percent: 67, points: 9, since: true }],
          }),
        ],
      }),
    )
    const p = v.groups.drafts[0]!
    expect(p.runTerms).toBe(3)
    expect(p.pill).toBe('Struggle · 3 terms')
    expect(p.since).toBe('Since then: Grade 6 Term 3, 63 percent · Grade 6 Term 4, 67 percent')
  })

  it('has no since line when the pattern runs to the newest term', () => {
    const p = buildLongView(input({ patterns: [pattern()] })).groups.drafts[0]!
    expect(p.since).toBeNull()
    expect(p.pill).toBe('Struggle · 3 terms running')
  })

  it('turns each piece of evidence into a chip: a marked answer links to the paper at that question, a record opens a sheet', () => {
    const v = buildLongView(
      input({
        records: [record({ id: 'rec-a', title: 'Quiz: Adding fractions', happenedOn: '2025-08-12', loggedAt: '2025-12-30T10:00:00Z', text: 'Guessed the bottom number.' })],
        results: [{ id: 'res-1', correct: false, family: 'fractions', isoDate: '2026-11-03', label: 'Class Test 1, question 4', grade: 6, paperId: 'paper-9', n: 4 }],
        observations: [{ id: 'obs-1', authorName: 'Ms Banda', text: 'Keen to try fraction strips.', createdAt: '2026-11-09T08:00:00Z' }],
        patterns: [
          pattern({
            evidence: [
              { kind: 'result', id: 'res-1', label: 'Class Test 1, question 4' },
              { kind: 'record', id: 'rec-a', label: 'Quiz: Adding fractions, Mrs Naidoo, 12 Aug 2025' },
              { kind: 'note', id: 'obs-1', label: 'Teacher note, Ms Banda, 9 Nov 2026' },
              { kind: 'result', id: 'res-gone', label: 'Class Test 9, question 1' },
            ],
          }),
        ],
      }),
    )
    const [answer, rec, note, orphan] = v.groups.drafts[0]!.evidence
    expect(answer).toMatchObject({ kind: 'result', label: 'Class Test 1 · Q4', href: '/t/class-1/papers/paper-9?q=4' })
    expect(rec).toMatchObject({ kind: 'record', label: 'Quiz: Adding fractions, Mrs Naidoo, 12 Aug 2025' })
    expect(rec && 'sheet' in rec && rec.sheet).toMatchObject({
      title: 'Quiz: Adding fractions',
      teacher: 'Mrs Naidoo',
      grade: 5,
      term: 3,
      date: '12 Aug 2025',
      marks: '8 out of 20',
      text: 'Guessed the bottom number.',
      late: true,
    })
    expect(note && 'sheet' in note && note.sheet).toMatchObject({ title: 'Teacher note', teacher: 'Ms Banda', grade: 6, term: 4, date: '9 Nov 2026', text: 'Keen to try fraction strips.', marks: null, late: false })
    expect(orphan).toMatchObject({ kind: 'result', href: null })
  })

  it('lists the marked answers of one paper in question order: Q2 before Q10', () => {
    const answer = (n: number) => ({ id: `res-${n}`, correct: false, family: 'fractions', isoDate: '2026-11-03', label: `Class Test 1, question ${n}`, grade: 6, paperId: 'paper-9', n })
    const v = buildLongView(
      input({
        records: [record({ id: 'rec-a' })],
        results: [answer(1), answer(2), answer(10)],
        patterns: [
          pattern({
            evidence: [
              { kind: 'result', id: 'res-1', label: 'Class Test 1, question 1' },
              { kind: 'result', id: 'res-10', label: 'Class Test 1, question 10' },
              { kind: 'result', id: 'res-2', label: 'Class Test 1, question 2' },
              { kind: 'record', id: 'rec-a', label: 'Quiz: Adding fractions, Mrs Naidoo, 12 Aug 2025' },
            ],
          }),
        ],
      }),
    )
    expect(v.groups.drafts[0]!.evidence.map((e) => e.label)).toEqual([
      'Class Test 1 · Q1',
      'Class Test 1 · Q2',
      'Class Test 1 · Q10',
      'Quiz: Adding fractions, Mrs Naidoo, 12 Aug 2025',
    ])
  })

  it('orders each run of marked answers by question and leaves records and notes where they are (the parent list uses the same order)', () => {
    const c = (kind: 'result' | 'record' | 'note', label: string) => ({ kind, label })
    const out = inQuestionOrder([
      c('result', 'Class Test 1 · Q10'),
      c('result', 'Class Test 1 · Q2'),
      c('record', 'Quiz: Z, Mrs Naidoo, 1 Feb 2026'),
      c('result', 'Homework · Q11'),
      c('result', 'Homework · Q3'),
      c('note', 'Teacher note, term 3, Mrs Naidoo, 17 Aug 2025'),
    ])
    expect(out.map((e) => e.label)).toEqual([
      'Class Test 1 · Q2',
      'Class Test 1 · Q10',
      'Quiz: Z, Mrs Naidoo, 1 Feb 2026',
      'Homework · Q3',
      'Homework · Q11',
      'Teacher note, term 3, Mrs Naidoo, 17 Aug 2025',
    ])
  })

  it('states the decision in plain words', () => {
    const v = buildLongView(
      input({
        patterns: [
          pattern({ id: 'a', status: 'approved', approved_at: '2026-11-08T09:00:00Z', approved_by_name: 'Ms Banda' }),
          pattern({ id: 'd', status: 'discussed', family: 'shapes', kind: 'strength', approved_at: '2026-11-08T09:00:00Z', discussed_at: '2026-11-09T09:00:00Z', discussed_by_name: 'Ms Banda' }),
          pattern({ id: 'x', status: 'dismissed', family: 'data', kind: 'strength', dismissed_at: '2026-11-07T09:00:00Z' }),
        ],
      }),
    )
    expect(v.groups.approved[0]!.approvedOn).toBe('8 Nov 2026')
    expect(v.groups.shared[0]!.discussedOn).toBe('9 Nov 2026')
    expect(v.groups.setAside[0]!.dismissedOn).toBe('7 Nov 2026')
    expect(v.parentName).toBe('Thandi')
  })

  it('has no parent name when no approved link exists', () => {
    expect(buildLongView(input({ hasParent: false })).parentName).toBeNull()
    expect(buildLongView(input({ hasParent: true, child: { id: 'child-1', firstName: 'Amina', grade: 6, parentFirstName: null } })).parentName).toBe('the parent')
  })

  it('groups the terms of a stored pattern: the run first, the newer ones after', () => {
    expect(groupTerms([{ grade: 5, year: 2025, term: 3, percent: 40, points: 3 }, { grade: 6, year: 2026, term: 3, percent: 63, points: 16, since: true }])).toEqual({
      run: [{ grade: 5, year: 2025, term: 3, percent: 40, points: 3 }],
      since: [{ grade: 6, year: 2026, term: 3, percent: 63, points: 16 }],
    })
  })
})

describe('the update line', () => {
  const ev = (status: string, minutesAgo: number, finished = false) => ({
    status,
    created_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    finished_at: finished ? new Date(NOW.getTime() - (minutesAgo - 1) * 60_000).toISOString() : null,
    error: status === 'failed' ? 'boom' : null,
  })

  it('shows the last finished update', () => {
    const v = buildLongView(input({ events: [ev('done', 90, true)] }))
    expect(v.update.state).toBe('idle')
    expect(v.update.lastUpdated).toBe('today at 12:31')
  })

  it('shows a pending state while one is queued or running, and no last updated when there never was one', () => {
    expect(buildLongView(input({ events: [ev('running', 1)] })).update.state).toBe('running')
    expect(buildLongView(input({ events: [ev('queued', 2)] })).update.state).toBe('running')
    expect(buildLongView(input({ events: [] })).update.lastUpdated).toBeNull()
  })

  it('shows the failed state when the newest update failed, but not when a newer one is running', () => {
    expect(buildLongView(input({ events: [ev('failed', 5), ev('done', 90, true)] })).update.state).toBe('failed')
    expect(buildLongView(input({ events: [ev('running', 1), ev('failed', 5)] })).update.state).toBe('running')
  })

  it('never carries the raw error of a failed update to the screen', () => {
    const v = buildLongView(input({ events: [ev('failed', 5)] }))
    expect(Object.keys(v.update).sort()).toEqual(['askOnOpen', 'lastUpdated', 'state'])
    expect(JSON.stringify(v)).not.toContain('boom')
  })

  it('does not wait for ever on an update that nobody picked up', () => {
    expect(buildLongView(input({ events: [ev('queued', 40)] })).update.state).toBe('failed')
    expect(buildLongView(input({ events: [ev('running', 20)] })).update.state).toBe('failed')
  })

  it('asks for an update on open only with no pattern rows and no update in the last 10 minutes', () => {
    expect(buildLongView(input({ patterns: [], events: [] })).update.askOnOpen).toBe(true)
    expect(buildLongView(input({ patterns: [], events: [ev('done', 30, true)] })).update.askOnOpen).toBe(true)
    expect(buildLongView(input({ patterns: [], events: [ev('done', 5, true)] })).update.askOnOpen).toBe(false)
    expect(buildLongView(input({ patterns: [], events: [ev('failed', 3)] })).update.askOnOpen).toBe(false)
    expect(buildLongView(input({ patterns: [pattern()], events: [] })).update.askOnOpen).toBe(false)
  })

  it('writes the time in plain words', () => {
    expect(whenLabel('2026-11-10T08:12:00Z', NOW)).toBe('today at 10:12')
    expect(whenLabel('2026-11-09T08:12:00Z', NOW)).toBe('yesterday at 10:12')
    expect(whenLabel('2026-11-03T08:12:00Z', NOW)).toBe('Tue 3 Nov at 10:12')
  })
})

describe('the card on the profile page', () => {
  const row = (status: string, active = true) => ({ status, active })
  it('says how many patterns wait, or were checked, or that it is too early', () => {
    expect(summaryLine([row('draft'), row('draft'), row('approved')])).toBe('2 patterns wait for you')
    expect(summaryLine([row('draft')])).toBe('1 pattern waits for you')
    expect(summaryLine([row('approved'), row('discussed')])).toBe('2 patterns you have checked')
    expect(summaryLine([row('approved')])).toBe('1 pattern you have checked')
    expect(summaryLine([])).toBe('Too early to tell')
    expect(summaryLine([row('draft', false)])).toBe('Too early to tell')
    expect(summaryLine([row('dismissed')])).toBe('You set aside 1 pattern')
  })
})


describe('subjects', () => {
  const english = (over: Partial<LongViewRecord> & { year: number; term: number }) =>
    record({ subject: 'English', family: 'reading', title: 'Reading quiz', teacherName: 'Mrs Zulu', marks: 6, outOf: 20, ...over })
  /** Amina's Mathematics from `input()` (fractions and shapes, Grade 5 Term 3 to Grade 6 Term 1) and three terms of English reading. */
  const both = (over: Partial<LongViewInput> = {}) =>
    input({
      records: [
        ...input().records,
        english({ id: 'e1', grade: 6, year: 2025, term: 4, happenedOn: '2025-11-03' }),
        english({ id: 'e2', grade: 6, year: 2026, term: 1, happenedOn: '2026-02-03' }),
        english({ id: 'e3', grade: 6, year: 2026, term: 2, happenedOn: '2026-05-03' }),
      ],
      ...over,
    })

  it('a learner with one subject has one subject, shown as a heading and no chips', () => {
    const v = buildLongView(input())
    expect(v.subject).toBe('Mathematics')
    expect(v.subjects).toEqual([{ name: 'Mathematics', selected: true }])
  })

  it('a learner with two subjects has both, the subject of the class first, and the grid is the one asked for', () => {
    const v = buildLongView(both())
    expect(v.subjects).toEqual([
      { name: 'Mathematics', selected: true },
      { name: 'English', selected: false },
    ])
    expect(v.rows.map((r) => r.name)).toEqual(['Fractions', 'Shapes and space'])
    expect(v.columns.map((c) => `${c.grade}.${c.term}`)).toEqual(['5.3', '5.4', '6.1'])

    const en = buildLongView(both({ askedSubject: 'English' }))
    expect(en.subject).toBe('English')
    expect(en.subjects.map((s) => [s.name, s.selected])).toEqual([['Mathematics', false], ['English', true]])
    expect(en.rows.map((r) => r.name)).toEqual(['Reading'])
    expect(en.columns.map((c) => `${c.grade}.${c.term}`)).toEqual(['6.4', '6.1', '6.2'])
  })

  it('the class\'s subject comes first, and a subject that was not asked for falls back to it', () => {
    const v = buildLongView(both({ classSubject: 'English' }))
    expect(v.subjects.map((s) => s.name)).toEqual(['English', 'Mathematics'])
    expect(v.subject).toBe('English')
    expect(buildLongView(both({ askedSubject: 'Technology' })).subject).toBe('Mathematics')
    expect(buildLongView(both({ classSubject: 'English', askedSubject: 'maths' })).subject).toBe('Mathematics')
  })

  it('the class is in a subject the learner has no marks in: the other subject is shown, and with no marks at all the class\'s subject is named over an empty grid', () => {
    expect(buildLongView(input({ classSubject: 'English' })).subject).toBe('Mathematics')
    const none = buildLongView(input({ records: [], results: [], classSubject: 'English' }))
    expect(none.subject).toBe('English')
    expect(none.rows).toEqual([])
    expect(none.subjects).toEqual([{ name: 'English', selected: true }])
  })

  it('the same strand name in two subjects is two rows in two grids', () => {
    const data = (subject: string, percent: number, id: string) =>
      record({ id, subject, family: 'data', title: `${subject} data`, marks: percent / 5, outOf: 20, grade: 6, year: 2026, term: 1, happenedOn: '2026-02-03' })
    const v = buildLongView(input({ records: [data('Mathematics', 90, 'm'), data('Natural Sciences', 30, 'n')] }))
    expect(v.rows.map((r) => [r.name, r.cells[0]!.percent])).toEqual([['Data handling', 90]])
    const ns = buildLongView(input({ records: [data('Mathematics', 90, 'm'), data('Natural Sciences', 30, 'n')], askedSubject: 'Natural Sciences' }))
    expect(ns.rows.map((r) => [r.name, r.cells[0]!.percent])).toEqual([['Data', 30]])
  })

  it('a record with a family and no subject, and an answer with no subject, are Mathematics', () => {
    const v = buildLongView(input({ records: [record({ id: 'x', subject: null, grade: 6, year: 2026, term: 1, happenedOn: '2026-02-03' })], results: [{ id: 'r', correct: true, family: 'fractions', isoDate: '2026-03-03', label: 'Class Test 1, question 1', grade: 6, paperId: 'p', n: 1 }] }))
    expect(v.subjects).toEqual([{ name: 'Mathematics', selected: true }])
    expect(v.rows.map((r) => r.name)).toEqual(['Fractions'])
  })

  it('what Jemma could not use, and the span, are for the subject on the screen', () => {
    const v = buildLongView(
      both({
        records: [
          ...both().records,
          record({ id: 'unclear-maths', quality: 'unclear', title: 'Quiz: Fractions', happenedOn: '2025-08-12', term: 3 }),
          english({ id: 'unclear-english', quality: 'unclear', title: 'Reading: Poem', grade: 6, year: 2026, term: 3, happenedOn: '2026-08-12' }),
        ],
      }),
    )
    expect(v.unclear).toEqual(['Quiz: Fractions, Mrs Naidoo, 12 Aug 2025'])
    const en = buildLongView(both({ askedSubject: 'English', records: [...both().records, english({ id: 'unclear-english', quality: 'unclear', title: 'Reading: Poem', grade: 6, year: 2026, term: 3, happenedOn: '2026-08-12' })] }))
    expect(en.unclear).toEqual(['Reading: Poem, Mrs Zulu, 12 Aug 2026'])
    expect(en.spanLine).toMatch(/^Grade 6 · \d+ terms? · \d+ teachers?$/)
  })

  it('the patterns of every subject are listed, each with its subject and the strand\'s plain name, under the subjects in order', () => {
    const v = buildLongView(
      both({
        patterns: [
          pattern({ id: 'm1', subject: 'Mathematics', family: 'fractions', status: 'draft' }),
          pattern({ id: 'e1', subject: 'English', family: 'reading', title: 'Reading marks stayed low', status: 'approved', approved_at: '2026-11-08T09:00:00Z' }),
          pattern({ id: 'e2', subject: 'English', kind: 'strength', family: 'speaking_listening', status: 'draft' }),
        ],
      }),
    )
    expect(v.groups.drafts.map((p) => [p.subject, p.strand])).toEqual([['Mathematics', 'Fractions'], ['English', 'Speaking and listening']])
    expect(v.bySubject.map((g) => [g.subject, g.open.map((p) => p.id)])).toEqual([
      ['Mathematics', ['m1']],
      ['English', ['e2', 'e1']],
    ])
    expect(v.patternCount).toBe(3)
    expect(v.subjectPatternCount).toBe(1)
    expect(buildLongView(both({ askedSubject: 'English', patterns: [pattern({ id: 'e1', subject: 'English', family: 'reading' })] })).subjectPatternCount).toBe(1)
  })

  it('a pattern row an older version wrote has the default subject, and a subject that only has a pattern is still listed', () => {
    const v = buildLongView(input({ patterns: [pattern({ id: 'old', subject: undefined as unknown as string }), pattern({ id: 'ns', subject: 'Natural Sciences', family: 'life_living' })] }))
    expect(v.subjects.map((s) => s.name)).toEqual(['Mathematics', 'Natural Sciences'])
    expect(v.groups.drafts.map((p) => p.subject)).toEqual(['Mathematics', 'Natural Sciences'])
    expect(v.rows).not.toEqual([])
  })

  it('an answer links to its paper under the class the test belongs to, not the class in the address', () => {
    const v = buildLongView(
      both({
        classSubject: 'Mathematics',
        results: [
          { id: 'res-m', correct: false, family: 'fractions', isoDate: '2026-03-03', label: 'Class Test 1, question 2', grade: 6, subject: 'Mathematics', classId: 'class-1', paperId: 'paper-m', n: 2 },
          { id: 'res-e', correct: false, family: 'reading', isoDate: '2026-03-03', label: 'English Test 1, question 4', grade: 7, subject: 'English', classId: 'class-english', paperId: 'paper-e', n: 4 },
          { id: 'res-x', correct: false, family: 'fractions', isoDate: '2026-03-04', label: 'Homework, question 1', grade: 6, paperId: 'paper-h', n: 1 },
        ],
        patterns: [
          pattern({
            id: 'm1',
            evidence: [
              { kind: 'result', id: 'res-m', label: 'Class Test 1, question 2' },
              { kind: 'result', id: 'res-x', label: 'Homework, question 1' },
            ],
          }),
          pattern({ id: 'e1', subject: 'English', family: 'reading', evidence: [{ kind: 'result', id: 'res-e', label: 'English Test 1, question 4' }] }),
        ],
      }),
    )
    const hrefs = Object.fromEntries(v.groups.drafts.map((p) => [p.id, p.evidence.map((e) => (e.kind === 'result' ? e.href : null))]))
    expect(hrefs).toEqual({
      m1: ['/t/class-1/papers/paper-m?q=2', '/t/class-1/papers/paper-h?q=1'],
      e1: ['/t/class-english/papers/paper-e?q=4'],
    })
  })

  it('names a link by its subject, so the chips can address the grid', () => {
    expect(subjectLinkOf('/t/c/learners/k/long-view', 'English')).toBe('/t/c/learners/k/long-view?subject=English')
    expect(subjectLinkOf('/t/c/learners/k/long-view', 'Natural Sciences')).toBe('/t/c/learners/k/long-view?subject=Natural%20Sciences')
  })

  it('the strand name is by subject: the usual strand names, the subject\'s own, and a tidied fallback', () => {
    expect(strandName('data')).toBe('Data handling')
    expect(strandName('data', 'English')).toBe('Data')
    expect(strandName('life_living', 'Natural Sciences')).toBe('Life and living')
  })
})
