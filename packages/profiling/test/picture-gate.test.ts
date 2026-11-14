import { describe, expect, test } from 'vitest'
import { pictureProblem } from '../src/logic/picture'
import { SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Lesson, Question } from '../src/schemas/lesson'
import { answerProblem, badQuestions, DIAGRAM_WORDS } from '../src/tools/save/save-lesson'

// P87, decision 3: the save gate. A senior picture must make sense, or the question is a bad question (handled as a bad answer is today).

const plane = (over: Record<string, unknown> = {}) => ({ kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, ...over }) as SeniorDiagramSpec
const triangle = (over: Record<string, unknown> = {}) => ({ kind: 'triangle', vertices: ['A', 'B', 'C'], ...over }) as SeniorDiagramSpec
const line = { type: 'line', m: 2, c: 1 }

describe('a coordinate plane must make sense', () => {
  test.each([
    ['the frame alone', plane()],
    ['a line', plane({ graphs: [line] })],
    ['three graphs', plane({ graphs: [line, { type: 'parabola', a: 1 }, { type: 'trig', fn: 'sin' }] })],
    ['twelve points', plane({ points: Array.from({ length: 12 }, (_, i) => ({ x: i - 5, y: 0 })) })],
    ['a frame 200 wide', plane({ xMin: -100, xMax: 100, yMin: -100, yMax: 100 })],
    ['a step of 2', plane({ step: 2 })],
    ['a frame two turns wide for a trig graph', plane({ xMin: -360, xMax: 360, yMin: -2, yMax: 2, graphs: [{ type: 'trig', fn: 'sin' }] })],
    ['a frame that does not hold zero', plane({ xMin: 10, xMax: 20, yMin: 100, yMax: 150 })],
    ['an exponential', plane({ graphs: [{ type: 'exponential', a: 1, b: 2 }] })],
  ])('%s is fine', (_name, spec) => expect(pictureProblem(spec)).toBeNull())

  test.each([
    ['xMin not below xMax', plane({ xMin: 5, xMax: 5 }), 'the grid needs xMin below xMax'],
    ['xMin above xMax', plane({ xMin: 6, xMax: 5 }), 'the grid needs xMin below xMax'],
    ['yMin above yMax', plane({ yMin: 3, yMax: -3 }), 'the grid needs yMin below yMax'],
    ['thirteen points', plane({ points: Array.from({ length: 13 }, (_, i) => ({ x: i - 6, y: 0 })) }), 'the grid has at most 12 points'],
    ['four graphs', plane({ graphs: [line, line, line, line] }), 'the grid has at most 3 graphs'],
    ['x range of 201', plane({ xMin: -100, xMax: 101 }), 'the grid is at most 200 wide'],
    ['y range of 201', plane({ yMin: 0, yMax: 201 }), 'the grid is at most 200 wide'],
    ['a trig frame wider than two turns', plane({ xMin: -361, xMax: 360, graphs: [{ type: 'trig', fn: 'cos' }] }), 'the grid is at most 720 wide'],
    ['a frame 360 wide with no trig graph', plane({ xMin: 0, xMax: 360, graphs: [line] }), 'the grid is at most 200 wide'],
    ['a trig frame 201 tall', plane({ xMin: 0, xMax: 360, yMin: 0, yMax: 201, graphs: [{ type: 'trig', fn: 'sin' }] }), 'the grid is at most 200 wide'],
    ['a step of 0', plane({ step: 0 }), 'the grid step must be above 0'],
    ['a negative step', plane({ step: -1 }), 'the grid step must be above 0'],
    ['a point that is not a number', plane({ points: [{ x: Number.NaN, y: 0 }] }), 'every number on the grid must be finite'],
    ['an infinite frame', plane({ xMax: Number.POSITIVE_INFINITY }), 'every number on the grid must be finite'],
    ['an infinite graph constant', plane({ graphs: [{ type: 'line', m: Number.POSITIVE_INFINITY, c: 0 }] }), 'every number on the grid must be finite'],
    ['an exponential with a base of 0 or less', plane({ graphs: [{ type: 'exponential', a: 1, b: 0 }] }), 'an exponential graph needs a base above 0'],
  ])('%s is a bad picture', (_name, spec, problem) => expect(pictureProblem(spec)).toBe(problem))
})

describe('a triangle must make sense', () => {
  test.each([
    ['names alone', triangle()],
    ['angles that add up to 180', triangle({ angles: [90, 60, 30] })],
    ['angles that add up to 180.4', triangle({ angles: [90, 60.2, 30.2] })],
    ['a right angle where the angles say so', triangle({ angles: [30, 90, 60], rightAngleAt: 1 })],
    ['a right angle without angles', triangle({ rightAngleAt: 2 })],
    ['sides and angle labels', triangle({ sides: ['5 cm', 'x', ''], angleLabels: ['', '60°', 'y'] })],
  ])('%s is fine', (_name, spec) => expect(pictureProblem(spec)).toBeNull())

  test.each([
    ['two names', triangle({ vertices: ['A', 'B'] }), 'the triangle needs three names'],
    ['four names', triangle({ vertices: ['A', 'B', 'C', 'D'] }), 'the triangle needs three names'],
    ['an empty name', triangle({ vertices: ['A', ' ', 'C'] }), 'the triangle needs three names'],
    ['angles that add up to 190', triangle({ angles: [90, 60, 40] }), 'the angles of the triangle must add up to 180'],
    ['angles that add up to 180.6', triangle({ angles: [90, 60.3, 30.3] }), 'the angles of the triangle must add up to 180'],
    ['an angle of 0', triangle({ angles: [0, 90, 90] }), 'every angle of the triangle must be above 0'],
    ['a negative angle', triangle({ angles: [-10, 100, 90] }), 'every angle of the triangle must be above 0'],
    ['two angles only', triangle({ angles: [90, 90] }), 'the triangle needs three angles'],
    ['two right angles', triangle({ angles: [90, 90, 0.2] }), 'the triangle has at most one right angle'],
    ['a right angle that the angles do not have', triangle({ angles: [60, 60, 60], rightAngleAt: 0 }), 'the right angle must be where an angle is 90'],
    ['two side labels', triangle({ sides: ['5 cm', 'x'] }), 'the triangle needs three side labels'],
    ['four angle labels', triangle({ angleLabels: ['a', 'b', 'c', 'd'] }), 'the triangle needs three angle labels'],
  ])('%s is a bad picture', (_name, spec, problem) => expect(pictureProblem(spec)).toBe(problem))
})

describe('the old kinds are not looked at', () => {
  test('a picture of an old kind is fine as it is', () => {
    expect(pictureProblem({ kind: 'area_model', rows: 3, cols: 4, shaded: 12 })).toBeNull()
    expect(pictureProblem({ kind: 'shape_2d', shape: 'triangle', labels: [] })).toBeNull()
  })
})

const q = (over: Partial<Question> = {}): Question => ({
  prompt: 'What is the gradient of this line?',
  render: 'text',
  answer: '2',
  answerKind: 'number',
  difficulty: 1,
  why: 'why',
  rightWay: 'right way',
  ...over,
})

describe('the question carries its picture to the gate', () => {
  test('a good answer with a good picture is fine; one without a picture is as before', () => {
    expect(answerProblem(q({ diagram: plane({ graphs: [line] }) }))).toBeNull()
    expect(answerProblem(q())).toBeNull()
  })

  test('a good answer with a bad picture is a bad question, and the answer is looked at first', () => {
    expect(answerProblem(q({ diagram: plane({ xMin: 5, xMax: -5 }) }))).toBe('picture: the grid needs xMin below xMax')
    expect(answerProblem(q({ answer: 'two', diagram: plane({ xMin: 5, xMax: -5 }) }))).toBe('answer "two" is not a number')
  })

  test('badQuestions lists the questions with a bad picture, warm-up and questions apart', () => {
    const lesson = {
      format: 'reading',
      title: 'T',
      minutes: 12,
      warmup: [q({ diagram: triangle({ angles: [90, 60, 30] }) }), q({ diagram: triangle({ vertices: ['A'] }) })],
      questions: [q({ diagram: plane() }), q({ diagram: plane({ yMin: 1, yMax: 1 }) }), q(), q({ diagram: triangle({ angles: [100, 100, 100] }) })],
    } satisfies Lesson
    expect(badQuestions(lesson)).toEqual({ warmup: [1], questions: [1, 3] })
  })
})

describe('the words of a lesson that was made with pictures', () => {
  test('every kind of picture a senior lesson can hold has words', () => {
    const kinds = SeniorDiagramSpecSchema.options.map((o) => o.shape.kind.value)
    expect(kinds).toHaveLength(9)
    for (const kind of kinds) expect(DIAGRAM_WORDS[kind], kind).toBeTruthy()
    expect(DIAGRAM_WORDS.coordinate_plane).toBe('graphs on a grid')
    expect(DIAGRAM_WORDS.triangle).toBe('triangles')
  })
})
