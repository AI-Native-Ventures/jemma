import { describe, expect, test } from 'vitest'
import { completeAnswer, fillMissing, paperQuestions, PAPER_QUESTION_COUNT } from '../../src/logic'

// Which five questions of a lesson go on paper, and the one rule that finishes and marks a typed or written answer.
// Pure rules: no database, no network.

type Level = 1 | 2 | 3
const lesson = (levels: Level[]) => ({ questions: levels.map((difficulty) => ({ difficulty })) })

/** A lesson as `LessonSchema` wants it: 15 questions, 5 at each level. */
const inOrder: Level[] = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]
const mixed: Level[] = [3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2]

describe('paperQuestions', () => {
  test('five questions for a lesson of 15, 5 at each level', () => {
    expect(PAPER_QUESTION_COUNT).toBe(5)
    expect(paperQuestions(lesson(inOrder))).toHaveLength(5)
  })

  test('the first two of level 1, the first two of level 2 and the first of level 3, in that order', () => {
    expect(paperQuestions(lesson(inOrder))).toEqual([0, 1, 5, 6, 10])
  })

  test('the indexes point into the lesson as it is stored, whatever order its levels come in', () => {
    // level 1 sits at 1, 4, 7, ...; level 2 at 2, 5, 8, ...; level 3 at 0, 3, 6, ...
    expect(paperQuestions(lesson(mixed))).toEqual([1, 4, 2, 5, 0])
    const picked = paperQuestions(lesson(mixed)).map((i) => mixed[i])
    expect(picked).toEqual([1, 1, 2, 2, 3])
  })

  test('no index is used twice', () => {
    expect(new Set(paperQuestions(lesson(mixed))).size).toBe(5)
  })

  test('a lesson that is short of a level gives fewer than five and never invents one', () => {
    expect(paperQuestions(lesson([1, 2, 2, 2]))).toEqual([0, 1, 2])
    expect(paperQuestions(lesson([]))).toEqual([])
  })
})

describe('completeAnswer (one rule for the screen and for paper)', () => {
  const missing = { prompt: 'Complete: 3/5 = ?/15', answer: '9/15' }

  test('a missing number is put back into its fraction and marked', () => {
    expect(completeAnswer(missing, '9')).toEqual({ stored: '9/15', correct: true })
    expect(completeAnswer(missing, '5')).toEqual({ stored: '5/15', correct: false })
  })

  test('the whole fraction, and every other question, is stored as written', () => {
    expect(completeAnswer(missing, '9/15')).toEqual({ stored: '9/15', correct: true })
    expect(completeAnswer({ prompt: 'Which is bigger: 1/2 or 1/4?', answer: '1/2' }, ' 1/2 ')).toEqual({ stored: '1/2', correct: true })
  })

  test('a key that is only the number: the bare number is right and the fraction is what is stored', () => {
    expect(completeAnswer({ ...missing, answer: '9' }, '9')).toEqual({ stored: '9/15', correct: true })
  })

  test('a choice question is never completed', () => {
    expect(completeAnswer({ prompt: 'Which? 3/5 = ?/15', answer: 'B', choices: ['1', '2'] }, 'B')).toEqual({ stored: 'B', correct: true })
  })

  test('fillMissing puts the number on the side that was missing', () => {
    expect(fillMissing({ unknown: 'top', known: '15' }, '9')).toBe('9/15')
    expect(fillMissing({ unknown: 'bottom', known: '3' }, '9')).toBe('3/9')
  })
})
