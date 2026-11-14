import { describe, expect, test } from 'vitest'
import type { Lesson, Question } from '../src/schemas/lesson'
import { answerProblem, badQuestions } from '../src/tools/save/save-lesson'

// P86, decision 3: the save gate. A key of a new kind must be readable by its kind; a wrong one is a bad answer, as a bad answer is today.
// The old kinds are checked exactly as before (the rows at the bottom).

const q = (answerKind: Question['answerKind'], answer: string, over: Partial<Question> = {}): Question => ({
  prompt: 'Question',
  render: 'text',
  answer,
  answerKind,
  difficulty: 1,
  why: 'why',
  rightWay: 'right way',
  ...over,
})

describe('a key of a new kind must be readable by its kind', () => {
  const fine: [Question['answerKind'], string][] = [
    ['number', '-3'], ['number', '15%'], ['number', '30°'], ['number', '2√2'], ['number', '0,5'], ['number', '12'],
    ['expression', '2x + 3'], ['expression', 'x^2 - 4'], ['expression', '(x+2)(x-2)'], ['expression', '2x^2 + 7x'],
    ['equation', 'x = 3'], ['equation', 'x = 3 or x = -1'], ['equation', 'x = 1 + √2'],
    ['point', '(2; -3)'], ['point', '(-1,5; 4)'],
  ]
  test.each(fine)('%s %j is fine', (kind, answer) => expect(answerProblem(q(kind, answer))).toBeNull())

  const bad: [Question['answerKind'], string, string][] = [
    ['number', '2x + 3', 'a number'],
    ['number', 'three', 'a number'],
    ['expression', '12', 'an expression'],
    ['expression', '2x +', 'an expression'],
    ['equation', '2x + 3', 'an equation'],
    ['equation', 'x = y', 'an equation'],
    ['point', '(2)', 'a point'],
    ['point', '(2; x)', 'a point'],
  ]
  test.each(bad)('%s %j is a bad answer', (kind, answer, word) => {
    expect(answerProblem(q(kind, answer))).toBe(`answer "${answer}" is not ${word}`)
  })
})

describe('the old kinds are checked as they always were', () => {
  test.each([
    ['fraction', '3/4', true], ['fraction', 'banana', false], ['mixed', '1 1/2', true], ['decimal', '0,75', true], ['decimal', '-3', false],
    ['whole', '12', true], ['whole', '3/4', false], ['money', 'R5', true], ['money', '5', false], ['choice', 'B', true], ['choice', '3', false],
  ] as const)('%s %j is fine: %s', (kind, answer, fine) => {
    expect(answerProblem(q(kind, answer)) === null).toBe(fine)
    if (!fine) expect(answerProblem(q(kind, answer))).toBe(`answer "${answer}" is not a ${kind}`)
  })

  test('a negative number is still not a whole number or a decimal: that is what the number kind is for', () => {
    expect(answerProblem(q('whole', '-3'))).not.toBeNull()
    expect(answerProblem(q('number', '-3'))).toBeNull()
  })
})

describe('badQuestions lists the questions with a bad key, warm-up and questions apart', () => {
  test('it counts the new kinds', () => {
    const lesson = {
      format: 'reading',
      title: 'T',
      minutes: 12,
      warmup: [q('choice', 'A'), q('expression', '5')],
      questions: [q('expression', '2x + 3'), q('equation', 'x'), q('point', '(2; 3)'), q('number', 'x'), q('fraction', '3/4')],
    } satisfies Lesson
    expect(badQuestions(lesson)).toEqual({ warmup: [1], questions: [1, 3] })
  })
})
