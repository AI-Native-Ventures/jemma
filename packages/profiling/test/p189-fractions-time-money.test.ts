import { describe, expect, test } from 'vitest'
import { KIT_PICTURES, kitPicturesFor, pictureBullet, primaryAnswerBlock, primaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureKeyProblem, pictureProblem, questionPictureProblem } from '../src/logic/picture'
import { amountIn, dateWords, daysIn, factorTreeOf, isNote, isPrime, moneyLabel, moneyWords, percentIn, weekdayOf } from '../src/logic/question-pictures'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P189: the pictures of the "Calculating and fractions" and "Percentages, time and money" boards: a factor tree, a fraction of a set (gold groups of objects),
// fraction circles, a percentage bar, a calendar, and coins and notes (rand, or dollars in the US). The demo schema does not change. No database, no network,
// no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const TREE: SeniorDiagramSpec = { kind: 'factor_tree', root: 60, splits: [{ of: 60, into: [6, 10] }, { of: 6, into: [2, 3] }, { of: 10, into: [2, 5] }], gold: 5 }
const GOOD: SeniorDiagramSpec[] = [
  TREE,
  { kind: 'objects', thing: 'star', groups: [4, 4, 4], layout: 'groups', gold: 1 },
  { kind: 'fraction_circle', parts: 8, shaded: 3 },
  { kind: 'fraction_circle', parts: 4, shaded: 7, circles: 2 },
  { kind: 'percent_bar', whole: 240, percent: 25, parts: 4, money: true },
  { kind: 'percent_bar', whole: 240, percent: 40, money: true, ask: 'whole' },
  { kind: 'calendar', year: 2026, month: 11, circled: [6] },
  { kind: 'money', items: [1000, 500, 200, 200, 50] },
  { kind: 'money', items: [100, 25, 25, 10, 5, 1] },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Which number goes in the gold circle?',
  render: 'text',
  answer: '5',
  answerKind: 'whole',
  difficulty: 1,
  why: 'Each split is two factors.',
  rightWay: '10 = 2 × 5.',
  ...over,
})

describe('the schemas', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('a question of Grades 1 to 6 may carry %s, and so may the wide reader', (_kind, diagram) => {
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram })).success).toBe(true)
    expect(SeniorDiagramSpecSchema.safeParse(diagram).success).toBe(true)
    expect(PrimaryPictureSpecSchema.safeParse(diagram).success).toBe(true)
  })

  test('the demo schema is not changed: it has none of them', () => {
    for (const d of GOOD) if (d.kind !== 'objects') expect(DiagramSpecSchema.safeParse(d).success).toBe(false)
  })
})

describe('the pictures that make sense, and the ones that do not', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('%s makes sense', (_kind, d) => {
    expect(pictureProblem(d)).toBeNull()
    expect(questionPictureProblem(d)).toBeNull()
  })

  test.each([
    ['a split that does not multiply', { ...TREE, splits: [{ of: 60, into: [6, 9] }] }, 'is not 60'],
    ['a split into three', { ...TREE, splits: [{ of: 60, into: [2, 3, 10] }] }, 'two whole numbers'],
    ['a split into 1', { ...TREE, splits: [{ of: 60, into: [1, 60] }] }, 'each 2 or more'],
    ['a split of a number not on the tree', { ...TREE, splits: [{ of: 60, into: [6, 10] }, { of: 12, into: [3, 4] }] }, 'number on the tree'],
    ['a gold number not on the tree', { ...TREE, gold: 7 }, 'gold number is on the tree'],
    ['the top as the gold number', { ...TREE, gold: 60 }, 'below the top'],
    ['a tree too wide', { kind: 'factor_tree', root: 128, splits: [{ of: 128, into: [2, 64] }, { of: 64, into: [2, 32] }, { of: 32, into: [2, 16] }, { of: 16, into: [2, 8] }, { of: 8, into: [2, 4] }, { of: 4, into: [2, 2] }] }, '1 to 5 splits'],
    ['gold groups in rows', { kind: 'objects', thing: 'star', groups: [4, 4], gold: 1 }, 'layout groups'],
    ['more gold groups than groups', { kind: 'objects', thing: 'star', groups: [4, 4], layout: 'groups', gold: 3 }, 'layout groups'],
    ['a circle of 13 parts', { kind: 'fraction_circle', parts: 13, shaded: 1 }, '2 to 12'],
    ['more gold parts than parts', { kind: 'fraction_circle', parts: 4, shaded: 5 }, '0 to 4 gold parts'],
    ['four circles', { kind: 'fraction_circle', parts: 4, shaded: 5, circles: 4 }, '1 to 3 fraction circles'],
    ['a bar past 100%', { kind: 'percent_bar', whole: 240, percent: 125 }, 'at most 100%'],
    ['a bar of nothing', { kind: 'percent_bar', whole: 0, percent: 25 }, 'more than 0'],
    ['a bar cut into 20', { kind: 'percent_bar', whole: 240, percent: 25, parts: 20 }, '2 to 10 equal parts'],
    ['a 13th month', { kind: 'calendar', year: 2026, month: 13 }, 'month from 1 to 12'],
    ['30 February', { kind: 'calendar', year: 2026, month: 2, circled: [30] }, 'day of the month'],
    ['four circled days', { kind: 'calendar', year: 2026, month: 11, circled: [1, 2, 3, 4] }, 'at most 3 days'],
    ['a R3 coin', { kind: 'money', items: [300] }, 'a real one'],
    ['no money', { kind: 'money', items: [] }, '1 to 10 coins and notes'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })

  test('a question with one stays a question of Grades 1 to 6', () => {
    for (const diagram of GOOD) expect(isSeniorQuestion(question({ diagram }))).toBe(false)
  })
})

describe('the key fits the picture', () => {
  test('the gold number of a factor tree is the answer', () => {
    expect(pictureKeyProblem(question({ diagram: TREE }))).toBeNull()
    expect(pictureKeyProblem(question({ diagram: TREE, answer: '2' }))).toContain('gold number')
    expect(answerProblem(question({ diagram: TREE, answer: '2' }))).toContain('picture:')
    expect(answerProblem(question({ diagram: TREE }))).toBeNull()
  })

  test('the question mark of a percentage bar is the amount of its part, its whole or its percent, read the way the key is written', () => {
    const bar = GOOD[4]!
    expect(answerProblem(question({ prompt: 'Zanele saves 25% of R240. How much is that?', diagram: bar, answerKind: 'money', answer: 'R60' }))).toBeNull()
    expect(answerProblem(question({ diagram: bar, answerKind: 'money', answer: 'R60,00' }))).toBeNull()
    expect(answerProblem(question({ diagram: bar, answerKind: 'money', answer: 'R180' }))).toContain('question mark of the percentage bar stands for, 60')
    expect(answerProblem(question({ diagram: bar, answerKind: 'decimal', answer: '60' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[5]!, answerKind: 'decimal', answer: '240' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[5]!, answerKind: 'decimal', answer: '96' }))).toContain('240')
    const pct: SeniorDiagramSpec = { kind: 'percent_bar', whole: 80, percent: 12.5, ask: 'percent' }
    expect(answerProblem(question({ diagram: pct, answerKind: 'decimal', answer: '12,5' }))).toBeNull()
    expect(answerProblem(question({ diagram: pct, answerKind: 'decimal', answer: '12.5' }))).toBeNull()
    expect(answerProblem(question({ diagram: pct, answerKind: 'decimal', answer: '10' }))).toContain('12.5')
    // A choice question is picked by its letter, so its key is not a number of the bar.
    expect(pictureKeyProblem(question({ diagram: bar, answerKind: 'choice', answer: 'B' }), Number)).toBeNull()
  })
})

describe('the helpers the screen and the gate share', () => {
  test('a factor tree hangs each split under the first number that has not split yet', () => {
    const tree = factorTreeOf({ root: 36, splits: [{ of: 36, into: [6, 6] }, { of: 6, into: [2, 3] }, { of: 6, into: [2, 3] }], gold: 3 })
    expect(tree.unused).toBe(0)
    expect(tree.leaves.map((n) => n.value)).toEqual([2, 3, 2, 3])
    expect(tree.rows).toBe(3)
    // The gold number is the last 3, under the second 6.
    expect(tree.root.kids[1]!.kids[1]!.gold).toBe(true)
    expect(tree.root.kids[0]!.kids[1]!.gold).toBe(false)
    expect([2, 3, 5, 7, 97].every(isPrime)).toBe(true)
    expect([0, 1, 4, 9, 91].some(isPrime)).toBe(false)
  })

  test('a month has its days, and a date its day of the week', () => {
    expect(daysIn(2026, 2)).toBe(28)
    expect(daysIn(2028, 2)).toBe(29)
    expect(daysIn(2026, 11)).toBe(30)
    expect(weekdayOf(2026, 11, 1)).toBe(0)
    expect(weekdayOf(2026, 11, 6)).toBe(5)
    expect(dateWords(6, 11, 'za')).toBe('6 November')
    expect(dateWords(6, 11, 'us')).toBe('November 6')
  })

  test('coins, notes and amounts are written the way the space writes them', () => {
    expect([moneyLabel(50, 'za'), moneyLabel(200, 'za'), moneyLabel(1000, 'za')]).toEqual(['50c', 'R2', 'R10'])
    expect([moneyLabel(25, 'us'), moneyLabel(100, 'us'), moneyLabel(2000, 'us')]).toEqual(['25¢', '$1', '$20'])
    expect(isNote(500, 'za')).toBe(false)
    expect(isNote(100, 'us')).toBe(true)
    expect(moneyWords([1000, 500, 200, 200, 50], 'za')).toBe('an R10 note, an R5 coin, two R2 coins and a 50c coin')
    expect(moneyWords([25, 100, 25], 'us')).toBe('a $1 bill and two 25¢ coins')
    expect(amountIn(12.5, 'za', true)).toBe('R12,50')
    expect(amountIn(12.5, 'us', true)).toBe('$12.50')
    expect(amountIn(1200, 'za', true)).toBe('R1 200')
    expect(amountIn(1200, 'us', true)).toBe('$1,200')
    expect(amountIn(1350, 'za')).toBe('1 350')
    expect(amountIn(2.5, 'us')).toBe('2.5')
    expect(percentIn(12.5, 'za')).toBe('12,5%')
  })
})

describe('the lesson writer', () => {
  test('factors and percents in the US names have kits now', () => {
    expect(primaryKit(klass(4, 'US'), 'Factors and multiples')).toBe('multiply')
    expect(primaryKit(klass(6, 'US'), 'GCF and LCM')).toBe('multiply')
    expect(primaryKit(klass(6, 'US'), 'Unit rates and percents')).toBe('fractions')
  })

  test('each kit names its new pictures, only for the grades they are for', () => {
    expect(KIT_PICTURES.time).toEqual(['calendar'])
    expect(KIT_PICTURES.money).toEqual(['money'])
    expect(KIT_PICTURES.fractions).toEqual(expect.arrayContaining(['fraction_circle', 'percent_bar']))
    expect(KIT_PICTURES.multiply).toContain('factor_tree')
    expect(kitPicturesFor('multiply', 3)).not.toContain('factor_tree')
    expect(kitPicturesFor('multiply', 6)).toContain('factor_tree')
    expect(kitPicturesFor('fractions', 3)).not.toContain('percent_bar')
    expect(kitPicturesFor('fractions', 6)).toContain('percent_bar')
    // The counting pictures are for the young grades: the baseline class's place value bullet is as it was before P188.
    expect(kitPicturesFor('place', 6)).toEqual(['place_value'])
    expect(kitPicturesFor('numbers', 1)).toEqual(['number_line', 'objects', 'ten_frame', 'hundred_chart', 'compare'])
    expect(pictureBullet('time', klass(1))).toBeNull()
    expect(pictureBullet('time', klass(3))).toContain('`calendar`')
    expect(pictureBullet('money', klass(5))).toBeNull()
    expect(pictureBullet('fractions', klass(3))).toContain('`fraction_circle`')
    expect(pictureBullet('multiply', klass(6, 'US'))).toContain('`factor_tree`')
  })

  test('coins and notes are rand ones, or dollar ones for a class in the US', () => {
    const za = pictureBullet('money', klass(2))!
    const us = pictureBullet('money', klass(2, 'US'))!
    expect(za).toContain('an R10 note')
    expect(za).not.toContain('$')
    expect(us).toContain('a $1 bill')
    expect(us).not.toContain('R10')
    // Only rand and dollar coins are drawn, so a class in another country is not told of them.
    expect(pictureBullet('money', klass(2, 'KE'))).toBeNull()
    expect(primaryAnswerBlock('money', klass(2)).endsWith(za)).toBe(true)
    for (const text of [za, us, pictureBullet('fractions', klass(6))!, pictureBullet('multiply', klass(5))!]) expect(text).not.toContain(String.fromCharCode(0x2014))
  })

  test('the senior writer is told of a factor tree and a percentage bar', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(7))
    expect(senior).toContain('`factor_tree`')
    expect(senior).toContain('`percent_bar`')
  })
})
