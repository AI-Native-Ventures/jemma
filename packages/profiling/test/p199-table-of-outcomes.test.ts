import { describe, expect, test } from 'vitest'
import { OUTCOMES_BULLET, pictureBullet, primaryAnswerBlock } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { seniorLists } from '../src/ai/senior-lists-prompt'
import { makeClassContext } from '../src/ai/subject-profile'
import { finishAnswer, readNumber } from '../src/logic'
import { isOutcomeTable, listAnswerParts, listKeyProblem, markListQuestion, outcomeOf, resultCells } from '../src/logic/answers/lists'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import type { Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P199: a table of outcomes, the last screen of the "Probability" board ("A coin is tossed and a die is rolled. Fill in the table."): a table whose blanks take
// outcomes like H4, compared as letters and digits, each one its column and its row put together. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)

const TABLE = {
  columns: ['Die', 'H', 'T'],
  rows: [
    ['1', 'H1', null],
    ['2', 'H2', null],
    ['3', null, null],
    ['4', null, null],
  ] as (string | null)[][],
}
const KEY = 'T1; T2; H3; T3; H4; T4'
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'A coin is tossed and a die is rolled. Fill in the table.',
  render: 'text',
  answer: KEY,
  answerKind: 'table',
  table: TABLE,
  difficulty: 2,
  why: 'Each outcome is a side of the coin and a number of the die.',
  rightWay: 'Write the letter of the column and the number of the row: T1, T2, H3.',
  ...over,
})

describe('a table of outcomes', () => {
  test('is a table whose every key value is an outcome in capitals; algebra and numbers are not', () => {
    expect(isOutcomeTable(question())).toBe(true)
    expect(isOutcomeTable({ answer: '2x; 3x', answerKind: 'table' })).toBe(false)
    expect(isOutcomeTable({ answer: '3; 4', answerKind: 'table' })).toBe(false)
    expect(isOutcomeTable({ answer: 'H1; H2', answerKind: 'list' })).toBe(false)
    expect(outcomeOf(' h, 4 ')).toBe('H4')
  })

  test('the save gate takes a good one, for Grades 1 to 6 and for a senior class', () => {
    expect(answerProblem(question())).toBeNull()
    expect(answerProblem(question({ steps: ['T and 1 make T1', 'H and 3 make H3'] }))).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
    expect(listAnswerParts(question())).toEqual({ table: { columns: TABLE.columns, rows: TABLE.rows, plain: false, outcomes: true } })
  })

  test('each outcome is its column and its row put together, in reading order', () => {
    expect(listKeyProblem(question({ answer: 'H3; T1; T2; T3; H4; T4' }), readNumber)).toContain('row 1 under T is T and 1 put together (T1), not H3')
    expect(listKeyProblem(question({ answer: '1T; 2T; 3H; 3T; 4H; 4T' }), readNumber)).toBeNull()
    expect(listKeyProblem(question({ answer: 'T1; T2; H3; T3; H4' }), readNumber)).toContain('5 values for 6 blank cells')
    expect(listKeyProblem(question({ table: { columns: ['Die', 'H', 'T'], rows: [[null, 'H1', 'T1'], ['2', 'H2', 'T2']] }, answer: 'D1' }), readNumber)).toContain('first column')
    expect(listKeyProblem(question({ answer: 'T1; T2; H3; T3; H4; 5' }), readNumber)).toContain('not a number')
  })

  test('is marked cell by cell, in small letters, with spaces, or either way round', () => {
    const q = question()
    expect(finishAnswer(q, KEY).correct).toBe(true)
    expect(finishAnswer(q, 't1; t 2; h3; T3; 4H; 4t').correct).toBe(true)
    expect(finishAnswer(q, 'T1; T2; H3; T3; H4; H4').correct).toBe(false)
    expect(markListQuestion(q, 'T1; T2; H3; T3; H4', readNumber)).toMatchObject({ correct: false, comparable: true })
    expect(markListQuestion(q, 'T1; T2; H3; T3; H4; 7', readNumber).comparable).toBe(false)
    expect(resultCells(q, 'T1; T2; T3; T3; H4; T4', readNumber).map((c) => c.ok)).toEqual([true, true, false, true, true, true])
  })

  test('HT is TH in its own cell: the place of the blank says which outcome it is', () => {
    const coins = question({ table: { columns: ['1st coin', 'H', 'T'], rows: [['H', 'HH', null], ['T', null, null]] }, answer: 'HT; TH; TT' })
    expect(answerProblem(coins)).toBeNull()
    expect(finishAnswer(coins, 'TH; HT; TT').correct).toBe(true)
    expect(finishAnswer(coins, 'HH; TH; TT').correct).toBe(false)
  })
})

describe('the lesson writer', () => {
  test('a probability topic of Grades 4 to 6 is told how to ask for one, after its pictures', () => {
    expect(primaryAnswerBlock('chance', klass(5))).toBe(`${pictureBullet('chance', klass(5))}\n${OUTCOMES_BULLET}`)
    expect(OUTCOMES_BULLET).not.toMatch(LONG_DASH)
  })

  test('so is a senior class, in the lines about tables', () => {
    expect(seniorLists(true)).toContain('except in a table of outcomes')
    expect(renderPrompt('write_lesson', '- `why` says in one sentence what usually goes wrong.', klass(10))).toContain('`T1; T2; H3; T3`')
    expect(seniorLists(false)).not.toMatch(LONG_DASH)
  })
})
