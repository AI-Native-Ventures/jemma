import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { DiagramSpecSchema, SeniorDiagramSpecSchema } from '../src/schemas/diagram'
import { LessonSchema, PrimaryLessonSchema, SeniorLessonSchema, SeniorQuestionSchema, type Lesson, type Question } from '../src/schemas/lesson'

// P87, decisions 1 and 2: two new picture kinds for a senior class (a coordinate plane and a triangle), and an optional picture inside a question.
// The primary schema (the one the demo class was recorded with) does not change by one character.

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(z.toJSONSchema(value as z.ZodType))).digest('hex')
const PRIMARY_SHA = '8d041cfb7de9ba42fd1919b91033c913475831bbd0dbe07e02d7d23efb8dc71c'

const plane = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5 } as const

describe('SeniorDiagramSpecSchema: the seven old kinds and two new ones', () => {
  test('the old kinds are read as before', () => {
    const old = [
      { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3 }] },
      { kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [] },
      { kind: 'area_model', rows: 3, cols: 4, shaded: 12 },
      { kind: 'place_value', columns: ['U'], digits: ['7'] },
      { kind: 'bar_chart', bars: [{ label: 'a', value: 1 }], yMax: 2 },
      { kind: 'shape_2d', shape: 'square', labels: [] },
      { kind: 'grid_area', cols: 2, rows: 2, cells: [[0, 0]] },
    ]
    for (const spec of old) {
      expect(SeniorDiagramSpecSchema.safeParse(spec).success).toBe(true)
      expect(DiagramSpecSchema.safeParse(spec).success).toBe(true)
    }
  })

  test('the primary schema refuses the new kinds, and its JSON text is unchanged', () => {
    expect(DiagramSpecSchema.safeParse(plane).success).toBe(false)
    expect(DiagramSpecSchema.safeParse({ kind: 'triangle', vertices: ['A', 'B', 'C'] }).success).toBe(false)
    expect(sha(PrimaryLessonSchema)).toBe(PRIMARY_SHA)
    const json = JSON.stringify(z.toJSONSchema(PrimaryLessonSchema))
    for (const word of ['coordinate_plane', '"const":"triangle"', 'parabola', 'hyperbola', 'rightAngleAt']) expect(json).not.toContain(word)
  })

  test('a coordinate plane: the frame alone, with points, with every kind of graph', () => {
    expect(SeniorDiagramSpecSchema.safeParse(plane).success).toBe(true)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, step: 2, points: [{ x: 1, y: 2 }, { x: -3, y: 4, label: 'A' }] }).success).toBe(true)
    const graphs = [
      { type: 'line', m: 2, c: 1 },
      { type: 'line', m: -0.5, c: 0, label: 'f' },
      { type: 'parabola', a: 1 },
      { type: 'parabola', a: -2, p: 1, q: 3, label: 'g' },
      { type: 'hyperbola', a: 4 },
      { type: 'hyperbola', a: -2, p: 1, q: 1 },
      { type: 'exponential', a: 1, b: 2 },
      { type: 'exponential', a: 3, b: 0.5, p: 1, q: -2 },
      { type: 'trig', fn: 'sin' },
      { type: 'trig', fn: 'cos', a: 2, b: 2, q: 1 },
      { type: 'trig', fn: 'tan', b: 0.5 },
    ]
    for (const g of graphs) expect(SeniorDiagramSpecSchema.safeParse({ ...plane, graphs: [g] }).success).toBe(true)
  })

  test('a coordinate plane without its frame, or with a graph of an unknown type, is refused', () => {
    expect(SeniorDiagramSpecSchema.safeParse({ kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5 }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, xMin: 'left' }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, graphs: [{ type: 'spiral', a: 1 }] }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, graphs: [{ type: 'line', m: 2 }] }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, graphs: [{ type: 'trig', fn: 'sec' }] }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, graphs: [{ type: 'exponential', a: 1 }] }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ ...plane, points: [{ x: 1 }] }).success).toBe(false)
  })

  test('a triangle: names alone, with angles, sides, angle labels and a right angle', () => {
    expect(SeniorDiagramSpecSchema.safeParse({ kind: 'triangle', vertices: ['A', 'B', 'C'] }).success).toBe(true)
    expect(
      SeniorDiagramSpecSchema.safeParse({
        kind: 'triangle',
        vertices: ['P', 'Q', 'R'],
        angles: [90, 60, 30],
        sides: ['5 cm', 'x', ''],
        angleLabels: ['', '60°', 'y'],
        rightAngleAt: 0,
      }).success,
    ).toBe(true)
  })

  test('a triangle without names, with a right angle at a fourth corner, or with text for an angle, is refused', () => {
    expect(SeniorDiagramSpecSchema.safeParse({ kind: 'triangle' }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ kind: 'triangle', vertices: ['A', 'B', 'C'], rightAngleAt: 3 }).success).toBe(false)
    expect(SeniorDiagramSpecSchema.safeParse({ kind: 'triangle', vertices: ['A', 'B', 'C'], angles: ['90', '60', '30'] }).success).toBe(false)
  })
})

const q = (difficulty: 1 | 2 | 3, i: number, over: Partial<Question> = {}): Question => ({
  prompt: `Question ${difficulty}.${i}`,
  render: 'text',
  answer: '3',
  answerKind: 'number',
  difficulty,
  why: 'why',
  rightWay: 'right way',
  ...over,
})
const lesson = (over: Partial<Question> = {}, extra: Partial<Lesson> = {}): Lesson => ({
  format: 'reading',
  title: 'T',
  minutes: 12,
  cards: [{ heading: 'h', body: 'b' }],
  warmup: [],
  questions: ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => q(d, i, over))),
  ...extra,
})

describe('a picture inside a question (senior only)', () => {
  test('the senior question takes an optional picture of either new kind, or none', () => {
    expect(SeniorQuestionSchema.safeParse(q(1, 1)).success).toBe(true)
    expect(SeniorQuestionSchema.safeParse(q(1, 1, { diagram: { ...plane, graphs: [{ type: 'line', m: 2, c: 1 }] } })).success).toBe(true)
    expect(SeniorQuestionSchema.safeParse(q(1, 1, { diagram: { kind: 'triangle', vertices: ['A', 'B', 'C'], angles: [90, 60, 30] } })).success).toBe(true)
    expect(SeniorQuestionSchema.safeParse({ ...q(1, 1), diagram: { kind: 'hologram' } }).success).toBe(false)
  })

  test('a lesson of the senior shape reads a picture in a question, a card and a diagram step', () => {
    const withPicture = lesson({ diagram: plane }, { cards: [{ heading: 'h', body: 'b', diagram: { kind: 'triangle', vertices: ['A', 'B', 'C'] } }] })
    expect(SeniorLessonSchema.safeParse(withPicture).success).toBe(true)
    expect(LessonSchema.safeParse(withPicture).success).toBe(true)
    const steps = lesson({}, { format: 'diagram', diagram: { title: 't', caption: 'c', steps: [{ caption: 's', diagram: plane }] } })
    expect(SeniorLessonSchema.safeParse(steps).success).toBe(true)
  })

  test('the primary shape has no picture in a question and no new kind on a card: its model would be refused', () => {
    const old = { answer: '3/4', answerKind: 'fraction' } as const
    expect(PrimaryLessonSchema.safeParse(lesson({ ...old, diagram: plane })).success).toBe(true) // an unknown key is stripped, as always
    const parsed = PrimaryLessonSchema.parse(lesson({ ...old, diagram: plane }))
    expect(parsed.questions[0]).not.toHaveProperty('diagram')
    expect(PrimaryLessonSchema.safeParse(lesson(old, { cards: [{ heading: 'h', body: 'b', diagram: plane as never }] })).success).toBe(false)
  })

  test('the JSON schema of the senior lesson names the picture and both new kinds; the primary one still has the pinned text', () => {
    const json = JSON.stringify(z.toJSONSchema(SeniorLessonSchema))
    for (const word of ['coordinate_plane', '"const":"triangle"', 'parabola', 'hyperbola', 'exponential', 'rightAngleAt', 'angleLabels']) expect(json).toContain(word)
    expect(sha(PrimaryLessonSchema)).toBe(PRIMARY_SHA)
  })

  test('a lesson that has no picture in any question parses to the same object as before', () => {
    const plain = lesson()
    expect(LessonSchema.parse(plain)).toEqual(plain)
    for (const item of LessonSchema.parse(plain).questions) expect(item).not.toHaveProperty('diagram')
  })
})
