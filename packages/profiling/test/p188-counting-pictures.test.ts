import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { KIT_PICTURES, pictureBullet, primaryKit } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureKeyProblem, pictureProblem, questionPictureProblem } from '../src/logic/picture'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P188: the pictures of the "Counting and place value" board in a question of Grades 1 to 3: objects to count or share, a ten-frame with a number bond, base-ten
// blocks to read, part of a hundred chart, a dot array and two numbers to compare. The demo schema does not change. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const GOOD: SeniorDiagramSpec[] = [
  { kind: 'objects', thing: 'apple', groups: [5, 5, 3] },
  { kind: 'objects', thing: 'star', groups: [4, 4, 4], layout: 'groups' },
  { kind: 'ten_frame', filled: 7, bond: { whole: 10, part: 7 } },
  { kind: 'ten_frame', frames: 2, filled: 14 },
  { kind: 'base_ten', tens: 3, ones: 4 },
  { kind: 'base_ten', hundreds: 2, tens: 0, ones: 7 },
  { kind: 'hundred_chart', from: 41, rows: 3, blanks: [47, 58, 63], gold: 47 },
  { kind: 'dot_array', rows: 4, cols: 6 },
  { kind: 'compare', left: '47', right: '52' },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'How many apples?',
  render: 'text',
  answer: '13',
  answerKind: 'whole',
  difficulty: 1,
  why: 'Count each row and add.',
  rightWay: '5 + 5 + 3 = 13.',
  ...over,
})

describe('the schemas', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('a question of Grades 1 to 6 may carry %s, and so may the wide reader', (_kind, diagram) => {
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram })).success).toBe(true)
    expect(SeniorDiagramSpecSchema.safeParse(diagram).success).toBe(true)
    expect(PrimaryPictureSpecSchema.safeParse(diagram).success).toBe(true)
  })

  test('the demo schema is not changed: it has none of them', () => {
    for (const d of GOOD) expect(DiagramSpecSchema.safeParse(d).success).toBe(false)
    expect(JSON.stringify(z.toJSONSchema(DiagramSpecSchema))).not.toContain('ten_frame')
  })

  test('a thing to count is one the picture can draw', () => {
    expect(PrimaryPictureSpecSchema.safeParse({ kind: 'objects', thing: 'dragon', groups: [3] }).success).toBe(false)
  })
})

describe('the pictures that make sense, and the ones that do not', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('%s makes sense', (_kind, d) => {
    expect(pictureProblem(d)).toBeNull()
    expect(questionPictureProblem(d)).toBeNull()
  })

  test.each([
    ['too many objects', { kind: 'objects', thing: 'ball', groups: [10, 10, 10, 1] }, 'at most 30'],
    ['a row of 12', { kind: 'objects', thing: 'ball', groups: [12] }, '1 to 10 objects'],
    ['three frames', { kind: 'ten_frame', frames: 3, filled: 4 }, '1 frame, or 2'],
    ['more counters than boxes', { kind: 'ten_frame', filled: 11 }, '0 to 10 counters'],
    ['a part bigger than the whole', { kind: 'ten_frame', filled: 7, bond: { whole: 10, part: 12 } }, 'number bond'],
    ['no blocks', { kind: 'base_ten', tens: 0, ones: 0 }, 'at least one block'],
    ['a chart that starts mid-row', { kind: 'hundred_chart', from: 45, rows: 2, blanks: [50] }, 'starts a row'],
    ['a blank off the chart', { kind: 'hundred_chart', from: 1, rows: 2, blanks: [25] }, 'on the chart'],
    ['a gold box that is not empty', { kind: 'hundred_chart', from: 1, rows: 2, blanks: [12], gold: 13 }, 'one of the empty boxes'],
    ['a chart past 120', { kind: 'hundred_chart', from: 111, rows: 2, blanks: [115] }, 'up to 120'],
    ['eleven rows of dots', { kind: 'dot_array', rows: 11, cols: 2 }, '1 to 10 rows'],
    ['a long side', { kind: 'compare', left: '12345678901', right: '2' }, '1 to 10 characters'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })

  test('a question with one stays a question of Grades 1 to 6', () => {
    expect(isSeniorQuestion(question({ diagram: GOOD[0] }))).toBe(false)
  })

  test('the gold box of a hundred chart is the answer', () => {
    const chart = GOOD[6]!
    expect(pictureKeyProblem(question({ diagram: chart, answer: '47' }))).toBeNull()
    expect(pictureKeyProblem(question({ diagram: chart, answer: '48' }))).toContain('gold box')
    expect(answerProblem(question({ prompt: 'Which number goes in the gold box?', diagram: chart, answer: '48' }))).toContain('picture:')
    expect(answerProblem(question({ prompt: 'Which number goes in the gold box?', diagram: chart, answer: '47' }))).toBeNull()
    expect(answerProblem(question({ diagram: { kind: 'objects', thing: 'apple', groups: [12] } as SeniorDiagramSpec }))).toContain('picture:')
  })
})

describe('the lesson writer', () => {
  test('counting, number bonds and equal groups have kits now, never for the baseline class', () => {
    expect(primaryKit(klass(1), 'Count objects')).toBe('numbers')
    expect(primaryKit(klass(1, 'US'), 'Word problems within 20')).toBe('addsub')
    expect(primaryKit(klass(2, 'US'), 'Fluency within 20')).toBe('addsub')
    expect(primaryKit(klass(2), 'Grouping and sharing leading to division')).toBe('multiply')
    expect(primaryKit(klass(3), 'Problems in context: repeated addition leading to multiplication')).toBe('multiply')
    // The baseline class (Mathematics, Grade 6, South Africa) is asked as it always was.
    expect(primaryKit(klass(6), 'Count objects')).toBeNull()
    expect(primaryKit(klass(6), 'Grouping and sharing leading to division')).toBeNull()
    expect(primaryKit(klass(6, 'US'), 'Count objects')).toBe('numbers')
  })

  test('each kit names the pictures that fit it', () => {
    expect(KIT_PICTURES.numbers).toEqual(expect.arrayContaining(['objects', 'ten_frame', 'hundred_chart', 'compare']))
    expect(KIT_PICTURES.place).toContain('base_ten')
    expect(KIT_PICTURES.multiply).toEqual(expect.arrayContaining(['dot_array', 'objects']))
    const counting = pictureBullet('numbers', klass(1))!
    expect(counting).toContain('`objects` (things to count')
    expect(counting).toContain('`ten_frame`')
    expect(counting).toContain('`hundred_chart`')
    expect(counting).toContain('`compare`')
    expect(pictureBullet('place', klass(2))).toContain('`base_ten`')
    expect(pictureBullet('multiply', klass(3))).toContain('`dot_array`')
  })
})
