import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem } from '../src/logic/picture'
import { PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P196: the rest of the "Grades 10 to 12" boards: angles in a circle, the CAST quadrants, an angle of elevation in 3D, a box cut from a card, and the sizes of a 3D
// object (with a formula sheet on the screen). No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const CIRCLE: SeniorDiagramSpec = { kind: 'circle_angles', centre: 110, ask: 'circle' }
const GOOD: SeniorDiagramSpec[] = [
  CIRCLE,
  { kind: 'cast', degrees: 150 },
  { kind: 'elevation', ground: '80 m', angle: '30°', height: 'h' },
  { kind: 'cut_box', side: '30 cm' },
  { kind: 'solid', shape: 'cone', sizes: { radius: '3 cm', height: '4 cm', slant: '5 cm' } },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'O is the centre. Find x.',
  render: 'text',
  answer: '55',
  answerKind: 'number',
  steps: ['The angle at the centre is twice the angle at the circle.', 'x = 110° ÷ 2 = 55°'],
  difficulty: 2,
  why: 'The angle at the centre is twice the angle at the circle on the same arc.',
  rightWay: 'x = 55°',
  ...over,
})

describe('the schemas', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('the wide reader takes %s, and it makes sense', (_kind, d) => {
    expect(SeniorDiagramSpecSchema.safeParse(d).success).toBe(true)
    expect(pictureProblem(d)).toBeNull()
  })

  test('the four new pictures are for a senior question only, and make it one', () => {
    for (const d of GOOD.slice(0, 4)) {
      expect(PrimaryPictureSpecSchema.safeParse(d).success).toBe(false)
      expect(isSeniorQuestion({ answerKind: 'whole', diagram: d })).toBe(true)
    }
    // A 3D object with its sizes may be a primary picture too.
    expect(PrimaryPictureSpecSchema.safeParse(GOOD[4]).success).toBe(true)
  })

  test.each([
    ['an angle at the centre of 170°', { kind: 'circle_angles', centre: 170, ask: 'circle' }, '40 to 160'],
    ['an odd angle at the centre', { kind: 'circle_angles', centre: 111, ask: 'circle' }, 'even'],
    ['a CAST angle of 400°', { kind: 'cast', degrees: 400 }, '1 to 359'],
    ['a long label on a tower', { kind: 'elevation', ground: 'eighty metres', angle: '30°' }, 'short'],
    ['a long size of a cone', { kind: 'solid', shape: 'cone', sizes: { radius: 'three centimetres' } }, 'short label'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })
})

describe('the key fits the picture', () => {
  test('the angle x in a circle stands on the same arc as the other', () => {
    expect(answerProblem(question({ diagram: CIRCLE }))).toBeNull()
    expect(answerProblem(question({ diagram: CIRCLE, answer: '110' }))).toContain('the angle x of the circle, 55')
    expect(answerProblem(question({ prompt: 'Find x.', diagram: { kind: 'circle_angles', centre: 80, ask: 'centre' }, answer: '80', rightWay: 'x = 80°' }))).toBeNull()
  })

  test('a protractor and parallel lines are checked for a senior number key too', () => {
    expect(answerProblem(question({ prompt: 'How big is the angle?', diagram: { kind: 'protractor', degrees: 125 }, answer: '55' }))).toContain('the protractor reads, 125')
  })
})

describe('the senior writer', () => {
  test('is told of all of them', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(12))
    for (const word of ['`circle_angles`', '`cast`', '`elevation`', '`cut_box`', '`sizes`']) expect(senior).toContain(word)
  })
})
