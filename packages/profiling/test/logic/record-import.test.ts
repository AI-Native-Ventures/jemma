import { describe, expect, test } from 'vitest'
import {
  MAX_ROWS,
  TableError,
  MappingError,
  applyFix,
  checkMapping,
  countRows,
  describeMapping,
  findProblems,
  matchLearner,
  parseDate,
  parseGrade,
  parseMark,
  parseTable,
  parseTermText,
  parseYear,
  readRows,
  recordDrafts,
  termFromDate,
  validateOneResult,
  type ReadContext,
} from '../../src/logic'
import type { ExistingRecord, FileMapping, ImportLearner } from '../../src/schemas'

// Code reads every row of a file. The model only says what the columns mean. Pure functions: no database, no model.

const five: ImportLearner[] = [
  { id: 'amina', firstName: 'Amina', lastName: null },
  { id: 'thabo', firstName: 'Thabo', lastName: null },
  { id: 'lerato', firstName: 'Lérato', lastName: null },
  { id: 'sipho', firstName: 'Sipho', lastName: null },
  { id: 'naledi', firstName: 'Naledi', lastName: null },
]
const twoAminas: ImportLearner[] = [
  { id: 'a-dube', firstName: 'Amina', lastName: 'Dube' },
  { id: 'a-khan', firstName: 'Amina', lastName: 'Khan' },
  { id: 'thabo', firstName: 'Thabo', lastName: null },
]
const families = [
  { family: 'fractions', label: 'Fractions' },
  { family: 'decimals', label: 'Decimals' },
  { family: 'shapes', label: 'Shapes and space' },
]
const ctx: ReadContext = { learners: five, subject: 'Mathematics', grade: 6, year: 2026, country: 'ZA', families }

const mapping = (over: Partial<FileMapping> = {}, fixed: Partial<FileMapping['fixed']> = {}): FileMapping => ({
  learner: 'Learner',
  mark: 'Mark',
  outOf: 'Total',
  percent: null,
  date: 'Date',
  term: null,
  year: null,
  grade: null,
  subject: null,
  title: 'Assessment',
  kind: null,
  topic: 'Topic',
  note: null,
  teacher: null,
  attendance: null,
  fixed: { kind: null, outOf: null, grade: null, year: null, term: null, subject: null, teacher: null, ...fixed },
  topics: [
    { text: 'Adding fractions', family: 'fractions' },
    { text: 'Decimals and money', family: 'decimals' },
    { text: 'Mystery', family: 'unsure' },
  ],
  ...over,
})

const TIDY = [
  'Learner,Date,Assessment,Topic,Mark,Total',
  'Amina,2025-05-14,Class Test 1,Adding fractions,14,20',
  'Thabo,2025-05-14,Class Test 1,Adding fractions,16,20',
].join('\n')

describe('parseTable', () => {
  test('reads commas, quotes and keeps row numbers as the file has them (the header is row 1)', () => {
    const t = parseTable('Learner,Mark\nAmina,14/20\n\nThabo,"15,5/20"\nLerato,"say ""hi"""\n')
    expect(t.header).toEqual(['Learner', 'Mark'])
    expect(t.rows).toEqual([
      { n: 2, cells: ['Amina', '14/20'] },
      { n: 4, cells: ['Thabo', '15,5/20'] },
      { n: 5, cells: ['Lerato', 'say "hi"'] },
    ])
    expect(t.blank).toBe(1)
  })

  test('reads tabs (a table pasted from a spreadsheet) and semicolons (a decimal comma file)', () => {
    expect(parseTable('Learner\tMark\nAmina\t14/20').rows[0]!.cells).toEqual(['Amina', '14/20'])
    const semi = parseTable('Learner;Mark\nAmina;14,5')
    expect(semi.rows[0]!.cells).toEqual(['Amina', '14,5'])
  })

  test('ignores a byte order mark and Windows line ends, and a quoted cell may hold a line break', () => {
    const t = parseTable('﻿Learner,Note\r\nAmina,"line one\nline two"\r\nThabo,ok\r\n')
    expect(t.header).toEqual(['Learner', 'Note'])
    expect(t.rows.map((r) => r.cells[1])).toEqual(['line one\nline two', 'ok'])
    expect(t.rows.map((r) => r.n)).toEqual([2, 3])
  })

  test('a row shorter than the header is padded, and an empty file is refused', () => {
    expect(parseTable('A,B,C\n1,2').rows[0]!.cells).toEqual(['1', '2', ''])
    expect(() => parseTable('   \n\n')).toThrow(TableError)
    expect(() => parseTable('Learner,Mark\n')).toThrow(/no rows/i)
  })

  test('more than 2,000 rows is refused, with the number in the message', () => {
    const big = ['Learner,Mark', ...Array.from({ length: MAX_ROWS + 1 }, () => 'Amina,1/2')].join('\n')
    expect(() => parseTable(big)).toThrow(/2,000/)
    const ok = ['Learner,Mark', ...Array.from({ length: MAX_ROWS }, () => 'Amina,1/2')].join('\n')
    expect(parseTable(ok).rows).toHaveLength(MAX_ROWS)
  })
})

describe('parseMark', () => {
  test.each([
    ['14/20', 14, 20],
    ['14 / 20', 14, 20],
    ['14 out of 20', 14, 20],
    ['14 of 20', 14, 20],
    ['14,5/20', 14.5, 20],
    ['70%', 70, 100],
    ['70 %', 70, 100],
    ['70,5%', 70.5, 100],
    ['14', 14, null],
    ['14,5', 14.5, null],
    ['14.5', 14.5, null],
    ['0', 0, null],
    [' 18/20 ', 18, 20],
  ])('%s', (text, marks, outOf) => {
    expect(parseMark(text)).toEqual({ ok: true, marks, outOf })
  })

  test('a blank cell is blank, and words are not a mark', () => {
    expect(parseMark('')).toEqual({ ok: false, blank: true })
    expect(parseMark('  ')).toEqual({ ok: false, blank: true })
    expect(parseMark('absent')).toEqual({ ok: false, blank: false })
    expect(parseMark('14/0')).toEqual({ ok: false, blank: false })
    expect(parseMark('-3')).toEqual({ ok: false, blank: false })
  })
})

describe('dates, terms, years and grades', () => {
  test.each([
    ['2025-05-14', '2025-05-14'],
    ['14/05/2025', '2025-05-14'],
    ['14-05-2025', '2025-05-14'],
    ['14.05.25', '2025-05-14'],
    ['14 May 2025', '2025-05-14'],
    ['14 may 2025', '2025-05-14'],
    ['May 14, 2025', '2025-05-14'],
    ['2025/05/14', '2025-05-14'],
    ['31/02/2025', null],
    ['May 2025', null],
    ['', null],
    ['soon', null],
  ])('parseDate %s', (text, iso) => expect(parseDate(text)).toBe(iso))

  test('term from a date follows the calendar of the school country', () => {
    expect(termFromDate('2025-01-01', 'ZA')).toBe(1)
    expect(termFromDate('2025-03-31', 'ZA')).toBe(1)
    expect(termFromDate('2025-04-01', 'ZA')).toBe(2)
    expect(termFromDate('2025-06-30', 'ZA')).toBe(2)
    expect(termFromDate('2025-07-01', 'ZA')).toBe(3)
    expect(termFromDate('2025-10-01', 'ZA')).toBe(4)
    expect(termFromDate('2025-12-31', 'ZA')).toBe(4)
    // The Long view counts calendar quarters everywhere, so another country gets the same four quarters.
    expect(termFromDate('2025-05-14', 'KE')).toBe(2)
  })

  test('parseTermText, parseYear and parseGrade', () => {
    expect(['1', 'T2', 'Term 3', 'term 4', 'T 1'].map(parseTermText)).toEqual([1, 2, 3, 4, 1])
    expect(['5', '0', 'Term', ''].map(parseTermText)).toEqual([null, null, null, null])
    expect(['2025', 'Year 2024', '2025/26', '25', ''].map(parseYear)).toEqual([2025, 2024, 2025, null, null])
    expect(['Grade 5', 'Gr 5', 'Gr5', '5', 'grade 12'].map(parseGrade)).toEqual([5, 5, 5, 5, 12])
    expect(['Grade 13', 'R', '0', ''].map(parseGrade)).toEqual([null, null, null, null])
  })
})

describe('matchLearner', () => {
  test('matches the first name, ignoring case and accents', () => {
    expect(matchLearner('amina', five)).toEqual({ childId: 'amina', options: [] })
    expect(matchLearner('LERATO', five)).toEqual({ childId: 'lerato', options: [] })
    expect(matchLearner('  Lérato  ', five)).toEqual({ childId: 'lerato', options: [] })
  })

  test('a name that is not in the class matches nobody', () => {
    expect(matchLearner('Pule', five)).toEqual({ childId: null, options: [] })
    expect(matchLearner('', five)).toEqual({ childId: null, options: [] })
  })

  test('a surname or a surname letter breaks a tie, and two matches stay two', () => {
    expect(matchLearner('Amina K', twoAminas).childId).toBe('a-khan')
    expect(matchLearner('Amina D.', twoAminas).childId).toBe('a-dube')
    expect(matchLearner('Amina Khan', twoAminas).childId).toBe('a-khan')
    expect(matchLearner('Khan, Amina', twoAminas).childId).toBe('a-khan')
    expect(matchLearner('Amina', twoAminas)).toEqual({ childId: null, options: ['a-dube', 'a-khan'] })
    expect(matchLearner('Amina Z', twoAminas)).toEqual({ childId: null, options: ['a-dube', 'a-khan'] })
  })

  test('one learner with that first name matches whatever follows it', () => {
    expect(matchLearner('Thabo Nkosi', twoAminas).childId).toBe('thabo')
  })
})

describe('checkMapping', () => {
  const header = ['Learner', 'Date', 'Assessment', 'Topic', 'Mark', 'Total']

  test('names a column the way the header spells it', () => {
    const { mapping: m } = checkMapping(mapping({ learner: ' learner ', mark: 'MARK' }), header)
    expect(m.learner).toBe('Learner')
    expect(m.mark).toBe('Mark')
  })

  test('a column that is not in the file is dropped and said', () => {
    const { mapping: m, warnings } = checkMapping(mapping({ topic: 'Subject area' }), header)
    expect(m.topic).toBeNull()
    expect(warnings.join(' ')).toMatch(/Subject area/)
  })

  test('a file needs a learner column and something to record', () => {
    expect(() => checkMapping(mapping({ learner: null }), header)).toThrow(MappingError)
    expect(() => checkMapping(mapping({ learner: 'Nobody' }), header)).toThrow(/learner/i)
    expect(() => checkMapping(mapping({ mark: null, outOf: null, percent: null, note: null, attendance: null }), header)).toThrow(/mark|note|attendance/i)
  })

  test('the same column cannot be two things, except the title and the topic of a piece of work', () => {
    expect(() => checkMapping(mapping({ mark: 'Learner' }), header)).toThrow(/Learner/)
    expect(() => checkMapping(mapping({ topic: 'Assessment' }), header)).not.toThrow()
    expect(checkMapping(mapping({ topic: 'Assessment' }), header).mapping).toMatchObject({ title: 'Assessment', topic: 'Assessment' })
  })
})

describe('readRows', () => {
  const read = (text: string, m = mapping(), c = ctx) => readRows(parseTable(text), m, c)

  test('applies the mapping to every row: learner, title, mark, term from the date, strand', () => {
    const { rows } = read(TIDY)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      n: 2, learner: 'Amina', childId: 'amina', piece: 'quiz', title: 'Class Test 1', subject: 'Mathematics',
      grade: 5, year: 2025, term: 2, date: '2025-05-14', marks: 14, outOf: 20, topic: 'Adding fractions', family: 'fractions', skip: false, keep: false,
    })
    expect(rows[1]).toMatchObject({ n: 3, childId: 'thabo', marks: 16 })
  })

  test('says what it assumed: the term calendar and the grade it worked out from the year', () => {
    const { assumptions } = read(TIDY)
    expect(assumptions.join(' ')).toMatch(/January to March is term 1/)
    expect(assumptions.join(' ')).toMatch(/Grade 5/)
  })

  test('file-wide values stand in for a missing column', () => {
    const text = 'Learner,Mark\nAmina,14/20\nThabo,12/20'
    const m = mapping({ date: null, title: null, topic: null, outOf: null }, { kind: 'project', grade: 5, year: 2025, term: 3, subject: 'English', teacher: 'Mrs Naidoo' })
    const { rows } = read(text, m)
    expect(rows[0]).toMatchObject({ piece: 'project', grade: 5, year: 2025, term: 3, date: '2025-07-01', subject: 'English', teacher: 'Mrs Naidoo', title: 'Project' })
    expect(rows[0]!.family).toBeNull()
  })

  test('the file-wide total, a percent column and a mark that carries its own total', () => {
    const fixedTotal = read('Learner,Date,Mark\nAmina,2025-05-14,14\n', mapping({ outOf: null, title: null, topic: null }, { outOf: 20 })).rows[0]!
    expect(fixedTotal).toMatchObject({ marks: 14, outOf: 20 })
    const percent = read('Learner,Date,Pct\nAmina,2025-05-14,70%\nThabo,2025-05-14,55\n', mapping({ mark: null, outOf: null, percent: 'Pct', title: null, topic: null })).rows
    expect(percent[0]).toMatchObject({ marks: 70, outOf: 100 })
    expect(percent[1]).toMatchObject({ marks: 55, outOf: 100 })
    const own = read('Learner,Date,Mark\nAmina,2025-05-14,"14 out of 20"\n', mapping({ outOf: null, title: null, topic: null })).rows[0]!
    expect(own).toMatchObject({ marks: 14, outOf: 20 })
  })

  test('a decimal comma mark is kept in whole numbers with the same share', () => {
    const r = read('Learner,Date,Mark,Total\nAmina,2025-05-14,"14,5",20\n', mapping({ title: null, topic: null })).rows[0]!
    expect(r).toMatchObject({ marks: 145, outOf: 200 })
    expect(r.marks! / r.outOf!).toBeCloseTo(14.5 / 20)
  })

  test('a term column wins over the date, and a year column gives the year of a row with no date', () => {
    const m = mapping({ date: null, term: 'Term', year: 'Year', title: null, topic: null })
    const { rows } = read('Learner,Term,Year,Mark,Total\nAmina,Term 3,2024,10,20\n', m)
    expect(rows[0]).toMatchObject({ term: 3, year: 2024, date: '2024-07-01' })
  })

  test('the kind of piece comes from the kind column in words', () => {
    const m = mapping({ kind: 'Type', title: null, topic: null })
    const { rows } = read('Learner,Date,Type,Mark,Total\nAmina,2025-05-14,Project work,10,20\nThabo,2025-05-14,Homework assignment,10,20\nSipho,2025-05-14,Test,10,20\n', m)
    expect(rows.map((r) => r.piece)).toEqual(['project', 'assignment', 'quiz'])
  })

  test('a blank line is not a row, and a row with nothing to add is kept as empty', () => {
    const t = parseTable('Learner,Date,Mark,Total\nAmina,2025-05-14,14,20\n\nThabo,2025-05-14,,\n')
    const { rows } = readRows(t, mapping({ title: null, topic: null }), ctx)
    expect(rows.map((r) => r.n)).toEqual([2, 4])
    expect(rows[1]!.piece).toBeNull()
  })

  test('a note with no mark is a note, and keeps the text as data', () => {
    const m = mapping({ mark: null, outOf: null, title: null, topic: null, note: 'Comment' })
    const { rows } = read('Learner,Date,Comment\nAmina,2025-05-14,Guesses when the bottom numbers differ\n', m)
    expect(rows[0]).toMatchObject({ piece: 'note', text: 'Guesses when the bottom numbers differ', family: null, subject: null })
  })

  test('a mark with a note keeps the note on the marked piece', () => {
    const m = mapping({ note: 'Comment', title: null, topic: null })
    const { rows } = read('Learner,Date,Mark,Total,Comment\nAmina,2025-05-14,14,20,Careful work\n', m)
    expect(rows[0]).toMatchObject({ piece: 'quiz', text: 'Careful work', marks: 14 })
  })

  test('an attendance column reads present and total, or a percent', () => {
    const m = mapping({ mark: null, outOf: null, title: null, topic: null, attendance: 'Attendance' })
    const { rows } = read('Learner,Date,Attendance\nAmina,2025-05-14,45/50\nThabo,2025-05-14,90%\n', m)
    expect(rows[0]).toMatchObject({ piece: 'attendance', present: 45, total: 50 })
    expect(rows[1]).toMatchObject({ piece: 'attendance', present: 90, total: 100 })
  })

  test('the topic text goes to the strand the model chose, else to a strand its name says, else unsure', () => {
    const m = mapping({}, {})
    const text = [
      'Learner,Date,Assessment,Topic,Mark,Total',
      'Amina,2025-05-14,T,Adding fractions,1,2',
      'Amina,2025-05-14,T,Decimals and money,1,2',
      'Amina,2025-05-14,T,Mystery,1,2',
      'Amina,2025-05-14,T,Comparing fractions,1,2',
      'Amina,2025-05-14,T,Something else,1,2',
      'Amina,2025-05-14,T,,1,2',
    ].join('\n')
    expect(read(text, m).rows.map((r) => r.family)).toEqual(['fractions', 'decimals', null, 'fractions', null, null])
  })

  test('a strand the class does not offer is not trusted', () => {
    const m = mapping({ topics: [{ text: 'Adding fractions', family: 'robotics' }] })
    expect(read(TIDY, m).rows[0]!.family).toBe('fractions') // the name of the topic says fractions
    const m2 = mapping({ topics: [{ text: 'Adding fractions', family: 'robotics' }] })
    expect(read(TIDY.replace(/Adding fractions/g, 'Adding up'), m2).rows[0]!.family).toBeNull()
  })

  test('with no list of strands the model may propose short lowercase words', () => {
    const m = mapping({ topics: [{ text: 'Adding fractions', family: 'Number Sense!' }] })
    const { rows } = readRows(parseTable(TIDY), m, { ...ctx, families: null })
    expect(rows[0]!.family).toBe('number_sense')
    const none = readRows(parseTable(TIDY.replace(/Adding fractions/g, 'Odd')), mapping({ topics: [] }), { ...ctx, families: null })
    expect(none.rows[0]!.family).toBeNull()
  })

  test('the learner comes from the first name', () => {
    const { rows } = read('Learner,Date,Mark,Total\nlérato,2025-05-14,1,2\nPule,2025-05-14,1,2\n', mapping({ title: null, topic: null }))
    expect(rows.map((r) => r.childId)).toEqual(['lerato', null])
  })

  test('the file gives no grade and no year: the grade is not made up', () => {
    const { rows } = read('Learner,Mark,Total\nAmina,14,20\n', mapping({ date: null, title: null, topic: null }))
    expect(rows[0]).toMatchObject({ year: null, term: null, date: null, grade: null })
  })
})

describe('findProblems', () => {
  const rows = (text: string, c: ReadContext = ctx, m = mapping()) => readRows(parseTable(text), m, c).rows
  const problems = (text: string, c: ReadContext = ctx, existing: ExistingRecord[] = [], m = mapping()) =>
    findProblems(rows(text, c, m), { families: c.families, existing })
  const head = 'Learner,Date,Assessment,Topic,Mark,Total\n'

  test('a clean file has none', () => {
    expect(problems(TIDY)).toEqual([])
  })

  test('an unknown learner', () => {
    const p = problems(`${head}Pule,2025-05-14,T1,Adding fractions,14,20`)
    expect(p).toEqual([{ row: 2, kind: 'unknown_learner', text: expect.stringContaining('Pule') }])
  })

  test('two learners match', () => {
    const p = problems(`${head}Amina,2025-05-14,T1,Adding fractions,14,20`, { ...ctx, learners: twoAminas })
    expect(p).toEqual([{ row: 2, kind: 'two_learners', text: expect.stringContaining('Amina') }])
  })

  test('a mark above the total', () => {
    const p = problems(`${head}Amina,2025-05-14,T1,Adding fractions,25,20`)
    expect(p).toEqual([{ row: 2, kind: 'mark_above_total', text: expect.stringContaining('25') }])
  })

  test('no term and no date', () => {
    const m = mapping({ date: null })
    const p = problems('Learner,Assessment,Topic,Mark,Total\nAmina,T1,Adding fractions,14,20', ctx, [], m)
    expect(p.map((x) => x.kind)).toEqual(['no_term_or_date'])
  })

  test('a topic that is unsure', () => {
    const p = problems(`${head}Amina,2025-05-14,T1,Mystery,14,20`)
    expect(p).toEqual([{ row: 2, kind: 'topic_unsure', text: expect.stringContaining('Mystery') }])
  })

  test('a mark that cannot be read, and a mark with no total', () => {
    const bad = problems(`${head}Amina,2025-05-14,T1,Adding fractions,absent,20`)
    expect(bad.map((x) => x.kind)).toEqual(['bad_mark'])
    const noTotal = problems('Learner,Date,Assessment,Topic,Mark\nAmina,2025-05-14,T1,Adding fractions,14', ctx, [], mapping({ outOf: null }))
    expect(noTotal.map((x) => x.kind)).toEqual(['no_total'])
  })

  test('a row that repeats another row of the file names the first one', () => {
    const p = problems(`${head}Amina,2025-05-14,T1,Adding fractions,14,20\nThabo,2025-05-14,T1,Adding fractions,14,20\nAmina,2025-05-14,T1,Adding fractions,14,20`)
    expect(p).toEqual([{ row: 4, kind: 'repeat', text: expect.stringContaining('row 2') }])
  })

  test('a row that repeats a record the learner already has', () => {
    const existing: ExistingRecord[] = [
      { childId: 'amina', source: 'quiz', title: 'class test 1', happenedOn: '2025-05-14', year: 2025, term: 2, marks: 14, outOf: 20, text: null },
    ]
    const p = problems(TIDY, ctx, existing)
    expect(p).toEqual([{ row: 2, kind: 'repeat', text: expect.stringContaining('already has') }])
    // A different mark is not a repeat.
    expect(problems(TIDY, ctx, [{ ...existing[0]!, marks: 9 }])).toEqual([])
  })

  test('a skipped row and a kept repeat have no problems, and an empty row is not a problem', () => {
    const r = rows(`${head}Pule,2025-05-14,T1,Adding fractions,14,20\nAmina,2025-05-14,T1,Adding fractions,14,20\nAmina,2025-05-14,T1,Adding fractions,14,20\nThabo,2025-05-14,,,,`)
    r[0]!.skip = true
    r[2]!.keep = true
    expect(findProblems(r, { families, existing: [] })).toEqual([])
  })

  test('one row can have several problems, in the order the review shows them', () => {
    const p = problems(`${head}Pule,2025-05-14,T1,Mystery,25,20`)
    expect(p.map((x) => x.kind)).toEqual(['unknown_learner', 'mark_above_total', 'topic_unsure'])
  })
})

describe('applyFix', () => {
  const head = 'Learner,Date,Assessment,Topic,Mark,Total\n'
  const text = `${head}Pule,2025-05-14,T1,Mystery,14,20\nAmina,2025-05-14,T2,Mystery,14,20\nAmina,2025-05-14,T3,Mystery,14,20`
  const start = () => readRows(parseTable(text), mapping(), ctx).rows

  test('the teacher picks the learner', () => {
    const rows = applyFix(start(), { row: 2, childId: 'sipho' }, { learners: five, families })
    expect(rows[0]!.childId).toBe('sipho')
    expect(findProblems(rows, { families, existing: [] }).filter((p) => p.row === 2).map((p) => p.kind)).toEqual(['topic_unsure'])
  })

  test('a learner who is not in the class is refused', () => {
    expect(applyFix(start(), { row: 2, childId: 'someone-else' }, { learners: five, families })[0]!.childId).toBeNull()
  })

  test('the teacher changes the strand: every row with that topic text follows', () => {
    const rows = applyFix(start(), { row: 2, family: 'shapes' }, { learners: five, families })
    expect(rows.map((r) => r.family)).toEqual(['shapes', 'shapes', 'shapes'])
  })

  test('a strand the class does not offer is refused, and with no list a short word is tidied', () => {
    expect(applyFix(start(), { row: 2, family: 'robotics' }, { learners: five, families }).map((r) => r.family)).toEqual([null, null, null])
    expect(applyFix(start(), { row: 2, family: 'Number Sense' }, { learners: five, families: null }).map((r) => r.family)).toEqual(['number_sense', 'number_sense', 'number_sense'])
  })

  test('skip leaves the row out, and keep lets a repeat stay', () => {
    const rows = applyFix(applyFix(start(), { row: 2, skip: true }, { learners: five, families }), { row: 3, keep: true }, { learners: five, families })
    expect(rows[0]!.skip).toBe(true)
    expect(rows[1]!.keep).toBe(true)
    expect(rows[2]!.skip).toBe(false)
  })

  test('it does not change the rows it was given', () => {
    const before = start()
    const copy = JSON.parse(JSON.stringify(before))
    applyFix(before, { row: 2, skip: true }, { learners: five, families })
    expect(before).toEqual(copy)
  })
})

describe('recordDrafts and countRows', () => {
  const m = mapping({ note: 'Comment', attendance: 'Attendance' })
  const text = [
    'Learner,Date,Assessment,Topic,Mark,Total,Comment,Attendance',
    'Amina,2025-05-14,Class Test 1,Adding fractions,14,20,Careful,45/50',
    'Thabo,2025-05-14,,,,,Ask about the bottom numbers,',
    'Pule,2025-05-14,Class Test 1,Adding fractions,14,20,,',
    'Sipho,2025-05-14,,,,,,',
  ].join('\n')

  test('a marked row, a note row and an attendance part become records with what the Long view needs', () => {
    const { rows } = readRows(parseTable(text), m, ctx)
    const first = recordDrafts(rows[0]!)
    expect(first).toEqual([
      expect.objectContaining({ source: 'quiz', subject: 'Mathematics', family: 'fractions', topic_name: 'Adding fractions', title: 'Class Test 1', marks: 14, out_of: 20, text: 'Careful', grade: 5, year: 2025, term: 2, happened_on: '2025-05-14', teacher_name: 'Teacher not named' }),
      expect.objectContaining({ source: 'attendance', subject: null, family: null, present: 45, total: 50, title: 'Attendance', marks: null, year: 2025, term: 2 }),
    ])
    expect(recordDrafts(rows[1]!)).toEqual([expect.objectContaining({ source: 'note', subject: null, family: null, text: 'Ask about the bottom numbers', marks: null })])
    expect(recordDrafts(rows[3]!)).toEqual([])
  })

  test('counts: what will be added, what is left out and what waits', () => {
    const { rows } = readRows(parseTable(text), m, ctx)
    const problems = findProblems(rows, { families, existing: [] })
    expect(countRows(rows, problems)).toEqual({ rows: 4, ready: 2, withProblems: 1, skipped: 0, empty: 1, records: 3 })
    rows[2]!.skip = true
    expect(countRows(rows, findProblems(rows, { families, existing: [] }))).toEqual({ rows: 4, ready: 2, withProblems: 0, skipped: 1, empty: 1, records: 3 })
  })

  test('a row with an open problem writes nothing', () => {
    const { rows } = readRows(parseTable(text), m, ctx)
    const problems = findProblems(rows, { families, existing: [] })
    const left = new Set(problems.map((p) => p.row))
    expect(rows.filter((r) => !left.has(r.n)).flatMap(recordDrafts)).toHaveLength(3)
  })
})

describe('describeMapping', () => {
  const header = ['Learner', 'Date', 'Assessment', 'Topic', 'Mark']

  test('says each column in plain words, with the file-wide total', () => {
    const lines = describeMapping(mapping({ outOf: null }, { outOf: 20 }), header)
    expect(lines).toContain('The column Learner is the learner.')
    expect(lines).toContain('The column Mark is the mark.')
    expect(lines).toContain('Every result is out of 20.')
    expect(lines).toContain('The column Date is the date. The term comes from the date.')
    expect(lines).toContain('The column Assessment is the title of each piece of work.')
    expect(lines).toContain('The column Topic is the topic.')
  })

  test('says a file-wide value and a percent column', () => {
    const lines = describeMapping(mapping({ mark: null, outOf: null, percent: 'Pct', date: null }, { kind: 'quiz', grade: 5, year: 2025 }), header)
    expect(lines).toContain('The column Pct is the mark, as a percent.')
    expect(lines).toContain('Every row is a quiz.')
    expect(lines).toContain('Every row is Grade 5, 2025.')
  })

  test('has no em dash', () => {
    expect(describeMapping(mapping(), header).join('\n')).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('validateOneResult', () => {
  const c = { subject: 'Maths', year: 2026, families }
  const quiz = { kind: 'quiz', grade: '5', year: '2025', term: '2', title: 'Class Test 1', family: 'fractions', marks: '14', outOf: '20', teacherName: 'Mrs Naidoo' }

  test('a quiz becomes a record with the term start as its day and the class subject', () => {
    expect(validateOneResult(quiz, c)).toEqual({
      ok: true,
      value: {
        source: 'quiz', grade: 5, year: 2025, term: 2, happened_on: '2025-04-01', teacher_name: 'Mrs Naidoo', title: 'Class Test 1',
        subject: 'Mathematics', family: 'fractions', topic_name: null, marks: 14, out_of: 20, text: null, present: null, total: null,
      },
    })
  })

  test('a note needs its text and keeps no subject, strand or mark', () => {
    const note = validateOneResult({ kind: 'note', grade: 5, year: 2025, term: 3, text: ' Guesses when the bottom numbers differ ', teacherName: 'Mrs Naidoo' }, c)
    expect(note).toMatchObject({ ok: true, value: { source: 'note', title: 'Teacher note', subject: null, family: null, marks: null, text: 'Guesses when the bottom numbers differ', happened_on: '2025-07-01' } })
    expect(validateOneResult({ kind: 'note', grade: 5, year: 2025, term: 3, text: '  ', teacherName: 'x' }, c)).toEqual({ ok: false, error: 'Write the note' })
  })

  test('each missing or wrong field is one short sentence, in the order of the form', () => {
    const err = (over: Record<string, unknown>) => (validateOneResult({ ...quiz, ...over }, c) as { error: string }).error
    expect(err({ kind: 'exam' })).toBe('Pick what kind of piece this is')
    expect(err({ grade: '13' })).toBe('Pick a grade from 1 to 12')
    expect(err({ year: '' })).toMatch(/Type the year/)
    expect(err({ year: '2027' })).toBe('Past records are from 2026 or earlier')
    expect(err({ term: '5' })).toBe('Pick a term from 1 to 4')
    expect(err({ teacherName: ' ' })).toMatch(/teacher's name/)
    expect(err({ title: '' })).toBe('Give the piece a title')
    expect(err({ family: '' })).toBe('Pick the strand')
    expect(err({ family: 'robotics' })).toBe('Pick one of the strands in the list')
    expect(err({ marks: '' })).toMatch(/Type the marks/)
    expect(err({ outOf: '0' })).toMatch(/out of/)
    expect(err({ marks: '25' })).toBe('The marks cannot be more than the total')
  })

  test('a decimal comma mark is kept in whole numbers, and a named subject is kept', () => {
    const r = validateOneResult({ ...quiz, marks: '14,5', subject: 'english' }, { ...c, families: null }) as { ok: true; value: { marks: number; out_of: number; subject: string; family: string } }
    expect(r.value).toMatchObject({ marks: 145, out_of: 200, subject: 'English', family: 'fractions' })
  })
})
