import { describe, expect, test } from 'vitest'
import { buildMyMaths, type MyMathsInput } from '../src/logic'
import { loadMyMathsInput } from '../src/tools/read/practice-input'
import { memoryDb } from './helpers/memory-db'

// P87, decision 5: "All of Mathematics" for a learner of a senior class (Mathematics, Grades 7 to 12) whose class has an approved map lists the
// families of that map, in the order they first appear in it, plus any of the six primary strands that holds a score of the learner. Everyone else
// sees exactly what they saw. No database, no network.

const NOW = new Date('2026-11-14T15:00:00.000Z')

const topic = (id: string, name: string, family: string, term: number, position: number) => ({ id, name, family, term, position, prerequisiteIds: [] as string[] })
/** A Grade 10 map as the CAPS draft makes it: algebra, functions, trigonometry, analytical geometry, shapes, finance. */
const GRADE_10 = [
  topic('t-alg1', 'Expanding brackets', 'algebra', 1, 1),
  topic('t-fun1', 'Straight line graphs', 'functions', 1, 2),
  topic('t-alg2', 'Factorising', 'algebra', 1, 3),
  topic('t-trig1', 'Right-angled triangles', 'trigonometry', 2, 1),
  topic('t-ag1', 'Distance between points', 'analytical_geometry', 2, 2),
  topic('t-sh1', 'Properties of triangles', 'shapes', 3, 1),
  topic('t-fin1', 'Simple interest', 'finance', 3, 2),
]

const base: MyMathsInput = { now: NOW, subject: 'Mathematics', topics: [], gaps: [], answers: [], sessions: [], history: [] }
const input = (over: Partial<MyMathsInput>): MyMathsInput => ({ ...base, ...over })
const families = (i: MyMathsInput) => buildMyMaths(i).strands.map((s) => s.family)
const answer = (topicName: string, correct: boolean, over: Partial<MyMathsInput['answers'][number]> = {}): MyMathsInput['answers'][number] => ({
  topicId: null, topicName, family: null, correct, paperStatus: 'marked', testHeld: false, ...over,
})
const session = (topicName: string, family: string | null, tries: boolean[]): MyMathsInput['sessions'][number] => ({
  topicId: null, topicName, family, status: 'done', finishedAt: '2026-11-10T16:00:00Z', items: tries.map((correct) => ({ phase: 'try', correct })),
})

const PRIMARY = ['whole_numbers', 'fractions', 'decimals', 'shapes', 'measurement', 'data']

describe('a learner of Grade 10 with an approved map', () => {
  const grade10 = input({ grade: 10, topics: GRADE_10 })

  test('sees the families of the map in the order they first appear (term, then position), and none of the primary strands the map does not have', () => {
    expect(families(grade10)).toEqual(['algebra', 'functions', 'trigonometry', 'analytical_geometry', 'shapes', 'finance'])
  })

  test('each with the label of strandLabel, and its topics', () => {
    const out = buildMyMaths(grade10)
    expect(out.strands.map((s) => s.label)).toEqual(['Algebra', 'Functions', 'Trigonometry', 'Analytical geometry', 'Shapes and space', 'Finance'])
    expect(out.strands[0]!.topics.map((t) => t.name)).toEqual(['Expanding brackets', 'Factorising'])
    expect(out.strands[3]!.topics.map((t) => t.name)).toEqual(['Distance between points'])
  })

  test('no "Whole numbers", no "Fractions", no "Decimals", no "Measurement", no "Data handling" with nothing in them', () => {
    const labels = buildMyMaths(grade10).strands.map((s) => s.label)
    for (const gone of ['Whole numbers', 'Fractions', 'Decimals', 'Measurement', 'Data handling']) expect(labels).not.toContain(gone)
  })

  test('the order is by term and position, whatever order the topics came in', () => {
    expect(families(input({ grade: 10, topics: [...GRADE_10].reverse() }))).toEqual(['algebra', 'functions', 'trigonometry', 'analytical_geometry', 'shapes', 'finance'])
    const swapped = [topic('a', 'A', 'functions', 2, 1), topic('b', 'B', 'algebra', 1, 5), topic('c', 'C', 'calculus', 1, 6)]
    expect(families(input({ grade: 12, topics: swapped }))).toEqual(['algebra', 'calculus', 'functions'])
  })

  test('a primary strand that the map has is where the map puts it, with or without a score', () => {
    const out = buildMyMaths(grade10)
    expect(out.strands.findIndex((s) => s.family === 'shapes')).toBe(4)
    expect(out.strands.find((s) => s.family === 'shapes')!.score).toEqual({ right: 0, asked: 0 })
  })

  test('a primary strand that holds a score of the learner (an answer or a session) is listed after the map families, in the primary order', () => {
    const out = buildMyMaths(
      input({
        grade: 10,
        topics: GRADE_10,
        answers: [answer('Equivalent fractions', true, { family: 'fractions' }), answer('Equivalent fractions', false, { family: 'fractions' })],
        sessions: [session('Place value', 'whole_numbers', [true, true, false])],
      }),
    )
    expect(out.strands.map((s) => s.family)).toEqual(['algebra', 'functions', 'trigonometry', 'analytical_geometry', 'shapes', 'finance', 'whole_numbers', 'fractions'])
    expect(out.strands.at(-2)!.score).toEqual({ right: 2, asked: 3 })
    expect(out.strands.at(-1)!.score).toEqual({ right: 1, asked: 2 })
  })

  test('an answer that is found by the name of its topic, not its family, still lists its strand', () => {
    const out = buildMyMaths(input({ grade: 10, topics: GRADE_10, answers: [answer('Decimals', true)] }))
    expect(out.strands.map((s) => s.family)).toContain('decimals')
  })

  test('a primary strand with no topic in the map and no score is not listed, and a session with no Try answer is no score', () => {
    const out = buildMyMaths(input({ grade: 10, topics: GRADE_10, sessions: [session('Place value', 'whole_numbers', [])] }))
    expect(out.strands.map((s) => s.family)).not.toContain('whole_numbers')
  })

  test('the score of a map family is the learner\'s, as before', () => {
    const out = buildMyMaths(input({ grade: 10, topics: GRADE_10, answers: [answer('Factorising', true, { topicId: 't-alg2' }), answer('Factorising', false, { topicId: 't-alg2' })] }))
    expect(out.strands[0]!.score).toEqual({ right: 1, asked: 2 })
  })

  test.each([[7], [8], [9], [11], [12]])('Grade %i is senior too', (grade) => {
    expect(families(input({ grade, topics: GRADE_10 }))).toEqual(['algebra', 'functions', 'trigonometry', 'analytical_geometry', 'shapes', 'finance'])
  })
})

describe('everyone else sees what they always saw', () => {
  const today = (i: MyMathsInput) => buildMyMaths({ ...i, grade: undefined })

  test('a Grade 6 learner with a map: the six strands, then any other family of the map', () => {
    const map = [topic('t1', 'Adding fractions', 'fractions', 4, 1), topic('t2', 'Patterns', 'patterns', 4, 2)]
    const out = buildMyMaths(input({ grade: 6, topics: map }))
    expect(out.strands.map((s) => s.family)).toEqual([...PRIMARY, 'patterns'])
    expect(out).toEqual(today(input({ grade: 6, topics: map })))
  })

  test('a senior learner whose class has no approved map: the six strands', () => {
    expect(families(input({ grade: 10, topics: [] }))).toEqual(PRIMARY)
    expect(buildMyMaths(input({ grade: 10, topics: [] }))).toEqual(today(input({ grade: 10, topics: [] })))
  })

  test('a learner with no grade known: the same as before', () => {
    expect(families(input({ topics: GRADE_10 }))).toEqual([...PRIMARY, 'algebra', 'functions', 'trigonometry', 'analytical_geometry', 'finance'])
    expect(families(input({ grade: null, topics: GRADE_10 }))).toEqual([...PRIMARY, 'algebra', 'functions', 'trigonometry', 'analytical_geometry', 'finance'])
  })

  test.each([[1], [4], [6], [13], [0]])('Grade %i is not senior: the six strands first', (grade) => {
    expect(families(input({ grade, topics: GRADE_10 })).slice(0, 6)).toEqual(PRIMARY)
  })

  test('another subject of Grade 10 is not Mathematics: its own list', () => {
    const out = buildMyMaths(input({ subject: 'English', grade: 10, topics: [topic('e1', 'Poetry', 'reading', 1, 1)] }))
    expect(out.strands.map((s) => s.family)).toEqual(['reading', 'writing', 'language', 'speaking_listening'])
  })
})

describe('the loader tells buildMyMaths the grade of the learner\'s class', () => {
  const CHILD = '33333333-3333-4333-8333-333333333333'
  const CLASS = '22222222-2222-4222-8222-222222222222'
  const MAP = '44444444-4444-4444-8444-444444444444'
  const world = (grade: number, approved = true) =>
    memoryDb({
      children: [{ id: CHILD, school_id: 's', first_name: 'Sam', grade }],
      enrolments: [{ child_id: CHILD, class_id: CLASS }],
      classes: [{ id: CLASS, subject: 'Mathematics', grade }],
      curriculum_maps: [{ id: MAP, class_id: CLASS, status: approved ? 'approved' : 'draft' }],
      topics: GRADE_10.map((t) => ({ id: t.id, map_id: MAP, name: t.name, family: t.family, term: t.term, position: t.position, prerequisite_ids: [] })),
      gaps: [],
      tests: [],
      papers: [],
      question_results: [],
      sessions: [],
      session_items: [],
      learner_records: [],
      observations: [],
    })

  test('a Grade 10 learner with an approved map', async () => {
    const loaded = await loadMyMathsInput(world(10), CHILD, NOW)
    expect(loaded.grade).toBe(10)
    expect(buildMyMaths(loaded).strands.map((s) => s.family)).toEqual(['algebra', 'functions', 'trigonometry', 'analytical_geometry', 'shapes', 'finance'])
  })

  test('a Grade 10 learner whose map is not approved yet sees the six strands', async () => {
    const loaded = await loadMyMathsInput(world(10, false), CHILD, NOW)
    expect(loaded.topics).toEqual([])
    expect(buildMyMaths(loaded).strands.map((s) => s.family)).toEqual(PRIMARY)
  })

  test('a Grade 6 learner has the grade 6 and the old list', async () => {
    const loaded = await loadMyMathsInput(world(6), CHILD, NOW)
    expect(loaded.grade).toBe(6)
    expect(buildMyMaths(loaded).strands.map((s) => s.family).slice(0, 6)).toEqual(PRIMARY)
  })
})
