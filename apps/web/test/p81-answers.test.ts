import { markAnswer, parseAnswer } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { describe, expect, test } from 'vitest'
import {
  answerShape,
  answerValue,
  completeAnswer,
  missedOf,
  type StoredItem,
} from '../app/k/session/[sessionId]/logic'

// How a typed answer is put together on the child's screen and finished on the server. No database, no browser.

const question = (over: Partial<Question>): Question => ({
  prompt: 'Complete: 3/5 = ?/15',
  render: 'text',
  answer: '9/15',
  answerKind: 'fraction',
  difficulty: 2,
  why: 'why',
  rightWay: 'the right way',
  ...over,
})

const MISSING_TOP = question({})
const MISSING_BOTTOM = question({ prompt: '1/2 = 2/?', answer: '2/4' })

describe('completeAnswer: a missing number is put back into its fraction', () => {
  test('"9" for the key "9/15" is right and is kept as "9/15"', () => {
    expect(completeAnswer(MISSING_TOP, '9')).toEqual({ stored: '9/15', correct: true })
  })

  test('a whole fraction is left as it is', () => {
    expect(completeAnswer(MISSING_TOP, '9/15')).toEqual({ stored: '9/15', correct: true })
    expect(completeAnswer(MISSING_TOP, '3/5')).toEqual({ stored: '3/5', correct: true })
    expect(completeAnswer(MISSING_TOP, '5/15')).toEqual({ stored: '5/15', correct: false })
  })

  test('"5" is wrong, and is kept as "5/15"', () => {
    expect(completeAnswer(MISSING_TOP, '5')).toEqual({ stored: '5/15', correct: false })
  })

  test('a missing bottom goes under the known top', () => {
    expect(completeAnswer(MISSING_BOTTOM, '4')).toEqual({ stored: '2/4', correct: true })
    expect(completeAnswer(MISSING_BOTTOM, '3')).toEqual({ stored: '2/3', correct: false })
  })

  test('a key that is only the number: the bare number is right', () => {
    const bare = question({ answer: '9' })
    expect(completeAnswer(bare, '9')).toEqual({ stored: '9/15', correct: true })
    expect(completeAnswer(bare, '8')).toEqual({ stored: '8/15', correct: false })
  })

  test('spaces around what was typed do not matter', () => {
    expect(completeAnswer(MISSING_TOP, ' 9 ')).toEqual({ stored: '9/15', correct: true })
  })

  test('words are not a number: kept as typed and wrong', () => {
    expect(completeAnswer(MISSING_TOP, 'nine')).toEqual({ stored: 'nine', correct: false })
  })

  test('the same on the server: it completes from the stored question, never from what the browser says', () => {
    // The browser sends "9/15"; an older browser sends "9". The server gets the same stored answer either way.
    expect(completeAnswer(MISSING_TOP, '9').stored).toBe(completeAnswer(MISSING_TOP, '9/15').stored)
  })
})

describe('completeAnswer: every other question is marked as before', () => {
  test('a fraction that is not a missing part', () => {
    const bigger = question({ prompt: 'Which fraction is bigger: 1/2 or 1/4?', answer: '1/2' })
    expect(completeAnswer(bigger, '1/2')).toEqual({ stored: '1/2', correct: true })
    expect(completeAnswer(bigger, '2/4')).toEqual({ stored: '2/4', correct: true })
    expect(completeAnswer(bigger, '1/4')).toEqual({ stored: '1/4', correct: false })
    // a bare number is not completed when the prompt has no missing part
    expect(completeAnswer(bigger, '1')).toEqual({ stored: '1', correct: false })
  })

  test('a fraction sum', () => {
    const sum = question({ prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], answer: '3/4' })
    expect(completeAnswer(sum, '3/4')).toEqual({ stored: '3/4', correct: true })
    expect(completeAnswer(sum, '6/8')).toEqual({ stored: '6/8', correct: true })
    expect(completeAnswer(sum, '2/6')).toEqual({ stored: '2/6', correct: false })
  })

  test('a choice question never gets a fraction put around the letter', () => {
    const pick = question({ prompt: 'Which is the same as 1/2? Is it ?/4', answer: 'B', answerKind: 'choice', choices: ['1/4', '2/4', '3/4', '1/3'] })
    expect(completeAnswer(pick, 'B')).toEqual({ stored: 'B', correct: true })
    expect(completeAnswer(pick, 'A')).toEqual({ stored: 'A', correct: false })
  })

  test('numbers, money and mixed numbers', () => {
    expect(completeAnswer(question({ prompt: 'What is half of 10?', answer: '5', answerKind: 'whole' }), '5')).toEqual({ stored: '5', correct: true })
    expect(completeAnswer(question({ prompt: 'One half as a decimal', answer: '0,5', answerKind: 'decimal' }), '0.5')).toEqual({ stored: '0.5', correct: true })
    expect(completeAnswer(question({ prompt: 'A quarter of R20', answer: 'R5', answerKind: 'money' }), 'R5')).toEqual({ stored: 'R5', correct: true })
    expect(completeAnswer(question({ prompt: 'Change 7/3 into a mixed number.', answer: '2 1/3', answerKind: 'mixed' }), '2 1/3')).toEqual({ stored: '2 1/3', correct: true })
  })
})

describe('answerShape: what the child is asked to type', () => {
  test('a missing part comes before the answer kind', () => {
    expect(answerShape(MISSING_TOP)).toEqual({ kind: 'missing', part: { unknown: 'top', known: '15' } })
    expect(answerShape(MISSING_BOTTOM)).toEqual({ kind: 'missing', part: { unknown: 'bottom', known: '2' } })
  })

  test('each answer kind', () => {
    const shape = (answerKind: Question['answerKind']) => answerShape({ prompt: 'Work it out', answerKind }).kind
    expect(shape('fraction')).toBe('fraction')
    expect(shape('mixed')).toBe('mixed')
    expect(shape('whole')).toBe('whole')
    expect(shape('decimal')).toBe('decimal')
    expect(shape('money')).toBe('money')
  })

  test('a question with choices is a choice, also when its words hold a missing part', () => {
    expect(answerShape({ prompt: 'Complete: 3/5 = ?/15', answerKind: 'choice', choices: ['6', '9'] })).toEqual({ kind: 'choice' })
    expect(answerShape({ prompt: 'x', answerKind: 'fraction', choices: ['1/2', '1/4'] })).toEqual({ kind: 'choice' })
  })

  test('a fraction sum is a fraction answer', () => {
    expect(answerShape({ prompt: '1/2 + 1/4', answerKind: 'fraction' }).kind).toBe('fraction')
  })

  test('an answer kind of choice with no choices still gets a plain box', () => {
    expect(answerShape({ prompt: 'Work it out', answerKind: 'choice' }).kind).toBe('text')
  })
})

describe('answerValue: the text sent for what the boxes hold', () => {
  const boxes = { whole: '', top: '', bottom: '', text: '' }

  test('a missing part: the number goes back into the fraction', () => {
    const shape = answerShape(MISSING_TOP)
    expect(answerValue(shape, { ...boxes, text: '9' })).toBe('9/15')
    expect(answerValue(answerShape(MISSING_BOTTOM), { ...boxes, text: '4' })).toBe('2/4')
    expect(answerValue(shape, boxes)).toBe('')
  })

  test('a fraction is "top/bottom" and needs both boxes', () => {
    const shape = answerShape({ prompt: 'Simplify 6/8', answerKind: 'fraction' })
    expect(answerValue(shape, { ...boxes, top: '3', bottom: '4' })).toBe('3/4')
    expect(answerValue(shape, { ...boxes, top: '3' })).toBe('')
    expect(answerValue(shape, { ...boxes, bottom: '4' })).toBe('')
    expect(answerValue(shape, { ...boxes, top: ' 3 ', bottom: ' 4 ' })).toBe('3/4')
  })

  test('a mixed number is "whole top/bottom" and needs all three boxes', () => {
    const shape = answerShape({ prompt: 'Change 15/4 into a mixed number', answerKind: 'mixed' })
    expect(answerValue(shape, { whole: '3', top: '3', bottom: '4', text: '' })).toBe('3 3/4')
    expect(answerValue(shape, { whole: '3', top: '3', bottom: '', text: '' })).toBe('')
    expect(answerValue(shape, { whole: '', top: '3', bottom: '4', text: '' })).toBe('')
  })

  test('whole and decimal send what was typed, money puts the R in front', () => {
    expect(answerValue(answerShape({ prompt: 'p', answerKind: 'whole' }), { ...boxes, text: ' 12 ' })).toBe('12')
    expect(answerValue(answerShape({ prompt: 'p', answerKind: 'decimal' }), { ...boxes, text: '0,75' })).toBe('0,75')
    expect(answerValue(answerShape({ prompt: 'p', answerKind: 'money' }), { ...boxes, text: '12,50' })).toBe('R12,50')
    expect(answerValue(answerShape({ prompt: 'p', answerKind: 'money' }), boxes)).toBe('')
  })

  test('the text built is exactly what markAnswer already reads (its own cases)', () => {
    const fraction = answerShape({ prompt: 'p', answerKind: 'fraction' })
    expect(markAnswer(answerValue(fraction, { ...boxes, top: '6', bottom: '8' }), '3/4').correct).toBe(true)
    expect(markAnswer(answerValue(fraction, { ...boxes, top: '2', bottom: '6' }), '3/4').correct).toBe(false)

    const mixed = answerShape({ prompt: 'p', answerKind: 'mixed' })
    const three34 = answerValue(mixed, { whole: '3', top: '3', bottom: '4', text: '' })
    expect(markAnswer(three34, '3 3/4').correct).toBe(true)
    expect(markAnswer(three34, '15/4').correct).toBe(true)
    expect(parseAnswer(three34)).toEqual(parseAnswer('15/4'))

    const money = answerShape({ prompt: 'p', answerKind: 'money' })
    expect(markAnswer(answerValue(money, { ...boxes, text: '5' }), 'R5').correct).toBe(true)
    expect(markAnswer(answerValue(money, { ...boxes, text: '5' }), '5').correct).toBe(true)

    const decimal = answerShape({ prompt: 'p', answerKind: 'decimal' })
    expect(markAnswer(answerValue(decimal, { ...boxes, text: '0,75' }), '0,75').correct).toBe(true)
    expect(markAnswer(answerValue(decimal, { ...boxes, text: '0.75' }), '0,75').correct).toBe(true)
  })

  test('the fraction sum keeps working: top and bottom boxes give "top/bottom" as before', () => {
    const shape = answerShape({ prompt: '1/2 + 1/4', answerKind: 'fraction' })
    expect(answerValue(shape, { ...boxes, top: '3', bottom: '4' })).toBe('3/4')
  })
})

describe('what the results screen shows under "You wrote"', () => {
  const item = (q: Question, answer: string): StoredItem => ({ phase: 'try', position: 1, question: q, answer, correct: false, difficulty: 2, seconds: 5 })

  test('the completed fraction, also for an answer stored before this change', () => {
    expect(missedOf([item(MISSING_TOP, '5/15')])[0]!.wrote).toBe('5/15')
    expect(missedOf([item(MISSING_TOP, '5')])[0]!.wrote).toBe('5/15')
  })

  test('other answers are shown as stored', () => {
    const bigger = question({ prompt: 'Which fraction is bigger: 1/2 or 1/4?', answer: '1/2' })
    expect(missedOf([item(bigger, '1/4')])[0]!.wrote).toBe('1/4')
  })
})
