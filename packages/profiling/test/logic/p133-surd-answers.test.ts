import { describe, expect, test } from 'vitest'
import { markByMeaning, markQuestion, markReadAnswer, meaningKeyProblem, readExpression, readMath } from '../../src/logic'
import type { Lesson, Question } from '../../src/schemas/lesson'
import { answerProblem, badQuestions } from '../../src/tools/save/save-lesson'

// P133: a lesson on surds and roots is saved, not refused. An answer like 5sqrt(2), 2√3, sqrt(5) + 1 or 5 + 2sqrt(6) is a valid expression: a number
// or a letter written next to a root is a product, and an expression with a root in it and no letter is read by its value. A wrong surd stays wrong.
// No database, no model.

const ROOT = '√'
const PI = 'π'
const mark = (kind: 'number' | 'expression', key: string, answer: string) => markByMeaning(kind, key, answer).correct

// The six answers that made practice.requested 907df23e fail (question 6, 7, 10, 11, 12 and 14).
const LIVE_KEYS = ['5sqrt(2)', '8sqrt(2)', '2sqrt(3)', '5sqrt(2)', 'sqrt(5) + 1', '5 + 2sqrt(6)']

describe('the six live answers are valid expressions', () => {
  test.each(LIVE_KEYS)('expression key %j has no problem', (key) => {
    expect(meaningKeyProblem('expression', key)).toBeNull()
  })

  test.each(LIVE_KEYS)('save_lesson keeps a question whose expression answer is %j', (key) => {
    const q = question('expression', key)
    expect(answerProblem(q)).toBeNull()
  })

  test('they read as a product and a sum, with the root covering the one number after it', () => {
    expect(readMath('5sqrt(2)')).toEqual({ t: 'mul', a: { t: 'num', v: 5, raw: '5' }, b: { t: 'sqrt', a: { t: 'group', a: { t: 'num', v: 2, raw: '2' } } } })
    expect(readMath(`2${ROOT}3`)).toEqual({ t: 'mul', a: { t: 'num', v: 2, raw: '2' }, b: { t: 'sqrt', a: { t: 'num', v: 3, raw: '3' } } })
    expect(readExpression('sqrt(5) + 1')?.t).toBe('add')
    expect(readExpression('5 + 2sqrt(6)')?.t).toBe('add')
  })
})

describe('other forms of a surd are valid expressions too', () => {
  test.each([
    `2${ROOT}3`, `${ROOT}50`, `5${ROOT}2`, `${ROOT}(18)`, `3 + ${ROOT}2`, `2 - ${ROOT}3`, `-sqrt(5)`, `${ROOT}2/2`, `(1 + ${ROOT}5)/2`,
    '3sqrt(2) + sqrt(8)', 'sqrt(2)sqrt(3)', 'sqrt 2', `x${ROOT}2`, `3${ROOT}(x+1)`, 'x sqrt(3)', '2(sqrt(5) + 1)', '(x+1)sqrt(2)',
  ])('expression key %j has no problem', (key) => {
    expect(meaningKeyProblem('expression', key)).toBeNull()
  })

  test('a letter, a number or a closing bracket in front of a root is a product', () => {
    expect(markByMeaning('expression', `x${ROOT}2`, `${ROOT}2 x`).correct).toBe(true)
    expect(markByMeaning('expression', `3${ROOT}(x+1)`, `3${ROOT}(1+x)`).correct).toBe(true)
    expect(markByMeaning('expression', '(x+1)sqrt(2)', `${ROOT}2(x+1)`).correct).toBe(true)
    expect(markByMeaning('expression', 'x sqrt(3)', `${ROOT}3 x`).correct).toBe(true)
  })
})

describe('what is still not an expression', () => {
  test.each([
    ['12', 'a plain number'],
    ['2 + 3', 'a sum of numbers'],
    ['7.5', 'a decimal'],
    [`2${PI}`, 'pi alone (P125 keeps it for the number kind)'],
    [`${ROOT}(-4)`, 'a root of a negative number has no value'],
    ['sqrt(2', 'an open bracket'],
    ['2sqrt(', 'a root of nothing'],
    ['sqrt', 'a root with nothing under it'],
    ['5 +', 'an unfinished sum'],
    ['', 'nothing'],
  ])('expression key %j (%s) is a bad answer', (key) => {
    expect(meaningKeyProblem('expression', key)).toBe(`answer "${key}" is not an expression`)
  })
})

describe('marking by value: a typed surd is right when it is the same number', () => {
  test.each([
    // 5sqrt(2) is the square root of 50
    ['5sqrt(2)', `${ROOT}50`, true],
    ['5sqrt(2)', `5${ROOT}2`, true],
    ['5sqrt(2)', '5 sqrt 2', true],
    ['5sqrt(2)', `5 ${ROOT} 2`, true],
    ['5sqrt(2)', `5 × ${ROOT}2`, true],
    ['5sqrt(2)', 'sqrt(50)', true],
    ['5sqrt(2)', '2.5sqrt(8)', true],
    ['5sqrt(2)', '7.0710678118654755', true],
    ['5sqrt(2)', `${ROOT}2 × 5`, true],
    ['8sqrt(2)', `${ROOT}128`, true],
    ['2sqrt(3)', `2${ROOT}3`, true],
    ['2sqrt(3)', `${ROOT}12`, true],
    ['2sqrt(3)', `${ROOT}3 + ${ROOT}3`, true],
    ['sqrt(5) + 1', `1 + ${ROOT}5`, true],
    ['sqrt(5) + 1', `${ROOT}5+1`, true],
    ['sqrt(5) + 1', '1+sqrt(5)', true],
    ['5 + 2sqrt(6)', `5 + ${ROOT}24`, true],
    ['5 + 2sqrt(6)', `2${ROOT}6 + 5`, true],
    ['5 + 2sqrt(6)', `5+2${ROOT}6`, true],
    // wrong surds stay wrong
    ['5sqrt(2)', `5${ROOT}3`, false],
    ['5sqrt(2)', '5sqrt(3)', false],
    ['5sqrt(2)', `${ROOT}5`, false],
    ['5sqrt(2)', `25${ROOT}2`, false],
    ['5sqrt(2)', `6${ROOT}2`, false],
    ['5sqrt(2)', `5${ROOT}2 + 1`, false],
    ['5sqrt(2)', '10', false],
    ['5sqrt(2)', '50', false],
    ['5sqrt(2)', '7', false],
    ['5sqrt(2)', '7.071', false],
    ['5sqrt(2)', 'x', false],
    ['5sqrt(2)', `5${ROOT}2x`, false],
    ['2sqrt(3)', `3${ROOT}2`, false],
    ['2sqrt(3)', `${ROOT}6`, false],
    ['2sqrt(3)', `${ROOT}12 + 1`, false],
    ['sqrt(5) + 1', `${ROOT}5 - 1`, false],
    ['sqrt(5) + 1', `${ROOT}6 + 1`, false],
    ['sqrt(5) + 1', `${ROOT}6`, false],
    ['5 + 2sqrt(6)', `5 + 2${ROOT}5`, false],
    ['5 + 2sqrt(6)', `7${ROOT}6`, false],
    ['5 + 2sqrt(6)', `5 - 2${ROOT}6`, false],
    ['5 + 2sqrt(6)', `${ROOT}6`, false],
  ] as const)('expression key %j, answer %j: %s', (key, answer, right) => {
    expect(mark('expression', key, answer)).toBe(right)
  })

  test('a letter the key does not hold is wrong, and a key with a letter is unchanged', () => {
    expect(markByMeaning('expression', '5sqrt(2)', 'x').correct).toBe(false)
    expect(markByMeaning('expression', '2x + 3', '3 + 2x').correct).toBe(true)
    expect(markByMeaning('expression', '2x + 3', `2${ROOT}3 + 3`).correct).toBe(false)
  })

  test('markQuestion marks the same way, with the key as the lesson wrote it', () => {
    expect(markQuestion({ answer: '5sqrt(2)', answerKind: 'expression' }, `5${ROOT}2`).correct).toBe(true)
    expect(markQuestion({ answer: '5sqrt(2)', answerKind: 'expression' }, `${ROOT}50`).correct).toBe(true)
    expect(markQuestion({ answer: '5sqrt(2)', answerKind: 'expression' }, `5${ROOT}3`).correct).toBe(false)
  })

  test('an answer that does not read is not right and not comparable', () => {
    expect(markByMeaning('expression', '5sqrt(2)', `5${ROOT}`)).toEqual({ correct: false, comparable: false })
    expect(markByMeaning('expression', '5sqrt(2)', '')).toEqual({ correct: false, comparable: false })
  })
})

describe('a number key with a root is read the same way, and a rounded decimal of it is right from three places', () => {
  test.each([
    ['5sqrt(2)', `${ROOT}50`, true],
    ['5sqrt(2)', `5${ROOT}2`, true],
    [`5${ROOT}2`, '7.0710678118654755', true],
    [`5${ROOT}2`, '7.071', true],
    [`5${ROOT}2`, '7,071', true],
    [`5${ROOT}2`, '7.0711', true],
    [`2${ROOT}3`, '3.464', true],
    [`${ROOT}8`, '2.828', true],
    // wrong stays wrong
    [`5${ROOT}2`, '7.07', false],
    [`5${ROOT}2`, '7.072', false],
    [`5${ROOT}2`, '7.0', false],
    [`5${ROOT}2`, '7', false],
    [`5${ROOT}2`, '8.660', false],
    [`5${ROOT}2`, `5${ROOT}3`, false],
    [`2${ROOT}3`, '3.465', false],
    // the rule is for a key with a root: a whole or a plain decimal key is compared as before
    ['7.5', '7.50', true],
    ['7.5', '7.501', false],
    ['2', '2.000', true],
  ] as const)('number key %j, answer %j: %s', (key, answer, right) => {
    expect(mark('number', key, answer)).toBe(right)
  })

  test('the class test path reads a surd key the same way', () => {
    expect(markReadAnswer('5sqrt(2)', `${ROOT}50`)).toBe(true)
    expect(markReadAnswer('5sqrt(2)', `5${ROOT}3`)).toBe(false)
  })
})

describe('save_lesson keeps a 15-question lesson that holds the surd answers', () => {
  // 5 questions at each level; the six live answers sit in level 2, as they did in the failed event.
  const level1 = ['x + 3', '2x', '3x - 1', 'x^2', '4x + 2'].map((a) => question('expression', a, 1))
  const level2 = ['5sqrt(2)', '8sqrt(2)', '2sqrt(3)', 'sqrt(5) + 1', '5 + 2sqrt(6)'].map((a) => question('expression', a, 2))
  const level3 = ['x^2 - 4', '(x+2)(x-2)', '2x^2 + 7x', 'x/2', '3x^3'].map((a) => question('expression', a, 3))
  const lesson = (questions: Question[]): Lesson => ({ format: 'reading', title: 'Surds', minutes: 12, warmup: [question('number', '3', 1)], questions })

  test('no question is bad, so nothing is dropped and no level falls under 4', () => {
    const all = [...level1, ...level2, ...level3, question('expression', '2sqrt(3)', 2)].slice(0, 15)
    expect(all).toHaveLength(15)
    expect(badQuestions(lesson(all))).toEqual({ warmup: [], questions: [] })
  })

  test('a lesson whose level 2 holds all six live answers is clean', () => {
    const six = LIVE_KEYS.map((a) => question('expression', a, 2))
    const questions = [...level1, ...six.slice(0, 5), ...level3]
    expect(badQuestions(lesson([...questions, six[5]!]))).toEqual({ warmup: [], questions: [] })
  })

  test('a letterless sum with no root is still the one bad question, and only that one', () => {
    const all = [...level1, ...level2, ...level3]
    all[7] = question('expression', '12', 2)
    expect(badQuestions(lesson(all)).questions).toEqual([7])
    expect(answerProblem(all[7]!)).toBe('answer "12" is not an expression')
  })

  test('a warm-up with a surd answer is fine', () => {
    expect(answerProblem(question('expression', '2sqrt(3)', 1))).toBeNull()
    expect(badQuestions({ ...lesson([...level1, ...level2, ...level3]), warmup: [question('expression', 'sqrt(5) + 1', 1)] }).warmup).toEqual([])
  })
})

function question(answerKind: Question['answerKind'], answer: string, difficulty: 1 | 2 | 3 = 1): Question {
  return { prompt: 'Simplify', render: 'text', answer, answerKind, difficulty, why: 'why', rightWay: 'right way' }
}
