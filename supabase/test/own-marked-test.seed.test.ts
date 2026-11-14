import { describe, expect, test } from 'vitest'
import { capsMapOf } from '../../packages/profiling/src/curriculum/caps-map'
import { ownGapRow, ownMarkedTest, ownPaperRow, ownResultRows, ownTestLogRow } from '../seed/fixtures/own-workspace'

// The marked test Amina's own workspace has in every Hillview demo copy (P97): what the seed would write, with no database. The rows are checked
// here; CI proves that the seed writes them and that /k/own shows "Marked test: 6 of 8 right" at once.

const NOW = new Date('2026-11-14T10:00:00.000Z')
const gradeSix = capsMapOf(6)!
const test8 = ownMarkedTest()

describe('the marked test', () => {
  test('has 8 questions: 6 right and 2 wrong, as the teacher marked them', () => {
    expect(test8.results).toHaveLength(8)
    expect(test8.results.filter((r) => r.correct)).toHaveLength(6)
    expect(test8.results.filter((r) => !r.correct)).toHaveLength(2)
  })

  test('is on two topics of the Grade 6 map (exact names), and both wrong answers are on the same fractions topic', () => {
    const names = [...new Set(test8.results.map((r) => r.topicName))]
    expect(names).toHaveLength(2)
    for (const name of names) expect(gradeSix.rows.find((r) => r.name === name), name).toBeDefined()
    const wrong = test8.results.filter((r) => !r.correct)
    expect(new Set(wrong.map((r) => r.topicName)).size).toBe(1)
    expect(gradeSix.rows.find((r) => r.name === wrong[0]!.topicName)!.family).toBe('fractions')
    expect(wrong[0]!.topicName).toBe(test8.gapTopicName)
  })

  test('does not add to the two topics the preloaded practices count (3 of 5 in Common fractions and in the whole numbers topic), so those counts stay', () => {
    const names = new Set(test8.results.map((r) => r.topicName))
    expect(names.has('Common fractions')).toBe(false)
    expect(names.has('Whole numbers: addition and subtraction (5-digit numbers)')).toBe(false)
  })

  test('each question has its words with the printed number, what was written (a wrong answer is not the right one), and a confidence the reader keeps', () => {
    for (const [i, r] of test8.results.entries()) {
      expect(r.prompt.startsWith(`${i + 1}. `), r.prompt).toBe(true)
      expect(r.answer.trim().length).toBeGreaterThan(0)
      expect(r.confidence).toBeGreaterThanOrEqual(0.7)
      expect(r.confidence).toBeLessThanOrEqual(1)
    }
  })
})

describe('the rows', () => {
  test('the paper is the twin\'s own: no test, a parent\'s kind of owner, a test, marked, with the ticks as its total, read in the past', () => {
    const paper = ownPaperRow('twin-1', NOW)
    expect(paper).toMatchObject({ test_id: null, child_id: 'twin-1', owner: 'parent', kind: 'test', status: 'marked', total: 6, error: null })
    expect(Date.parse(paper.created_at)).toBeLessThan(NOW.getTime())
  })

  test('each result is the twin\'s, on the paper, numbered 1 to 8 in the order read, a tick as mark 1 and a cross as mark 0, on a topic of the map', () => {
    const topicIds = new Map(gradeSix.rows.map((r, i) => [r.name, `topic-${i}`]))
    const rows = ownResultRows(test8, { paperId: 'paper-1', childId: 'twin-1', topicIdOf: (name) => topicIds.get(name)! })
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rows.every((r) => r.paper_id === 'paper-1' && r.child_id === 'twin-1')).toBe(true)
    expect(rows.map((r) => r.mark)).toEqual(rows.map((r) => (r.correct ? 1 : 0)))
    expect(rows.reduce((sum, r) => sum + r.mark, 0)).toBe(ownPaperRow('twin-1', NOW).total)
    for (const r of rows) {
      expect(r.topic_id).toBe(topicIds.get(r.topic_name))
      expect(r.answer_read).toBeTruthy()
      expect(r.misconception).toBeNull()
    }
  })

  test('the one open gap is the twin\'s, on the topic of the wrong answers, with exactly those answers as its evidence', () => {
    const gap = ownGapRow({ childId: 'twin-1', topicId: 'topic-3', topicName: test8.gapTopicName, wrongResultIds: ['r3', 'r4'] })
    expect(gap).toEqual({ child_id: 'twin-1', topic_id: 'topic-3', topic_name: test8.gapTopicName, stage: 'new', evidence: ['r3', 'r4'] })
  })

  test('the line of "What Jemma did" says what the reader writes for a test with none left out', () => {
    expect(ownTestLogRow({ schoolId: 'own-school', childId: 'twin-1', at: NOW.toISOString() })).toEqual({
      school_id: 'own-school',
      child_id: 'twin-1',
      class_id: null,
      at: NOW.toISOString(),
      text: 'Read your marked test: 6 of 8 right',
      tool: 'save_own_test_results',
    })
  })

  test('/k/own would say "Marked test: 6 of 8 right": the ticks of all the questions that were read', () => {
    const right = test8.results.filter((r) => r.correct).length
    expect(`Marked test: ${right} of ${test8.results.length} right`).toBe('Marked test: 6 of 8 right')
  })
})
