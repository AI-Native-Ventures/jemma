import { describe, expect, test } from 'vitest'
import { PIN_BULLET, primaryAnswerBlock } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { pinAnswer, pinKeyProblem, pinMarkOf, pinMarks, pinProblem } from '../src/logic/answers/pin'
import { finishAnswer, readNumber } from '../src/logic/meaning'
import type { PinSpec, Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P175: a pin the learner drags along a number line (the "Mark a number line" board). The key is the number on a mark; the pin is sent as the key's kind.

const klass = (grade: number) => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country: 'ZA' })
const quarters: PinSpec = { min: 0, max: 1, parts: 4 }
const tens: PinSpec = { min: 0, max: 100, step: 10 }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Put 3/4 on the number line.',
  render: 'text',
  answer: '3/4',
  answerKind: 'fraction',
  pin: quarters,
  difficulty: 1,
  why: 'Count the jumps between the marks, not the marks. 3 jumps from 0 is 3/4.',
  rightWay: 'The line from 0 to 1 has 4 equal jumps. Count 3 of them from 0.',
  ...over,
})

describe('a pin on a number line', () => {
  test('good lines pass', () => {
    expect(pinMarks(quarters)).toBe(4)
    expect(pinMarks(tens)).toBe(10)
    expect(pinMarks({ min: 0, max: 2, parts: 3 })).toBe(6)
    for (const p of [quarters, tens, { min: 0, max: 2, parts: 3 }]) expect(pinProblem(p)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('bad lines and keys are refused', () => {
    expect(pinProblem({ min: 1, max: 1 })).toContain('bigger whole number')
    expect(pinProblem({ min: 0, max: 0.5 })).toContain('bigger whole number')
    expect(pinProblem({ min: 0, max: 10, parts: 4 })).toContain('at most 20')
    expect(pinProblem({ min: 0, max: 25, step: 10 })).toContain('whole number of steps')
    expect(pinKeyProblem({ answer: '1/3', answerKind: 'fraction', pin: quarters }, readNumber)).toContain('on a mark')
    expect(pinKeyProblem({ answer: '0', answerKind: 'whole', pin: quarters }, readNumber)).toContain('after min')
    expect(pinKeyProblem({ answer: '70', answerKind: 'whole', pin: tens }, readNumber)).toBeNull()
    expect(pinKeyProblem({ answer: '1 1/3', answerKind: 'mixed', pin: { min: 0, max: 2, parts: 3 } }, readNumber)).toBeNull()
    expect(pinKeyProblem({ answer: '3/4', answerKind: 'list', pin: quarters }, readNumber)).toContain('fraction, mixed, decimal or whole')
    expect(answerProblem(question({ answer: '5/4' }))).toContain('pin:')
  })

  test('the pin is sent as the key kind, worked exactly', () => {
    expect(pinAnswer(quarters, 3, 'fraction')).toBe('3/4')
    expect(pinAnswer(quarters, 2, 'fraction')).toBe('1/2')
    expect(pinAnswer(quarters, 4, 'fraction')).toBe('1')
    expect(pinAnswer(quarters, 3, 'decimal')).toBe('0,75')
    expect(pinAnswer({ min: 0, max: 2, parts: 3 }, 4, 'mixed')).toBe('1 1/3')
    expect(pinAnswer(tens, 7, 'whole')).toBe('70')
    expect(pinMarkOf(quarters, '3/4', readNumber)).toBe(3)
    expect(pinMarkOf({ min: 0, max: 2, parts: 3 }, '1 1/3', readNumber)).toBe(4)
    expect(pinMarkOf(quarters, '1/3', readNumber)).toBeNull()
  })

  test('the pin is marked as its kind always was', () => {
    expect(finishAnswer(question(), pinAnswer(quarters, 3, 'fraction')).correct).toBe(true)
    expect(finishAnswer(question(), pinAnswer(quarters, 2, 'fraction')).correct).toBe(false)
    expect(finishAnswer(question({ answer: '0,75', answerKind: 'decimal' }), pinAnswer(quarters, 3, 'decimal')).correct).toBe(true)
  })

  test('fraction and counting topics are told how to ask for it', () => {
    expect(primaryAnswerBlock('fractions', klass(3))).toContain(PIN_BULLET)
    expect(primaryAnswerBlock('numbers', klass(2))).toContain(PIN_BULLET)
    expect(PIN_BULLET).not.toContain(String.fromCharCode(0x2014))
  })
})
