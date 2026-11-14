import { describe, expect, test } from 'vitest'
import { matchMapTopic } from '../src/logic/own-test'
import { OutOfScopeError, isWithImages, type ToolContext } from '../src/tools/context'
import { getOwnTest } from '../src/tools/read/get-own-test'
import { registry } from '../src/tools/registry'
import { saveOwnTestResults } from '../src/tools/save/save-own-test-results'
import { CHILD, ctxFor, EVENT, NOW, OTHER_SCHOOL, PAGE_1, PAGE_2, PAPER, PHOTO_BASE64, SCHOOL, ownTestWorld, q, readOf } from './helpers/own-test'

// The two tools behind a marked test a learner brought back: `get_own_test` (the pages and the topic names) and `save_own_test_results` (what the
// teacher marked, written as results). Tables and storage are in memory: no database, no model.

const read = async (ctx: ToolContext) => {
  const got = await getOwnTest.run(ctx, { paperId: PAPER })
  if (!isWithImages(got)) throw new Error('get_own_test must carry the pages')
  return got
}
type World = ReturnType<typeof ownTestWorld>
const save = (db: World, read: ReturnType<typeof readOf>, ctx: ToolContext = ctxFor(db)) => saveOwnTestResults.run(ctx, { paperId: PAPER, read })
const results = (db: World) => [...(db.tables.question_results ?? [])].sort((a, b) => Number(a.n) - Number(b.n))
const paper = (db: World) => db.tables.papers!.find((p) => p.id === PAPER)!

describe('both tools are in the registry', () => {
  test('get_own_test reads and save_own_test_results saves, each under its own name', () => {
    const names = registry.map((t) => t.name)
    expect(names).toContain('get_own_test')
    expect(names).toContain('save_own_test_results')
    expect(registry).toHaveLength(29)
  })
})

describe('get_own_test', () => {
  test('the pages in page order as images, and the topic names of the approved maps term by term', async () => {
    const got = await read(ctxFor(ownTestWorld()))
    expect(got.output).toEqual({
      paperId: PAPER,
      childId: CHILD,
      pageCount: 2,
      topicNames: ['Whole numbers', 'Equivalent fractions', 'Adding fractions with different denominators', 'Decimal fractions'],
    })
    expect(got.images).toEqual([
      { path: PAGE_1, mimeType: 'image/jpeg', data: PHOTO_BASE64 },
      { path: PAGE_2, mimeType: 'image/png', data: PHOTO_BASE64 },
    ])
  })

  test('a topic of a map that is not approved is not offered, and a name two maps share is offered once', async () => {
    const db = ownTestWorld({
      curriculum_maps: [
        { id: 'map-a', class_id: '22222222-2222-4222-8222-222222222222', status: 'approved' },
        { id: 'map-b', class_id: '22222222-2222-4222-8222-222222222222', status: 'draft' },
      ],
      topics: [
        { id: 'a1', map_id: 'map-a', name: 'Whole numbers', family: 'numbers', term: 1, position: 1 },
        { id: 'a2', map_id: 'map-a', name: 'Fractions', family: 'fractions', term: 1, position: 2 },
        { id: 'a3', map_id: 'map-a', name: 'whole  numbers', family: 'numbers', term: 2, position: 1 },
        { id: 'b1', map_id: 'map-b', name: 'Secret draft topic', family: 'x', term: 1, position: 1 },
      ],
    })
    expect((await read(ctxFor(db))).output.topicNames).toEqual(['Whole numbers', 'Fractions'])
  })

  test('a learner with no approved map gets an empty list, not an error', async () => {
    const db = ownTestWorld({ curriculum_maps: [] })
    expect((await read(ctxFor(db))).output.topicNames).toEqual([])
  })

  test('a paper of another school is refused', async () => {
    await expect(getOwnTest.run(ctxFor(ownTestWorld(), { schoolId: OTHER_SCHOOL }), { paperId: PAPER })).rejects.toBeInstanceOf(OutOfScopeError)
  })

  test('a paper that does not exist is refused', async () => {
    await expect(getOwnTest.run(ctxFor(ownTestWorld()), { paperId: '77777777-7777-4777-8777-777777777777' })).rejects.toBeInstanceOf(OutOfScopeError)
  })

  test("a class test of a teacher is not a learner's own test", async () => {
    const db = ownTestWorld({
      tests: [{ id: '66666666-6666-4666-8666-666666666666', class_id: '22222222-2222-4222-8222-222222222222', title: 'Class Test 1', held: true }],
      papers: [{ id: PAPER, child_id: CHILD, test_id: '66666666-6666-4666-8666-666666666666', owner: 'teacher', kind: 'test', status: 'queued' }],
    })
    await expect(getOwnTest.run(ctxFor(db), { paperId: PAPER })).rejects.toThrow("not a learner's own test")
  })

  test('the call is on the tool log, with the number of images and not the images', async () => {
    const db = ownTestWorld()
    await read(ctxFor(db))
    expect(db.tables.tool_calls!.map((r) => [r.tool, r.ok, r.school_id, r.event_id])).toEqual([['get_own_test', true, SCHOOL, EVENT]])
    expect(JSON.stringify(db.tables.tool_calls![0]!.output)).not.toContain(PHOTO_BASE64)
    expect((db.tables.tool_calls![0]!.output as { images: number }).images).toBe(2)
  })
})

describe('save_own_test_results: what the teacher marked is what is written', () => {
  test('a tick, a cross and a half mark are three results; only the tick is right', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Equivalent fractions'), q('2', 'wrong', 'Equivalent fractions'), q('3', 'part', 'Decimal fractions')]))
    const rows = results(db)
    expect(rows.map((r) => [r.n, r.correct, r.mark])).toEqual([[1, true, 1], [2, false, 0], [3, false, 0]])
    for (const r of rows) {
      expect(r).toMatchObject({ paper_id: PAPER, child_id: CHILD, misconception: null })
      expect(r.read_confidence).toBe(0.95)
    }
  })

  test("the learner's answer is stored as it was written, and the question as it was numbered on the page", async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('2a', 'wrong', 'Equivalent fractions', { prompt: 'Simplify 4/8', answerAsWritten: '4/2' })]))
    expect(results(db)[0]).toMatchObject({ n: 1, prompt: '2a. Simplify 4/8', answer_read: '4/2', correct: false })
  })

  test('the number of a question is the place it was read in, so 1, 2, 2a and 2b can all be stored', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers'), q('2a', 'right', 'Whole numbers'), q('2b', 'wrong', 'Whole numbers'), q('2', 'right', 'Whole numbers')]))
    expect(results(db).map((r) => r.n)).toEqual([1, 2, 3, 4])
    expect(results(db).every((r) => Number.isInteger(r.n) && Number.isInteger(r.mark))).toBe(true)
  })

  test('a mark is a whole number, because the column is: the half mark counts as not right', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'part', 'Whole numbers', { marksGot: 1, marksOutOf: 2 })]))
    expect(results(db)[0]).toMatchObject({ correct: false, mark: 0 })
  })

  test('the numbers of marks the teacher wrote do not change the result the teacher gave', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers', { marksGot: 0, marksOutOf: 2 }), q('2', 'wrong', 'Whole numbers', { marksGot: 2, marksOutOf: 2 })]))
    expect(results(db).map((r) => [r.correct, r.mark])).toEqual([[true, 1], [false, 0]])
  })

  test('a blank answer the teacher crossed is stored as a blank answer', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'wrong', 'Whole numbers', { answerAsWritten: '' })]))
    expect(results(db)[0]).toMatchObject({ answer_read: '', correct: false })
  })
})

describe('save_own_test_results: the topic', () => {
  const topicOf = async (topic: string) => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'wrong', topic)]))
    const r = results(db)[0]!
    return [r.topic_id, r.topic_name]
  }

  test('a topic the map has, by the name rule of the planner (case and spaces do not matter), gets the topic of the map', async () => {
    expect(await topicOf('equivalent fractions')).toEqual(['t-equivalent', 'Equivalent fractions'])
    expect(await topicOf('  EQUIVALENT   Fractions ')).toEqual(['t-equivalent', 'Equivalent fractions'])
  })

  test('a topic that shares words with a map topic gets the map topic that shares the most', async () => {
    expect(await topicOf('Adding fractions')).toEqual(['t-adding', 'Adding fractions with different denominators'])
    expect(await topicOf('Equivalent fraction pairs')).toEqual(['t-equivalent', 'Equivalent fractions'])
    expect(await topicOf('Fractions with different denominators')).toEqual(['t-adding', 'Adding fractions with different denominators'])
  })

  test('an unknown topic keeps the words of the model and has no topic id', async () => {
    expect(await topicOf('Time and calendars')).toEqual([null, 'Time and calendars'])
  })

  test('one short word in common is not enough', async () => {
    expect(await topicOf('Whole shapes')).toEqual([null, 'Whole shapes'])
    expect(await topicOf('Time with money')).toEqual([null, 'Time with money'])
  })

  test('with no approved map every topic keeps its words', async () => {
    const db = ownTestWorld({ curriculum_maps: [] })
    await save(db, readOf([q('1', 'wrong', 'Equivalent fractions')]))
    expect(results(db)[0]).toMatchObject({ topic_id: null, topic_name: 'Equivalent fractions' })
  })

  test('a topic with no words at all is stored under a plain name', async () => {
    expect(await topicOf('  ')).toEqual([null, 'Marked test'])
  })
})

describe('matchMapTopic (the rule on its own)', () => {
  const topics = [
    { id: 'a', name: 'Perimeter of shapes' },
    { id: 'b', name: 'Area of shapes' },
    { id: 'c', name: 'Number patterns' },
  ]

  test('the exact name first, then the most shared words, then the first of a tie', () => {
    expect(matchMapTopic('area of shapes', topics)?.id).toBe('b')
    expect(matchMapTopic('Perimeter shapes', topics)?.id).toBe('a')
    expect(matchMapTopic('shapes', topics)?.id).toBe('a')
  })

  test('at least two shared words, or one of six letters or more', () => {
    expect(matchMapTopic('patterns', topics)?.id).toBe('c')
    expect(matchMapTopic('area', topics)).toBeNull()
    expect(matchMapTopic('area sums', topics)).toBeNull()
    expect(matchMapTopic('area and perimeter', topics)?.id).toBe('a')
    expect(matchMapTopic('', topics)).toBeNull()
  })

  test('words that only join other words (of, the, with) do not count as words in common', () => {
    const joined = [{ id: 'x', name: 'Gifts of the sea' }]
    expect(matchMapTopic('Time of the day', joined)).toBeNull()
    expect(matchMapTopic('Sea gifts', joined)?.id).toBe('x')
  })
})

describe('save_own_test_results: what is not written', () => {
  test('a question read with a confidence under the line is left out and counted', async () => {
    const db = ownTestWorld()
    const out = await save(db, readOf([q('1', 'right', 'Whole numbers'), q('2', 'wrong', 'Whole numbers', { confidence: 0.79 }), q('3', 'right', 'Whole numbers', { confidence: 0.8 })]))
    expect(results(db).map((r) => r.prompt)).toEqual(['1. question 1', '3. question 3'])
    expect(out).toMatchObject({ written: 2, leftOut: 1, right: 2, wrong: 0, part: 0 })
  })

  test('the line is READ_CONFIDENCE_MIN when it is set', async () => {
    const db = ownTestWorld()
    const ctx = ctxFor(db, { env: { ...ctxFor(db).env, READ_CONFIDENCE_MIN: '0.95' } as unknown as ToolContext['env'] })
    await save(db, readOf([q('1', 'right', 'Whole numbers', { confidence: 0.9 }), q('2', 'right', 'Whole numbers', { confidence: 0.96 })]), ctx)
    expect(results(db)).toHaveLength(1)
  })

  test('nothing is read when every question is under the line: the paper fails and the tool says why', async () => {
    const db = ownTestWorld()
    await expect(save(db, readOf([q('1', 'right', 'Whole numbers', { confidence: 0.3 })]))).rejects.toThrow('could not read any marks')
    expect(results(db)).toHaveLength(0)
    expect(paper(db)).toMatchObject({ status: 'failed', error: 'read_failed', total: null })
  })

  test('a test with no question on it fails the same way', async () => {
    const db = ownTestWorld()
    await expect(save(db, readOf([]))).rejects.toThrow('could not read any marks')
    expect(paper(db).status).toBe('failed')
  })
})

describe('save_own_test_results: the paper', () => {
  test('it becomes marked with its total, the sum of the marks, and the activity log says so', async () => {
    const db = ownTestWorld()
    const out = await save(db, readOf([q('1', 'right', 'Whole numbers'), q('2', 'right', 'Whole numbers'), q('3', 'wrong', 'Whole numbers'), q('4', 'part', 'Whole numbers')], { title: 'Test 2' }))
    expect(paper(db)).toMatchObject({ status: 'marked', total: 2, error: null, child_id: CHILD, test_id: null })
    expect(out).toEqual({ childId: CHILD, title: 'Test 2', right: 2, part: 1, wrong: 1, written: 4, leftOut: 0, total: 2, outOf: 4, status: 'marked' })
    expect(db.tables.activity_log).toHaveLength(1)
    expect(db.tables.activity_log![0]).toMatchObject({ school_id: SCHOOL, child_id: CHILD, class_id: null, event_id: EVENT, tool: 'save_own_test_results', text: 'Read your marked test: 2 of 4 right', at: NOW.toISOString() })
  })

  test('the log line says how many were left out', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers'), q('2', 'wrong', 'Whole numbers', { confidence: 0.2 }), q('3', 'wrong', 'Whole numbers', { confidence: 0.2 })]))
    expect(db.tables.activity_log![0]!.text).toBe('Read your marked test: 1 of 1 right, 2 left out')
  })

  test('running it again replaces the earlier read and writes no second line of results', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers'), q('2', 'wrong', 'Whole numbers')]))
    await save(db, readOf([q('1', 'wrong', 'Whole numbers')]))
    expect(results(db).map((r) => [r.n, r.correct])).toEqual([[1, false]])
    expect(paper(db)).toMatchObject({ status: 'marked', total: 0 })
  })

  test('the call is on the tool log', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers')]))
    expect(db.tables.tool_calls!.map((r) => [r.tool, r.ok])).toEqual([['save_own_test_results', true]])
  })

  test('code never marks: no answer is compared with anything, so a wrong answer the teacher ticked stays right', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers', { prompt: '2 + 2', answerAsWritten: '5' })]))
    expect(results(db)[0]).toMatchObject({ answer_read: '5', correct: true })
  })
})

describe('save_own_test_results: a page that cannot be used', () => {
  test('nothing is written, the paper fails with a plain reason, and the tool throws so the event ends failed', async () => {
    const db = ownTestWorld()
    const before = JSON.stringify([db.tables.question_results, db.tables.activity_log, db.tables.paper_pages, db.tables.topics])
    await expect(save(db, readOf([], { pageUsable: false }))).rejects.toThrow('could not read the marked test')
    expect(JSON.stringify([db.tables.question_results, db.tables.activity_log, db.tables.paper_pages, db.tables.topics])).toBe(before)
    expect(paper(db)).toMatchObject({ status: 'failed', error: 'read_failed', total: null })
  })

  test('questions that came with an unusable page are not written', async () => {
    const db = ownTestWorld()
    await expect(save(db, readOf([q('1', 'right', 'Whole numbers')], { pageUsable: false }))).rejects.toThrow()
    expect(results(db)).toHaveLength(0)
  })

  test('an earlier read does not stay behind a paper that failed', async () => {
    const db = ownTestWorld()
    await save(db, readOf([q('1', 'right', 'Whole numbers')]))
    await expect(save(db, readOf([], { pageUsable: false }))).rejects.toThrow()
    expect(results(db)).toHaveLength(0)
  })

  test('the failed call is on the tool log with its error', async () => {
    const db = ownTestWorld()
    await expect(save(db, readOf([], { pageUsable: false }))).rejects.toThrow()
    expect(db.tables.tool_calls!.map((r) => [r.tool, r.ok])).toEqual([['save_own_test_results', false]])
    expect(String(db.tables.tool_calls![0]!.error)).toContain('could not read the marked test')
  })
})

describe('save_own_test_results: who may save', () => {
  test('a paper of another school is refused and nothing is written', async () => {
    const db = ownTestWorld()
    await expect(save(db, readOf([q('1', 'right', 'Whole numbers')]), ctxFor(db, { schoolId: OTHER_SCHOOL }))).rejects.toBeInstanceOf(OutOfScopeError)
    expect(results(db)).toHaveLength(0)
    expect(paper(db).status).toBe('queued')
  })

  test("a class test of a teacher is not a learner's own test", async () => {
    const db = ownTestWorld({
      tests: [{ id: '66666666-6666-4666-8666-666666666666', class_id: '22222222-2222-4222-8222-222222222222', title: 'Class Test 1', held: true }],
      papers: [{ id: PAPER, child_id: CHILD, test_id: '66666666-6666-4666-8666-666666666666', owner: 'teacher', kind: 'test', status: 'queued' }],
    })
    await expect(save(db, readOf([q('1', 'right', 'Whole numbers')]))).rejects.toThrow("not a learner's own test")
    expect(results(db)).toHaveLength(0)
  })

  test('a paper with no learner is refused', async () => {
    const db = ownTestWorld({ papers: [{ id: PAPER, child_id: null, test_id: null, owner: 'parent', kind: 'test', status: 'queued' }] })
    await expect(save(db, readOf([q('1', 'right', 'Whole numbers')]))).rejects.toThrow()
  })

  test('a read that does not fit the schema is refused by the tool', async () => {
    const db = ownTestWorld()
    expect(() => saveOwnTestResults.input.parse({ paperId: PAPER, read: { pageUsable: true, questions: [{ n: 1 }] } })).toThrow()
  })
})
