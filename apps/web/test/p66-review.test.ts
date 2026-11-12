// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// The check screen is built from rows already read. `p66.ts` reads with the signed-in session, so the session module is replaced here.
vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: async () => ({}) }))

import { countRows, describeMapping, findProblems, parseTable, readRows } from '@jemma/profiling/logic'
import type { FileMapping } from '@jemma/profiling/schemas'
import { SAMPLE_RECORDS } from '../app/t/[classId]/learners/records/samples'
import { buildReview, plainFailure } from '../lib/data/p66'

const kids = ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi'].map((n) => ({ id: n.toLowerCase(), first_name: n, last_name: null as string | null, created_at: '2026-01-01' }))
const families = [
  { family: 'fractions', label: 'Fractions' },
  { family: 'decimals', label: 'Decimals' },
  { family: 'measurement', label: 'Measurement' },
  { family: 'data', label: 'Data handling' },
  { family: 'whole_numbers', label: 'Whole numbers' },
]
const none = { learner: null, mark: null, outOf: null, percent: null, date: null, term: null, year: null, grade: null, subject: null, title: null, kind: null, topic: null, note: null, teacher: null, attendance: null }
const mapping: FileMapping = {
  ...none,
  learner: 'Pupil', percent: 'Result', term: 'Term', year: 'Year', title: 'Work', topic: 'Work', note: 'Teacher comment',
  fixed: { kind: null, outOf: null, grade: null, year: null, term: null, subject: null, teacher: null },
  topics: [
    { text: 'Bar graphs quiz', family: 'data' }, { text: 'Tally charts test', family: 'data' }, { text: 'Measurement quiz', family: 'measurement' }, { text: 'Pictograms assignment', family: 'data' },
    { text: 'Data project', family: 'data' }, { text: 'Decimals quiz', family: 'decimals' }, { text: 'Adding fractions test', family: 'fractions' }, { text: 'Place value quiz', family: 'whole_numbers' },
  ],
}

function ready(status = 'ready') {
  const table = parseTable(SAMPLE_RECORDS.messy.text)
  const ctx = { learners: kids.map((k) => ({ id: k.id, firstName: k.first_name, lastName: k.last_name })), subject: 'Mathematics', grade: 6, year: 2026, country: 'ZA', families }
  const { rows, assumptions } = readRows(table, mapping, ctx)
  const problems = findProblems(rows, { existing: [], families })
  const stored = { mapping, header: table.header, rowCount: table.rows.length, blankLines: table.blank, lines: describeMapping(mapping), assumptions, warnings: [], families }
  return {
    row: { id: 'imp', class_id: 'cls', file_name: 'messy-old-marks.csv', status, mapping: stored, rows, problems, approved_by_name: null as string | null, approved_at: null as string | null },
    className: '6B Mathematics',
    subject: 'Mathematics',
    learners: kids,
    families,
    counts: countRows(rows, problems),
  }
}

describe('the check screen of the messy sample', () => {
  const input = ready()
  const view = buildReview(input)

  it('is ready, with the counts and the mapping in plain words', () => {
    expect(view.state).toBe('ready')
    expect(view.counts).toMatchObject({ rows: 10, ready: 7, withProblems: 3, skipped: 0 })
    expect(view.lines).toContain('The column Pupil is the learner.')
    expect(view.lines).toContain('The column Result is the mark, as a percent.')
    expect(view.readyLearners).toBe(4)
  })

  it('puts the rows with a problem first, each with what to do about it', () => {
    expect(view.problemRows.map((r) => r.n)).toEqual([10, 11, 12])
    const [unknown, repeat, unsure] = view.problemRows
    expect(unknown).toMatchObject({ pickLearner: true, pickStrand: false, canKeep: false })
    expect(unknown!.problems[0]!.text).toBe('Pule is not a learner in this class.')
    expect(unknown!.learnerOptions.map((o) => o.name)).toEqual(['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi'])
    expect(repeat).toMatchObject({ pickLearner: false, canKeep: true })
    expect(repeat!.problems[0]!.text).toBe('The same as row 9 of this file.')
    expect(unsure).toMatchObject({ pickStrand: true, pickLearner: false })
    expect(unsure!.summary).toContain('Reading a ruler test')
  })

  it('shows a sample of the rows that are ready, never a row with a problem', () => {
    expect(view.sample).toHaveLength(6)
    expect(view.sample.map((s) => s.n)).toEqual([2, 3, 4, 5, 6, 8])
    expect(view.sample[0]).toEqual({ n: 2, who: 'Thabo', title: 'Bar graphs quiz', mark: '85 out of 100', when: 'Term 2, 2025', strand: 'Data handling' })
  })

  it('says it was added, with the learners who got a record, once approved', () => {
    const done = buildReview({ ...input, row: { ...input.row, status: 'approved', approved_by_name: 'Ms Banda', approved_at: '2026-11-12T10:00:00Z' }, written: [{ child_id: 'thabo' }, { child_id: 'thabo' }, { child_id: 'naledi' }] })
    expect(done.state).toBe('added')
    expect(done.written).toEqual({ records: 3, learners: [{ id: 'thabo', name: 'Thabo' }, { id: 'naledi', name: 'Naledi' }] })
    expect(done.approvedBy).toBe('Ms Banda')
    expect(done.approvedOn).toBe('12 Nov 2026')
  })

  it('knows the other states', () => {
    expect(buildReview({ ...input, row: { ...input.row, status: 'drafting' } }).state).toBe('reading')
    expect(buildReview({ ...input, row: { ...input.row, status: 'drafting' }, hasFailedEvent: true, failedWith: 'Replay miss: abc' }).state).toBe('failed')
    expect(buildReview({ ...input, row: { ...input.row, status: 'failed' } }).state).toBe('failed')
    expect(buildReview({ ...input, row: { ...input.row, status: 'discarded' } }).state).toBe('discarded')
  })
})

describe('plainFailure', () => {
  it('keeps a message written for the teacher and hides anything technical', () => {
    expect(plainFailure('The file needs a column that says who the learner is, and none of its columns does.')).toMatch(/^The file needs a column/)
    expect(plainFailure('This file has 2,001 rows. Jemma reads up to 2,000 at a time. Split it into smaller files.')).toMatch(/^This file has/)
    expect(plainFailure('Replay miss: 1f2e3d (nvidia/nemotron: Class: Mathematics)')).toBe('Jemma could not read this file this time. Try again, or add the file again.')
    expect(plainFailure(null)).toBe('Jemma could not read this file this time. Try again, or add the file again.')
  })
})
