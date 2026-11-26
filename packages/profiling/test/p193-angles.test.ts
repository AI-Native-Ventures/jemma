import { describe, expect, test } from 'vitest'
import { KIT_PICTURES, PICTURE_KITS, kitPicturesFor, pictureBullet, primaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem, questionPictureProblem } from '../src/logic/picture'
import { angleKind, cornerAngle, labelDegrees } from '../src/logic/question-pictures'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P193: the pictures of the "Angles and transformations" board: one angle, a protractor over an angle, two parallel lines cut by a slanted line, and a shape and its
// enlargement on a grid. The demo schema does not change. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const LINES: SeniorDiagramSpec = {
  kind: 'parallel_lines',
  acute: 65,
  marks: [
    { line: 'AB', corner: 'above_right', label: '65°' },
    { line: 'CD', corner: 'above_right', label: 'x' },
  ],
}
const GOOD: SeniorDiagramSpec[] = [
  { kind: 'angle', degrees: 130 },
  { kind: 'angle', degrees: 250, label: 'y' },
  { kind: 'protractor', degrees: 125 },
  LINES,
  { kind: 'enlargement', shape: 'rectangle', w: 2, h: 1, factor: 3, sizes: true },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'What kind of angle is this?',
  render: 'text',
  answer: 'C',
  answerKind: 'choice',
  choices: ['acute', 'right', 'obtuse', 'reflex'],
  difficulty: 1,
  why: 'It is more than a right angle and less than a straight line.',
  rightWay: 'An angle between 90° and 180° is obtuse.',
  ...over,
})

describe('the schemas', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('a question of Grades 1 to 6 may carry %s, and so may the wide reader', (_kind, diagram) => {
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram })).success).toBe(true)
    expect(SeniorDiagramSpecSchema.safeParse(diagram).success).toBe(true)
    expect(PrimaryPictureSpecSchema.safeParse(diagram).success).toBe(true)
    expect(DiagramSpecSchema.safeParse(diagram).success).toBe(false)
  })
})

describe('the pictures that make sense, and the ones that do not', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('%s makes sense', (_kind, d) => {
    expect(pictureProblem(d)).toBeNull()
    expect(questionPictureProblem(d)).toBeNull()
    expect(isSeniorQuestion(question({ diagram: d }))).toBe(false)
  })

  test.each([
    ['an angle of 400°', { kind: 'angle', degrees: 400 }, '1 to 359'],
    ['a long label', { kind: 'angle', degrees: 40, label: 'the angle' }, 'short'],
    ['a protractor between marks', { kind: 'protractor', degrees: 123 }, 'every 5 degrees'],
    ['a slanted line too flat', { ...LINES, acute: 20 }, '30 to 80'],
    ['an angle mark that does not fit the picture', { ...LINES, marks: [{ line: 'AB', corner: 'above_left', label: '65°' }] }, 'is 115°, not 65°'],
    ['two marks in one corner', { ...LINES, marks: [{ line: 'AB', corner: 'above_left', label: 'x' }, { line: 'AB', corner: 'above_left', label: 'y' }] }, 'corner of its own'],
    ['a word for a mark', { ...LINES, marks: [{ line: 'AB', corner: 'above_left', label: 'big' }] }, 'one small letter'],
    ['a factor of 5', { kind: 'enlargement', shape: 'rectangle', w: 1, h: 1, factor: 5 }, '2, 3 or 4'],
    ['shapes too big', { kind: 'enlargement', shape: 'rectangle', w: 4, h: 3, factor: 4 }, 'fit on a grid'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })
})

describe('the key fits the picture', () => {
  test('the kind of an angle picked from words is its kind', () => {
    expect(answerProblem(question({ diagram: GOOD[0] }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[0], answer: 'A' }))).toContain('a 130° angle is obtuse, not acute')
    expect(answerProblem(question({ diagram: GOOD[1], answer: 'D' }))).toBeNull()
    // Choices that are not kinds of angles are up to the question.
    expect(answerProblem(question({ prompt: 'About how big is it?', diagram: GOOD[0], choices: ['50°', '130°', '230°'], answer: 'B' }))).toBeNull()
  })

  test('a protractor is read, and the letter of parallel lines is the size of its corner', () => {
    expect(answerProblem(question({ prompt: 'How big is the angle?', diagram: GOOD[2], answerKind: 'whole', answer: '125', choices: undefined, unit: '°' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[2], answerKind: 'whole', answer: '55', choices: undefined, unit: '°' }))).toContain('the protractor reads, 125')
    expect(answerProblem(question({ prompt: 'Find x.', diagram: LINES, answerKind: 'whole', answer: '65', choices: undefined, unit: '°' }))).toBeNull()
    expect(answerProblem(question({ prompt: 'Find x.', diagram: LINES, answerKind: 'whole', answer: '115', choices: undefined, unit: '°' }))).toContain('the angle x stands for, 65')
  })
})

describe('the helpers the screen and the gate share', () => {
  test('kinds of angles, corners of parallel lines and angle labels', () => {
    expect([30, 90, 120, 180, 270].map(angleKind)).toEqual(['acute', 'right', 'obtuse', 'straight', 'reflex'])
    expect(['above_right', 'above_left', 'below_left', 'below_right'].map((c) => cornerAngle(65, c))).toEqual([65, 115, 65, 115])
    expect([labelDegrees('65°'), labelDegrees(' 40 '), labelDegrees('x'), labelDegrees('12,5°')]).toEqual([65, 40, null, 12.5])
  })
})

describe('the lesson writer', () => {
  test('angles have a kit of their own, and transformations one from Grade 5', () => {
    expect(PICTURE_KITS).toEqual(expect.arrayContaining(['angles', 'transform']))
    expect(primaryKit(klass(4, 'US'), 'Angles')).toBe('angles')
    expect(primaryKit(klass(5), 'Transformations')).toBe('transform')
    expect(primaryKit(klass(4), 'Transformations')).toBeNull()
    expect(primaryKit(klass(6), 'Transformations')).toBeNull()
    expect(primaryKit(klass(6, 'KE'), 'Transformations')).toBe('transform')
    expect(KIT_PICTURES.angles).toEqual(['angle', 'protractor'])
    expect(KIT_PICTURES.shapes).toContain('angle')
    expect(kitPicturesFor('shapes', 2)).not.toContain('angle')
    expect(pictureBullet('angles', klass(4))).toContain('`protractor`')
    expect(pictureBullet('transform', klass(5))).toContain('`enlargement`')
    expect(pictureBullet('angles', klass(4))).not.toContain(String.fromCharCode(0x2014))
  })

  test('the senior writer is told of all four', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(8))
    for (const kind of ['`angle`', '`protractor`', '`parallel_lines`', '`enlargement`']) expect(senior).toContain(kind)
  })
})
