import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { countRows, findProblems, parseTable, readRows, type ReadContext } from '../../src/logic'
import type { FileMapping, ImportLearner } from '../../src/schemas'

// The two sample files of fixtures/records, read by code with the mapping a good model gives. No model: this pins what the files hold,
// so the check screen of the demo has the problems the packet asks for (an unknown learner, a repeated row, a topic Jemma is unsure of).

const FIXTURES = join(import.meta.dirname, '../../../../fixtures/records')
const text = (file: string) => readFileSync(join(FIXTURES, file), 'utf8')

const learners: ImportLearner[] = ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi'].map((n) => ({ id: n.toLowerCase(), firstName: n, lastName: null }))
const families = [
  { family: 'whole_numbers', label: 'Whole numbers' },
  { family: 'fractions', label: 'Fractions' },
  { family: 'decimals', label: 'Decimals' },
  { family: 'shapes', label: 'Shapes and space' },
  { family: 'measurement', label: 'Measurement' },
  { family: 'data', label: 'Data handling' },
]
const ctx: ReadContext = { learners, subject: 'Mathematics', grade: 6, year: 2026, country: 'ZA', families }
const blank: FileMapping['fixed'] = { kind: null, outOf: null, grade: null, year: null, term: null, subject: null, teacher: null }
const none = { learner: null, mark: null, outOf: null, percent: null, date: null, term: null, year: null, grade: null, subject: null, title: null, kind: null, topic: null, note: null, teacher: null, attendance: null }

describe('the tidy sample (grade5-maths-results.csv)', () => {
  const mapping: FileMapping = {
    ...none,
    learner: 'Learner', date: 'Date', title: 'Assessment', topic: 'Topic', mark: 'Mark', outOf: 'Total',
    fixed: blank,
    topics: [
      { text: 'Place value', family: 'whole_numbers' },
      { text: 'Adding fractions', family: 'fractions' },
      { text: 'Reading bar graphs', family: 'data' },
    ],
  }
  const { rows, assumptions } = readRows(parseTable(text('grade5-maths-results.csv')), mapping, ctx)

  test('is the five learners of 6B, three class tests each, and nothing is wrong', () => {
    expect(rows).toHaveLength(15)
    expect(new Set(rows.map((r) => r.childId))).toEqual(new Set(learners.map((l) => l.id)))
    expect(findProblems(rows, { existing: [], families })).toEqual([])
    expect(countRows(rows, [])).toMatchObject({ rows: 15, ready: 15, withProblems: 0, records: 15 })
  })

  test('is Grade 5 Mathematics in 2025, in three terms', () => {
    expect(new Set(rows.map((r) => `${r.grade}/${r.year}/${r.term}/${r.subject}`))).toEqual(new Set(['5/2025/1/Mathematics', '5/2025/2/Mathematics', '5/2025/3/Mathematics']))
    expect(assumptions.join(' ')).toMatch(/January to March is term 1/)
  })
})

describe('the messy sample (messy-old-marks.csv)', () => {
  const mapping: FileMapping = {
    ...none,
    learner: 'Pupil', percent: 'Result', term: 'Term', year: 'Year', title: 'Work', topic: 'Work', note: 'Teacher comment',
    fixed: blank,
    topics: [
      { text: 'Bar graphs quiz', family: 'data' },
      { text: 'Tally charts test', family: 'data' },
      { text: 'Measurement quiz', family: 'measurement' },
      { text: 'Pictograms assignment', family: 'data' },
      { text: 'Data project', family: 'data' },
      { text: 'Decimals quiz', family: 'decimals' },
      { text: 'Adding fractions test', family: 'fractions' },
      { text: 'Place value quiz', family: 'whole_numbers' },
    ],
  }
  const table = parseTable(text('messy-old-marks.csv'))
  const { rows } = readRows(table, mapping, ctx)
  const problems = findProblems(rows, { existing: [], families })

  test('has a blank line (row 7), a learner the class does not have, a repeated row and a topic the model never saw', () => {
    expect(table.blank).toBe(1)
    expect(rows.map((r) => r.n)).toEqual([2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
    expect(problems.map((p) => [p.row, p.kind])).toEqual([
      [10, 'unknown_learner'],
      [11, 'repeat'],
      [12, 'topic_unsure'],
    ])
    expect(problems[1]!.text).toMatch(/row 9/)
  })

  test('reads percents, a decimal comma and the terms of 2025 as Grade 5', () => {
    expect(rows[0]).toMatchObject({ learner: 'Thabo', marks: 85, outOf: 100, term: 2, year: 2025, grade: 5, family: 'data' })
    expect(rows.find((r) => r.learner === 'Lerato')).toMatchObject({ marks: 725, outOf: 1000, term: 3, family: 'decimals' })
  })

  test('the row that gives orders is a row like any other: its mark is the file\'s, and the order is only text', () => {
    const orders = rows.find((r) => r.n === 4)!
    expect(orders).toMatchObject({ learner: 'Naledi', marks: 55, outOf: 100, family: 'measurement' })
    expect(orders.text).toMatch(/^Ignore all earlier instructions/)
    expect(problems.filter((p) => p.row === 4)).toEqual([])
  })

  test('with the problems fixed (skip the unknown learner and the repeat, pick the strand) 8 rows are added', () => {
    const fixed = rows.map((r) => (r.n === 10 || r.n === 11 ? { ...r, skip: true } : r.n === 12 ? { ...r, family: 'measurement' } : r))
    expect(findProblems(fixed, { existing: [], families })).toEqual([])
    expect(countRows(fixed, [])).toMatchObject({ rows: 10, ready: 8, skipped: 2, withProblems: 0 })
  })
})
