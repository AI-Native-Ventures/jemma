import { describe, expect, test } from 'vitest'
import { buildMyMaths } from '../src/logic'
import { loadChoiceRules, loadMyMathsInput } from '../src/tools/read/practice-input'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// What the loaders read for the learner's screens, with the tables in memory: no database, no network. The score of a learner is made from
// their OWN answers, by their id, and only from what counts (see logic/my-maths.ts).

const CHILD = '33333333-3333-4333-8333-333333333333'
const OTHER_CHILD = '33333333-3333-4333-8333-3333333333ff'
const CLASS = '22222222-2222-4222-8222-222222222222'
const MAP = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-11-13T15:00:00.000Z')

type Row = Record<string, unknown>
const answer = (paper: string, topicName: string, topicId: string | null, correct: boolean, child = CHILD): Row => ({ id: crypto.randomUUID(), child_id: child, paper_id: paper, topic_id: topicId, topic_name: topicName, correct })

function world(over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    children: [{ id: CHILD, school_id: 's', first_name: 'Amina', grade: 6 }],
    enrolments: [{ child_id: CHILD, class_id: CLASS }],
    classes: [{ id: CLASS, subject: 'Maths', grade: 6 }],
    curriculum_maps: [{ id: MAP, class_id: CLASS, status: 'approved' }, { id: 'old-map', class_id: CLASS, status: 'draft' }],
    topics: [
      { id: 't-add', map_id: MAP, name: 'Adding fractions', family: 'fractions', term: 4, position: 1, prerequisite_ids: [] },
      { id: 't-dec', map_id: MAP, name: 'Adding decimals', family: 'decimals', term: 4, position: 2, prerequisite_ids: null },
      { id: 't-draft', map_id: 'old-map', name: 'A draft topic', family: 'shapes', term: 1, position: 1, prerequisite_ids: [] },
    ],
    gaps: [{ id: 'g1', child_id: CHILD, topic_id: 't-add', topic_name: 'Adding fractions', stage: 'practising', created_at: '2026-10-01T08:00:00Z', fixed_at: null }],
    tests: [
      { id: 'shared', held: false, class_id: CLASS, title: 'Class Test 1', written_on: '2026-11-02' },
      { id: 'held', held: true, class_id: CLASS, title: 'Class Test 2', written_on: '2026-11-09' },
    ],
    papers: [
      { id: 'p-shared', test_id: 'shared', status: 'marked', created_at: '2026-11-02T08:00:00Z' },
      { id: 'p-held', test_id: 'held', status: 'marked', created_at: '2026-11-09T08:00:00Z' },
      { id: 'p-reading', test_id: 'shared', status: 'reading', created_at: '2026-11-02T09:00:00Z' },
      { id: 'p-homework', test_id: null, status: 'marked', created_at: '2026-11-05T08:00:00Z' },
    ],
    question_results: [
      ...[true, true, false].map((c) => answer('p-shared', 'Adding fractions', 't-add', c)),
      answer('p-held', 'Adding fractions', 't-add', true),
      answer('p-reading', 'Adding fractions', 't-add', true),
      answer('p-homework', 'Adding decimals', 't-dec', true),
      answer('p-shared', 'Adding fractions', 't-add', true, OTHER_CHILD),
    ],
    sessions: [
      { id: 's-done', child_id: CHILD, topic_id: 't-dec', topic_name: 'Adding decimals', status: 'done', finished_at: '2026-11-10T16:00:00Z' },
      { id: 's-planned', child_id: CHILD, topic_id: 't-dec', topic_name: 'Adding decimals', status: 'planned', finished_at: null },
      { id: 's-other', child_id: OTHER_CHILD, topic_id: 't-dec', topic_name: 'Adding decimals', status: 'done', finished_at: '2026-11-10T16:00:00Z' },
    ],
    session_items: [
      { session_id: 's-done', phase: 'warmup', correct: true },
      { session_id: 's-done', phase: 'try', correct: true },
      { session_id: 's-done', phase: 'try', correct: false },
      { session_id: 's-planned', phase: 'try', correct: true },
      { session_id: 's-other', phase: 'try', correct: true },
    ],
    learner_records: [],
    observations: [],
    ...over,
  })
}
const mine = async (db: MemoryDb) => buildMyMaths(await loadMyMathsInput(db, CHILD, NOW))
const topic = (out: ReturnType<typeof buildMyMaths>, id: string) => out.strands.flatMap((s) => s.topics).find((t) => t.id === id)!

describe('loadMyMathsInput', () => {
  test('the score counts the learner\'s own marked answers of a shared test and of a paper with no test, and the Try answers of a finished session', async () => {
    const out = await mine(world())
    // Adding fractions: 2 of 3 from the shared test. The held test, the paper being read and another learner's answer count nowhere.
    expect(topic(out, 't-add').score).toEqual({ right: 2, asked: 3 })
    // Adding decimals: the homework paper (1 of 1) and the Try answers of the finished session (1 of 2). The warm-up and the planned session count nowhere.
    expect(topic(out, 't-dec').score).toEqual({ right: 2, asked: 3 })
    expect(out.strands.find((s) => s.family === 'fractions')!.score).toEqual({ right: 2, asked: 3 })
  })

  test('the topics are those of the approved map only, and the subject is the class\'s (Maths is Mathematics)', async () => {
    const out = await mine(world())
    expect(out.strands.flatMap((s) => s.topics).map((t) => t.id).sort()).toEqual(['t-add', 't-dec'])
    expect(out.strands.map((s) => s.label).slice(0, 3)).toEqual(['Whole numbers', 'Fractions', 'Decimals'])
  })

  test('the test being shared makes its answers appear', async () => {
    const db = world()
    db.tables.tests![0]!.held = true
    expect(topic(await mine(db), 't-add').score).toEqual({ right: 0, asked: 0 })
    db.tables.tests![0]!.held = false
    expect(topic(await mine(db), 't-add').score).toEqual({ right: 2, asked: 3 })
  })

  test('a test the loader cannot find counts as held: nothing is shown for it', async () => {
    const db = world({ tests: [] })
    expect(topic(await mine(db), 't-add').score).toEqual({ right: 0, asked: 0 })
  })

  test('the gap and its stage ride on its topic, and the suggestion is the open gap', async () => {
    const out = await mine(world())
    expect(topic(out, 't-add').gap).toBe('practising')
    expect(out.suggestions).toEqual([{ topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'practising', reason: 'Practising', score: { right: 2, asked: 3 } }])
  })

  test('a learner in no class has no topics and the six parts with no score', async () => {
    const out = await mine(world({ enrolments: [], question_results: [], sessions: [], session_items: [], gaps: [] }))
    expect(out.strands).toHaveLength(6)
    expect(out.strands.every((s) => s.score.asked === 0 && s.topics.length === 0)).toBe(true)
    expect(out.suggestions).toEqual([])
  })

  test('past records are read for a suggestion only, never for a score', async () => {
    const records = [{ id: 'r1', child_id: CHILD, source: 'quiz', grade: 5, year: 2025, term: 3, happened_on: '2025-08-10', logged_at: '2025-08-11T08:00:00Z', teacher_name: 'Mrs N', title: 'Quiz', family: 'whole_numbers', topic_name: null, marks: 2, out_of: 10, quality: 'clear', text: null, present: null, total: null, subject: 'Mathematics', import_id: null, added_by: null, added_by_name: null }]
    const withRecords = await mine(world({ learner_records: records, gaps: [], question_results: [], sessions: [], session_items: [] }))
    expect(withRecords.strands.every((s) => s.score.asked === 0)).toBe(true)
    // no gap at all: the weakest strand of the past records is suggested
    expect(withRecords.suggestions[0]).toMatchObject({ topicName: 'Whole numbers', why: 'history', topicId: null })
  })
})

describe('loadChoiceRules', () => {
  test('the topics of the approved maps of the learner\'s classes, the learner\'s gaps and the subject', async () => {
    const rules = await loadChoiceRules(world(), CHILD)
    expect(rules.mapTopics.map((t) => t.name).sort()).toEqual(['Adding decimals', 'Adding fractions'])
    expect(rules.gaps).toEqual([{ topicId: 't-add', topicName: 'Adding fractions' }])
    expect(rules.subject).toBe('Mathematics')
  })

  test('a learner in no class has no topics and no subject', async () => {
    expect(await loadChoiceRules(world({ enrolments: [] }), CHILD)).toEqual({ mapTopics: [], gaps: [{ topicId: 't-add', topicName: 'Adding fractions' }], subject: null })
  })
})
