import { describe, expect, test } from 'vitest'
import { EventSchema } from '../src/schemas/events'
import { MarkedTestReadSchema } from '../src/schemas/marked-test'

// What the vision model returns for a test that came back marked, and the event that asks for it. Pure schemas: no database, no network, no model.

const question = { n: '1', prompt: '1/2 + 1/4', answerAsWritten: '3/4', result: 'right', topic: 'Adding fractions', confidence: 0.9 }

describe('MarkedTestReadSchema', () => {
  test('a read with a title, a whole question and a half mark parses', () => {
    const good = {
      pageUsable: true,
      title: 'Class Test 2',
      questions: [question, { ...question, n: '2a', result: 'part', marksGot: 1, marksOutOf: 2, answerAsWritten: '' }, { ...question, n: '2b', result: 'wrong' }],
    }
    expect(MarkedTestReadSchema.parse(good)).toEqual(good)
  })

  test('the title and the numbers of marks are optional, and an unusable page has no questions', () => {
    expect(MarkedTestReadSchema.safeParse({ pageUsable: true, questions: [question] }).success).toBe(true)
    expect(MarkedTestReadSchema.safeParse({ pageUsable: false, questions: [] }).success).toBe(true)
  })

  test('a question number is a string, so 2a is a number a page can have', () => {
    expect(MarkedTestReadSchema.safeParse({ pageUsable: true, questions: [{ ...question, n: 2 }] }).success).toBe(false)
    expect(MarkedTestReadSchema.safeParse({ pageUsable: true, questions: [{ ...question, n: '2a' }] }).success).toBe(true)
  })

  test('the result is a tick, a cross or a half mark and nothing else', () => {
    for (const result of ['right', 'wrong', 'part']) expect(MarkedTestReadSchema.safeParse({ pageUsable: true, questions: [{ ...question, result }] }).success, result).toBe(true)
    for (const result of ['correct', 'maybe', 'unmarked', '', null]) expect(MarkedTestReadSchema.safeParse({ pageUsable: true, questions: [{ ...question, result }] }).success, String(result)).toBe(false)
  })

  test('a confidence outside 0 to 1, a negative mark, a missing topic or a missing list is refused', () => {
    const bad = [
      { pageUsable: true, questions: [{ ...question, confidence: 1.2 }] },
      { pageUsable: true, questions: [{ ...question, confidence: -0.1 }] },
      { pageUsable: true, questions: [{ ...question, marksGot: -1 }] },
      { pageUsable: true, questions: [{ ...question, marksOutOf: -2 }] },
      { pageUsable: true, questions: [{ ...question, topic: undefined }] },
      { pageUsable: true, questions: [{ ...question, answerAsWritten: undefined }] },
      { pageUsable: true },
      { questions: [question] },
      { pageUsable: 'yes', questions: [] },
    ]
    for (const read of bad) expect(MarkedTestReadSchema.safeParse(read).success, JSON.stringify(read)).toBe(false)
  })

  test('the model has no field for a mark of its own: a mark is what the teacher wrote', () => {
    const keys = Object.keys(MarkedTestReadSchema.shape.questions.element.shape)
    expect(keys.sort()).toEqual(['answerAsWritten', 'confidence', 'marksGot', 'marksOutOf', 'n', 'prompt', 'result', 'topic'])
  })
})

describe('the event own_test.snapped', () => {
  test('it names the learner and the paper', () => {
    expect(EventSchema.parse({ type: 'own_test.snapped', childId: 'c1', paperId: 'p1' })).toEqual({ type: 'own_test.snapped', childId: 'c1', paperId: 'p1' })
  })

  test('a missing child or a missing paper is refused', () => {
    expect(EventSchema.safeParse({ type: 'own_test.snapped', childId: 'c1' }).success).toBe(false)
    expect(EventSchema.safeParse({ type: 'own_test.snapped', paperId: 'p1' }).success).toBe(false)
  })
})
