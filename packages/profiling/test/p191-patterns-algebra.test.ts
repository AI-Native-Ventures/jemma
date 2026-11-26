import { describe, expect, test } from 'vitest'
import { KIT_PICTURES, PICTURE_KITS, kitPicturesFor, pictureBullet, primaryAnswerBlock, primaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem, questionPictureProblem } from '../src/logic/picture'
import { balanceSolution, flowOutput, flowStepText, tilesOf } from '../src/logic/question-pictures'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P191: the pictures of the "Patterns, algebra and graphs" board: a growing pattern of tiles, a flow diagram, an equation as a balance scale and a graph of a trip.
// The demo schema does not change. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const FLOW: SeniorDiagramSpec = { kind: 'flow_diagram', rule: [{ op: 'multiply', by: 4 }, { op: 'add', by: 1 }], inputs: [3, 5, 7], blanks: [2, 3] }
const SCALE: SeniorDiagramSpec = { kind: 'balance', left: { x: 2, n: 3 }, right: { x: 0, n: 11 } }
const TRIP: SeniorDiagramSpec = {
  kind: 'travel_graph',
  points: [
    { t: 0, d: 0 },
    { t: 10, d: 1.5 },
    { t: 20, d: 1.5 },
    { t: 30, d: 3 },
  ],
  tMax: 30,
  dMax: 3,
  tStep: 5,
  dStep: 0.5,
  tUnit: 'min',
  dUnit: 'km',
}
const GOOD: SeniorDiagramSpec[] = [{ kind: 'tile_pattern', shape: 'L', show: 3 }, { kind: 'tile_pattern', shape: 'stairs', show: 4, from: 2 }, FLOW, SCALE, TRIP]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'How many tiles are in pattern 5?',
  render: 'text',
  answer: '11',
  answerKind: 'whole',
  difficulty: 1,
  why: 'Each pattern adds 2 tiles.',
  rightWay: '2 × 5 + 1 = 11.',
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
    ['one pattern', { kind: 'tile_pattern', shape: 'L', show: 1 }, '2 to 4 patterns'],
    ['patterns too big', { kind: 'tile_pattern', shape: 'square', show: 4, from: 5 }, 'at most 30 tiles'],
    ['a rule of four steps', { ...FLOW, rule: [{ op: 'add', by: 1 }, { op: 'add', by: 1 }, { op: 'add', by: 1 }, { op: 'add', by: 1 }] }, '1 to 3 steps'],
    ['dividing by 0', { ...FLOW, rule: [{ op: 'divide', by: 0 }] }, 'by 0'],
    ['an output that is not whole', { ...FLOW, rule: [{ op: 'divide', by: 2 }] }, 'whole number'],
    ['a blank off the diagram', { ...FLOW, blanks: [4] }, 'place of an output or an input'],
    ['the same bags on each side', { ...SCALE, right: { x: 2, n: 11 } }, 'different number of bags'],
    ['a bag of a half', { ...SCALE, right: { x: 0, n: 4 } }, 'whole number from 1 to 99'],
    ['a long letter', { ...SCALE, letter: 'xy' }, 'one small letter'],
    ['a trip that starts late', { ...TRIP, points: [{ t: 5, d: 0 }, { t: 10, d: 1 }] }, 'starts at time 0'],
    ['a trip back in time', { ...TRIP, points: [{ t: 0, d: 0 }, { t: 10, d: 1 }, { t: 10, d: 2 }] }, 'go up'],
    ['a point off the grid', { ...TRIP, points: [{ t: 0, d: 0 }, { t: 40, d: 1 }] }, 'every point is on the graph'],
    ['a grid of 30 lines', { ...TRIP, tStep: 1 }, '2 to 12 lines'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })
})

describe('the key fits the picture', () => {
  test('the blanks of a flow diagram are its key, the outputs first', () => {
    expect(answerProblem(question({ prompt: 'Find the missing outputs.', diagram: FLOW, answerKind: 'list', answer: '21; 29', ordered: true, labels: ['for 5', 'for 7'] }))).toBeNull()
    expect(answerProblem(question({ diagram: FLOW, answerKind: 'list', answer: '21; 28', ordered: true, labels: ['for 5', 'for 7'] }))).toContain('21; 29')
    const one: SeniorDiagramSpec = { kind: 'flow_diagram', rule: [{ op: 'subtract', by: 2 }, { op: 'divide', by: 2 }], inputs: [10, 6, 20], blankInputs: [2] }
    expect(answerProblem(question({ diagram: one, answer: '6' }))).toBeNull()
    expect(answerProblem(question({ diagram: one, answer: '2' }))).toContain('the blank of the flow diagram, 6')
  })

  test('a balance scale asks what a bag weighs', () => {
    expect(balanceSolution({ left: { x: 2, n: 3 }, right: { x: 0, n: 11 } })).toBe(4)
    expect(answerProblem(question({ prompt: 'What is x?', diagram: SCALE, answer: '4' }))).toBeNull()
    expect(answerProblem(question({ prompt: 'What is x?', diagram: SCALE, answer: '5' }))).toContain('what a bag weighs, 4')
  })

  test('a tile pattern and a trip are not read: what they ask is up to the question', () => {
    expect(answerProblem(question({ diagram: GOOD[0] }))).toBeNull()
    expect(answerProblem(question({ prompt: 'For how many minutes does Neo stop?', diagram: TRIP, answer: '10', unit: 'min' }))).toBeNull()
  })
})

describe('the helpers the screen and the gate share', () => {
  test('each shape grows the way its words say', () => {
    const count = (shape: string, n: number) => tilesOf(shape, n).length
    expect([1, 2, 3].map((n) => count('row', n))).toEqual([1, 2, 3])
    expect([1, 2, 3].map((n) => count('L', n))).toEqual([3, 5, 7])
    expect([1, 2, 3].map((n) => count('T', n))).toEqual([4, 7, 10])
    expect([1, 2, 3].map((n) => count('cross', n))).toEqual([5, 9, 13])
    expect([1, 2, 3].map((n) => count('square', n))).toEqual([1, 4, 9])
    expect([1, 2, 3].map((n) => count('rectangle', n))).toEqual([2, 6, 12])
    expect([1, 2, 3, 4].map((n) => count('stairs', n))).toEqual([1, 3, 6, 10])
    // No tile is drawn twice.
    for (const shape of ['row', 'L', 'T', 'cross', 'square', 'rectangle', 'stairs']) {
      const cells = tilesOf(shape, 4).map(([c, r]) => `${c},${r}`)
      expect(new Set(cells).size).toBe(cells.length)
    }
  })

  test('a flow diagram works its steps in turn, and writes them with maths signs', () => {
    expect(flowOutput([{ op: 'multiply', by: 4 }, { op: 'add', by: 1 }], 5)).toBe(21)
    expect(flowOutput([{ op: 'subtract', by: 2 }, { op: 'divide', by: 2 }], 10)).toBe(4)
    expect(flowStepText({ op: 'multiply', by: 4 })).toBe('× 4')
    expect(flowStepText({ op: 'subtract', by: 2.5 }, 'za')).toBe('− 2,5')
    expect(flowStepText({ op: 'subtract', by: 2.5 }, 'us')).toBe('− 2.5')
  })
})

describe('the lesson writer', () => {
  test('geometric patterns have a kit of their own, never for the baseline class', () => {
    expect(PICTURE_KITS).toContain('growing')
    expect(primaryKit(klass(3), 'Geometric patterns')).toBe('growing')
    expect(primaryKit(klass(6), 'Geometric patterns')).toBeNull()
    expect(primaryKit(klass(6, 'KE'), 'Geometric patterns')).toBe('growing')
    expect(KIT_PICTURES.growing).toEqual(['tile_pattern'])
    // Its questions may also ask for the next numbers as a list.
    expect(primaryAnswerBlock('growing', klass(3))).toBe(`${pictureBullet('growing', klass(3))}\n${primaryAnswerBlock('patterns', klass(3)).split('\n').find((l) => l.startsWith('- `list`'))}`)
  })

  test('number patterns show tiles and flow diagrams, each for the grades it fits', () => {
    expect(KIT_PICTURES.patterns).toEqual(['number_line', 'tile_pattern', 'flow_diagram'])
    expect(kitPicturesFor('patterns', 2)).toEqual(['number_line', 'tile_pattern'])
    expect(kitPicturesFor('patterns', 5)).toEqual(['number_line', 'tile_pattern', 'flow_diagram'])
    const bullet = pictureBullet('patterns', klass(5))!
    expect(bullet).toContain('`tile_pattern`')
    expect(bullet).toContain('`flow_diagram`')
    expect(bullet).not.toContain(String.fromCharCode(0x2014))
  })

  test('the senior writer is told of all four', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(7))
    for (const kind of ['`tile_pattern`', '`flow_diagram`', '`balance`', '`travel_graph`']) expect(senior).toContain(kind)
  })
})
