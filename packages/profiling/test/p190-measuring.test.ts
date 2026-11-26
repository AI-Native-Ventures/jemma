import { describe, expect, test } from 'vitest'
import { KIT_PICTURES, kitPicturesFor, pictureBullet, primaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem, questionPictureProblem, thermometerStep } from '../src/logic/picture'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P190: the pictures of the "Measuring" board: a thing above a ruler, a kitchen scale, a measuring jug, a thermometer, a box of cubes and the net of a box. A
// measuring picture is read, so a number key is its reading. The demo schema does not change. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const GOOD: SeniorDiagramSpec[] = [
  { kind: 'ruler', to: 10, length: 9 },
  { kind: 'ruler', unit: 'in', to: 6, from: 1, length: 2.75, thing: 'ribbon' },
  { kind: 'scale_dial', max: 1000, value: 650, unit: 'g' },
  { kind: 'scale_dial', max: 2, value: 1.5, unit: 'kg' },
  { kind: 'jug', max: 1000, value: 700, unit: 'ml' },
  { kind: 'thermometer', min: -10, max: 40, value: 23 },
  { kind: 'thermometer', min: 0, max: 100, value: 70, unit: 'F' },
  { kind: 'cubes', long: 4, wide: 3, high: 2 },
  { kind: 'box_net', long: 5, wide: 3, high: 2 },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'How long is the pencil?',
  render: 'text',
  answer: '9',
  answerKind: 'whole',
  unit: 'cm',
  difficulty: 1,
  why: 'Read where it ends.',
  rightWay: 'It starts at 0 and ends at 9.',
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
    ['a ruler of 30 cm', { kind: 'ruler', to: 30, length: 9 }, '5 to 15 cm'],
    ['a ruler of 20 inches', { kind: 'ruler', unit: 'in', to: 20, length: 9 }, '3 to 12 inches'],
    ['a pencil off the ruler', { kind: 'ruler', to: 10, from: 3, length: 9 }, 'ends on the ruler'],
    ['a length of a third of a centimetre', { kind: 'ruler', to: 10, length: 4.3 }, 'whole or half centimetre'],
    ['a scale up to 800 g', { kind: 'scale_dial', max: 800, value: 400, unit: 'g' }, 'goes up to 500, 1000, 2000, 5000'],
    ['a needle between marks', { kind: 'scale_dial', max: 1000, value: 640, unit: 'g' }, 'a step of 50 g'],
    ['a jug of 3 l', { kind: 'jug', max: 3, value: 1, unit: 'l' }, 'goes up to 1, 2, 5'],
    ['an empty jug', { kind: 'jug', max: 1000, value: 0, unit: 'ml' }, 'a step of 100 ml'],
    ['water between marks', { kind: 'jug', max: 1000, value: 750, unit: 'ml' }, 'a step of 100 ml'],
    ['a thermometer from 5', { kind: 'thermometer', min: 5, max: 45, value: 20 }, 'one ten to another'],
    ['a red line off the scale', { kind: 'thermometer', min: 0, max: 40, value: 50 }, 'whole number of degrees'],
    ['half a degree', { kind: 'thermometer', min: 0, max: 40, value: 20.5 }, 'whole number of degrees'],
    ['a red line between marks of 5', { kind: 'thermometer', min: 0, max: 100, value: 68, unit: 'F' }, 'a mark every 5'],
    ['a box 7 cubes long', { kind: 'cubes', long: 7, wide: 1, high: 1 }, '1 to 6 cubes'],
    ['a net with half sizes', { kind: 'box_net', long: 2.5, wide: 1, high: 1 }, 'whole units'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })

  test('a thermometer has a mark every degree up to 30 apart, every 2 up to 60 and every 5 after', () => {
    expect([thermometerStep({ min: 0, max: 30 }), thermometerStep({ min: -10, max: 40 }), thermometerStep({ min: 0, max: 100 })]).toEqual([1, 2, 5])
  })
})

describe('the key is the reading', () => {
  test('in the unit of the picture, or one a thousand times bigger or smaller', () => {
    expect(answerProblem(question({ diagram: GOOD[0] }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[0], answer: '10' }))).toContain('the reading of the picture, 9')
    expect(answerProblem(question({ diagram: GOOD[0], answer: '90', unit: 'mm' }))).toBeNull()
    expect(answerProblem(question({ prompt: 'How much water is in the jug, in litres?', diagram: GOOD[4], answerKind: 'decimal', answer: '0,7', unit: 'l' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[4], answer: '700', unit: 'ml' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[4], answer: '600', unit: 'ml' }))).toContain('700')
    expect(answerProblem(question({ diagram: GOOD[2], answer: '650', unit: 'g' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[5], answer: '23', unit: '°C' }))).toBeNull()
    expect(answerProblem(question({ diagram: GOOD[5], answer: '24', unit: '°C' }))).toContain('23')
    // A box of cubes and a net are not read: what they ask is up to the question.
    expect(answerProblem(question({ prompt: 'How many cubes are in the top layer?', diagram: GOOD[7], answer: '12', unit: undefined }))).toBeNull()
    expect(answerProblem(question({ prompt: 'What is its surface area?', diagram: GOOD[8], answer: '62', unit: 'cm²' }))).toBeNull()
  })
})

describe('the lesson writer', () => {
  test('measuring names its new pictures for the grades they fit', () => {
    expect(KIT_PICTURES.measure).toEqual(['grid_area', 'shape_2d', 'ruler', 'scale_dial', 'jug', 'thermometer', 'cubes', 'box_net'])
    expect(kitPicturesFor('measure', 1)).toEqual(['grid_area', 'shape_2d', 'ruler'])
    expect(kitPicturesFor('measure', 3)).toEqual(['grid_area', 'shape_2d', 'ruler', 'scale_dial', 'jug', 'thermometer'])
    expect(kitPicturesFor('measure', 6)).toEqual(['grid_area', 'shape_2d', 'scale_dial', 'jug', 'thermometer', 'cubes', 'box_net'])
    expect(primaryKit(klass(6, 'US'), 'Surface area')).toBe('measure')
  })

  test('a ruler in inches and a thermometer in Fahrenheit are for a class in the US', () => {
    const za = pictureBullet('measure', klass(3))!
    const us = pictureBullet('measure', klass(3, 'US'))!
    expect(za).toContain('`ruler`')
    expect(za).not.toContain('`unit` `in`')
    expect(za).not.toContain('Fahrenheit')
    expect(us).toContain('`unit` `in`')
    expect(us).toContain('Fahrenheit')
    expect(za).toContain('a reading below 0 is a `choice` question')
    for (const text of [za, us, pictureBullet('measure', klass(6))!]) expect(text).not.toContain(String.fromCharCode(0x2014))
  })

  test('the senior writer is told of a box of cubes and the net of a box', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(8))
    expect(senior).toContain('`cubes`')
    expect(senior).toContain('`box_net`')
  })
})
