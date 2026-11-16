import { describe, expect, test } from 'vitest'
import { finishAnswer, markQuestion, readNumber } from '../../src/logic'
import { listAnswerParts, listKeyProblem, markValues, resultCells, rightValues, roundTo, shuffledItems, splitValues } from '../../src/logic/answers/lists'
import { ANSWER_KINDS, LIST_ANSWER_KINDS, LessonSchema, QuestionSchema, SeniorQuestionSchema, StoredLessonSchema } from '../../src/schemas/lesson'
import { answerProblem, badQuestions, screenLesson } from '../../src/tools/save/save-lesson'

// P150: the three answers that are several values: a list (any order, or a fixed order, with labels), an order (the learner puts the items in order) and a
// table (the learner fills the empty cells). No database, no model, no browser.

const base = { prompt: 'p', render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r', steps: ['a', 'b'] }
const list = (answer: string, over: object = {}) => ({ ...base, answer, answerKind: 'list' as const, ...over })
const order = (answer: string, over: object = {}) => ({ ...base, answer, answerKind: 'order' as const, ...over })
const table = (answer: string, cells: (string | null)[][], over: object = {}) => ({
  ...base,
  answer,
  answerKind: 'table' as const,
  table: { columns: ['x', 'y'], rows: cells },
  ...over,
})
const right = (q: Parameters<typeof markQuestion>[0], typed: string) => markQuestion(q, typed).correct
const problem = (q: Parameters<typeof listKeyProblem>[0]) => listKeyProblem(q, readNumber)

describe('the kinds', () => {
  test('list, order and table are answer kinds and are not meaning kinds of the first four', () => {
    expect([...LIST_ANSWER_KINDS]).toEqual(['list', 'order', 'table'])
    for (const k of LIST_ANSWER_KINDS) expect(ANSWER_KINDS).toContain(k)
  })
})

describe('splitValues', () => {
  test('cuts at a semicolon and keeps a decimal comma', () => {
    expect(splitValues('3; 5,5; 7')).toEqual(['3', '5,5', '7'])
    expect(splitValues(' 3 ;5; ')).toEqual(['3', '5'])
  })
  test('a list written with commas and spaces (paper) is cut at the comma with a space; one value stays one', () => {
    expect(splitValues('3, 5, 7')).toEqual(['3', '5', '7'])
    expect(splitValues('5,5')).toEqual(['5,5'])
  })
  test('numbers with only spaces between them (paper without semicolons) are cut at the spaces; a mixed number stays one value', () => {
    expect(splitValues('3 5 7')).toEqual(['3', '5', '7'])
    expect(splitValues('2,5 4')).toEqual(['2,5', '4'])
    expect(splitValues('-2 3/4 9')).toEqual(['-2', '3/4', '9'])
    expect(splitValues('1 1/2')).toEqual(['1 1/2'])
    expect(splitValues('1 250')).toEqual(['1 250'])
    expect(splitValues('x y')).toEqual(['x y'])
  })
  test('a value of one table cell may be a mixed number', () => {
    expect(markQuestion({ answer: '1 1/2', answerKind: 'table' }, '1 1/2').correct).toBe(true)
    expect(markQuestion({ answer: '1 1/2', answerKind: 'table' }, '3/2').correct).toBe(true)
  })
})

describe('list: in any order', () => {
  const q = list('1; 2; 3; 4; 6; 8; 12; 24', { ordered: false })
  test('every value, in any order, is right', () => {
    expect(right(q, '1; 2; 3; 4; 6; 8; 12; 24')).toBe(true)
    expect(right(q, '24; 12; 8; 6; 4; 3; 2; 1')).toBe(true)
    expect(right(q, '2; 1; 4; 3; 8; 6; 24; 12')).toBe(true)
  })
  test('a wrong, a missing or an extra value is wrong', () => {
    expect(right(q, '1; 2; 3; 4; 6; 8; 12; 25')).toBe(false)
    expect(right(q, '1; 2; 3; 4; 6; 8; 12')).toBe(false)
    expect(right(q, '1; 2; 3; 4; 6; 8; 12; 24; 48')).toBe(false)
  })
  test('a repeated value does not stand in for a missing one', () => {
    expect(right(q, '1; 1; 3; 4; 6; 8; 12; 24')).toBe(false)
  })
  test('with no flag the list is in any order', () => {
    expect(right(list('3; 5; 7'), '7; 5; 3')).toBe(true)
  })
})

describe('list: in a fixed order', () => {
  const q = list('7; 9; 11', { ordered: true })
  test('the order counts', () => {
    expect(right(q, '7; 9; 11')).toBe(true)
    expect(right(q, '9; 7; 11')).toBe(false)
  })
  test('per box: which boxes are right', () => {
    expect(markValues('7; 9; 11', '7; 10; 11', { ordered: true }, readNumber).cells).toEqual([true, false, true])
  })
})

describe('list: a five-number summary with labels', () => {
  const q = list('2; 4; 5,5; 8; 10', { ordered: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] })
  test('right when every box holds its value', () => {
    expect(right(q, '2; 4; 5,5; 8; 10')).toBe(true)
    expect(right(q, '2; 4; 5.5; 8; 10')).toBe(true)
  })
  test('the same five values in another order are wrong when the boxes are labelled', () => {
    expect(right(q, '10; 8; 5,5; 4; 2')).toBe(false)
  })
  test('labels make the order matter even when the flag is left out', () => {
    expect(right(list('2; 4; 5,5; 8; 10', { labels: ['min', 'Q1', 'median', 'Q3', 'max'] }), '4; 2; 5,5; 8; 10')).toBe(false)
  })
})

describe('list: fractions and expressions are read by their meaning', () => {
  test('1/2 is 0,5 and 2/4', () => {
    const q = list('1/2; 1/3; 1/4', { ordered: true })
    expect(right(q, '0,5; 2/6; 0,25')).toBe(true)
    expect(right(q, '1/2; 1/3; 1/5')).toBe(false)
  })
  test('roots, pi and negatives', () => {
    const q = list('-4; √8; 2π', { ordered: true })
    expect(right(q, '−4; 2√2; 2π')).toBe(true)
    expect(right(q, '4; 2√2; 2π')).toBe(false)
  })
})

describe('order: the learner puts the items in order', () => {
  const q = order('1/4; 0,3; 1/2; 0,6')
  test('right order is right, any other is wrong', () => {
    expect(right(q, '1/4; 0,3; 1/2; 0,6')).toBe(true)
    expect(right(q, '0,6; 1/2; 0,3; 1/4')).toBe(false)
    expect(right(q, '0,3; 1/4; 1/2; 0,6')).toBe(false)
  })
  test('items that are equal in value can be put either way', () => {
    expect(right(order('0,25; 1/4; 0,5'), '1/4; 0,25; 0,5')).toBe(true)
  })
})

describe('table: each blank cell is marked by its value', () => {
  const cells = [
    ['1', null],
    ['2', null],
    [null, '9'],
  ]
  const q = table('3; 5; 3', cells)
  test('the whole table is right when every blank is right', () => {
    expect(right(q, '3; 5; 3')).toBe(true)
  })
  test('one wrong cell makes the question wrong, and the cells say which', () => {
    expect(right(q, '3; 6; 3')).toBe(false)
    expect(markValues('3; 5; 3', '3; 6; 3', { ordered: true }, readNumber).cells).toEqual([true, false, true])
  })
  test('a cell is read by its value: 5,0 is 5', () => {
    expect(right(q, '3; 5,0; 3')).toBe(true)
  })
  test('too few cells is wrong', () => {
    expect(right(q, '3; 5')).toBe(false)
  })
})

describe('rounding', () => {
  test('roundTo', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14)
    expect(roundTo(2.5, 0)).toBe(3)
    expect(roundTo(7.25, 1)).toBe(7.3)
  })
  test('a list accepts a value that rounds to the key as the question says (the rule of P148), and not another rounding', () => {
    const q = list('3,14159; 2,71828', { ordered: true, round: 2 })
    expect(right(q, '3,14; 2,72')).toBe(true)
    // More places than asked still rounds to the key: right, as for a number with `round`.
    expect(right(q, '3,142; 2,718')).toBe(true)
    expect(right(q, '3,14159; 2,71828')).toBe(true)
    expect(right(q, '3,1; 2,7')).toBe(false)
    expect(right(q, '3,15; 2,72')).toBe(false)
  })
  test('rounding half away from zero, and negatives', () => {
    const q = list('-2,345; 7,125', { ordered: true, round: 2 })
    expect(right(q, '-2,35; 7,13')).toBe(true)
    expect(right(q, '-2,34; 7,12')).toBe(false)
  })
  test('in any order, each value rounds to a key value', () => {
    expect(right(list('3,14159; 2,71828', { ordered: false, round: 1 }), '2,7; 3,1')).toBe(true)
  })
  test('without the field the key is compared as it is', () => {
    expect(right(list('3,14; 2,72', { ordered: true }), '3,1; 2,7')).toBe(false)
  })
  test('the right answer shown is the key rounded as the question asks, with the key\'s own decimal sign', () => {
    expect(rightValues({ answer: '3,14159; 2,71828', round: 2 }, readNumber)).toEqual(['3,14', '2,72'])
    expect(rightValues({ answer: '3.14159; 2', round: 1 }, readNumber)).toEqual(['3.1', '2.0'])
    expect(rightValues({ answer: '3,14159; 2,71828' }, readNumber)).toEqual(['3,14159', '2,71828'])
    const cells = resultCells(list('3,14159; 2,71828', { ordered: true, round: 2 }), '3,14; 2,7', readNumber)
    expect(cells).toEqual([
      { wrote: '3,14', right: '3,14', ok: true },
      { wrote: '2,7', right: '2,72', ok: false },
    ])
  })
  test('a table rounds too', () => {
    const q = table('2,333; 4,667', [[null, 'a'], [null, 'b']], { round: 1 })
    expect(right(q, '2,3; 4,7')).toBe(true)
    expect(right(q, '2,4; 4,7')).toBe(false)
  })
})

describe('finishAnswer stores what was typed and marks it', () => {
  test('a list', () => {
    expect(finishAnswer(list('7; 9; 11', { ordered: true }), ' 7; 9; 11 ')).toEqual({ stored: '7; 9; 11', correct: true })
    expect(finishAnswer(list('7; 9; 11', { ordered: true }), '7; 9; 12').correct).toBe(false)
  })
  test('an answer that does not read is wrong, not an error', () => {
    expect(finishAnswer(list('7; 9; 11'), 'seven; nine; eleven').correct).toBe(false)
    expect(finishAnswer(order('1; 2; 3'), '').correct).toBe(false)
  })
})

describe('the save gate: a key must be markable', () => {
  test('a list', () => {
    expect(problem(list('3; 5; 7'))).toBeNull()
    expect(problem(list('3; five; 7'))).toMatch(/not a number/)
    expect(problem(list('3'))).toMatch(/at least 2/)
    expect(problem(list('1; 2; 3; 4; 5; 6; 7; 8; 9; 10; 11'))).toMatch(/at most 10/)
  })
  test('labels must be one for each value', () => {
    expect(problem(list('3; 5; 7', { labels: ['a', 'b', 'c'] }))).toBeNull()
    expect(problem(list('3; 5; 7', { labels: ['a', 'b'] }))).toMatch(/labels/)
    expect(problem(list('3; 5; 7', { labels: ['a', '', 'c'] }))).toMatch(/labels/)
  })
  test('round is a whole number of places from 0 to 6', () => {
    expect(problem(list('3,14159; 2,71828', { round: 2 }))).toBeNull()
    expect(problem(list('3; 5', { round: 7 }))).toMatch(/round/)
    expect(problem(list('3; 5', { round: -1 }))).toMatch(/round/)
    expect(problem(list('3; 5', { round: 1.5 }))).toMatch(/round/)
  })
  test('an order has 2 to 8 items', () => {
    expect(problem(order('1/2; 3/4'))).toBeNull()
    expect(problem(order('1/2'))).toMatch(/at least 2/)
    expect(problem(order('1;2;3;4;5;6;7;8;9'))).toMatch(/at most 8/)
  })
  test('a table needs its picture, at most 4 by 6, a blank, and one key value for each blank', () => {
    expect(problem(table('3; 5; 3', [['1', null], ['2', null], [null, '9']]))).toBeNull()
    expect(problem({ ...base, answer: '3', answerKind: 'table' as const })).toMatch(/table/)
    expect(problem(table('3; 5', [['1', null], ['2', null], [null, '9']]))).toMatch(/3 blank/)
    expect(problem(table('3', [['1', '2'], ['3', '4']]))).toMatch(/blank/)
    expect(problem(table('3', [['1', null, '3'], ['2', '2', '1']]))).toMatch(/columns/)
    expect(problem(table('1', [['1', null]], { table: { columns: ['a', 'b', 'c', 'd', 'e'], rows: [['1', null, '1', '1', '1']] } }))).toMatch(/at most 4 columns/)
    expect(problem(table('1', Array.from({ length: 7 }, (_, i) => (i === 0 ? ['1', null] : ['1', '2']))))).toMatch(/at most 6 rows/)
  })
  test('answerProblem (the save gate) asks it of every key of these kinds', () => {
    expect(answerProblem(QuestionSchema.parse(list('3; 5; 7')))).toBeNull()
    expect(answerProblem(QuestionSchema.parse(list('3; five; 7')))).toMatch(/not a number/)
    expect(answerProblem(QuestionSchema.parse(table('3', [['1', null]])))).toBeNull()
    expect(answerProblem(QuestionSchema.parse(order('1/2; 3/4')))).toBeNull()
  })
})

describe('what the screen is told', () => {
  test('a list: a count, whether order counts, labels, and whether a number pad is enough, never a value', () => {
    const parts = listAnswerParts(list('2; 4; 5,5; 8; 10', { labels: ['min', 'Q1', 'median', 'Q3', 'max'] }))
    expect(parts).toEqual({ list: { count: 5, ordered: true, plain: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] } })
    expect(JSON.stringify(parts)).not.toMatch(/5,5|"10"/)
  })
  test('a list of fractions needs the full keyboard', () => {
    expect(listAnswerParts(list('1/2; 1/3')).list?.plain).toBe(false)
    expect(listAnswerParts(list('-4; -7')).list?.plain).toBe(false)
  })
  test('an order: the items shuffled, never in the right order', () => {
    for (const key of ['1/4; 0,3; 1/2; 0,6', '1; 2', '3; 2; 1', '5; 10; 15; 20; 25; 30']) {
      const items = listAnswerParts(order(key)).items!
      expect([...items].sort()).toEqual(splitValues(key).sort())
      expect(items).not.toEqual(splitValues(key))
    }
  })
  test('the shuffle does not change from one call to the next', () => {
    const a = shuffledItems(['1', '2', '3', '4', '5'], 'seed one')
    expect(shuffledItems(['1', '2', '3', '4', '5'], 'seed one')).toEqual(a)
  })
  test('a table is sent whole (its given cells are in the question), with no key value', () => {
    const parts = listAnswerParts(table('3; 5; 3', [['1', null], ['2', null], [null, '9']]))
    expect(parts.table).toEqual({ columns: ['x', 'y'], rows: [['1', null], ['2', null], [null, '9']], plain: true })
  })
  test('another kind has none of these', () => {
    expect(listAnswerParts({ ...base, answer: '3', answerKind: 'number' as const })).toEqual({})
  })
})

describe('the schema', () => {
  test('a senior question may carry ordered, labels, round and a table; all are optional', () => {
    const q = SeniorQuestionSchema.parse({ ...list('3; 5', { ordered: true, labels: ['a', 'b'], round: 1 }) })
    expect(q).toMatchObject({ ordered: true, labels: ['a', 'b'], round: 1 })
    expect(SeniorQuestionSchema.parse(table('3', [['1', null]])).table).toEqual({ columns: ['x', 'y'], rows: [['1', null]] })
    expect(SeniorQuestionSchema.safeParse({ ...base, answer: '3', answerKind: 'number' }).success).toBe(true)
  })
  test('round is a whole number (the save gate holds it to 0 to 6, as P148 does)', () => {
    expect(SeniorQuestionSchema.safeParse(list('3; 5', { round: 1.5 })).success).toBe(false)
    expect(SeniorQuestionSchema.safeParse(list('3; 5', { round: 2 })).success).toBe(true)
  })
})

describe('a whole senior lesson with the three kinds', () => {
  const plain = (difficulty: 1 | 2 | 3, over: object = {}) => ({ ...base, difficulty, answer: '3', answerKind: 'whole' as const, ...over })
  const lesson = {
    format: 'reading' as const,
    title: 'Statistics',
    minutes: 12,
    cards: [{ heading: 'h', body: 'b' }],
    warmup: [],
    questions: [
      list('2; 4; 5,5; 8; 10', { difficulty: 1, ordered: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] }),
      list('1; 2; 3; 4; 6; 12', { difficulty: 1, ordered: false }),
      order('1/4; 0,3; 1/2', { difficulty: 1 }),
      plain(1),
      plain(1),
      table('4; 7', [['1', '3'], ['2', null], ['3', null]], { difficulty: 2 }),
      list('3,14159; 2,71828', { difficulty: 2, ordered: true, round: 2 }),
      plain(2),
      plain(2),
      plain(2),
      ...[3, 3, 3, 3, 3].map(() => plain(3)),
    ],
  }
  test('it is read whole: nothing a question carries is lost, and every key is markable', () => {
    const read = LessonSchema.parse(JSON.parse(JSON.stringify(lesson)))
    expect(read.questions[0]).toMatchObject({ answerKind: 'list', ordered: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] })
    expect(read.questions[5]!.table).toEqual({ columns: ['x', 'y'], rows: [['1', '3'], ['2', null], ['3', null]] })
    expect(read.questions[6]!.round).toBe(2)
    expect(badQuestions(read)).toEqual({ warmup: [], questions: [] })
    expect(StoredLessonSchema.safeParse(read).success).toBe(true)
  })
  test('the word check keeps the three kinds and their fields as they were', () => {
    const read = LessonSchema.parse(lesson)
    const { lesson: screened } = screenLesson(read)
    expect(screened.questions[5]!.table).toEqual(read.questions[5]!.table)
    expect(screened.questions[0]!.labels).toEqual(read.questions[0]!.labels)
    expect(screened.questions[6]!.round).toBe(2)
  })
  test('a bad table is found by the save gate and named by its question', () => {
    const bad = { ...lesson, questions: lesson.questions.map((q, i) => (i === 5 ? { ...q, answer: '4' } : q)) }
    expect(badQuestions(LessonSchema.parse(bad)).questions).toEqual([5])
  })
})
