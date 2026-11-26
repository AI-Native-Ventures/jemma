import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { graphY } from '../src/logic/answers/graph-match'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem } from '../src/logic/picture'
import { PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'

// P195: the pictures of the "Grades 10 to 12 · graphs and geometry" board on a coordinate plane (a cubic, a log graph and the dashed line y = x of an inverse, a
// circle, a shape of points, the angle of a line) and a point with its angle. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const plane = (over: Partial<Extract<SeniorDiagramSpec, { kind: 'coordinate_plane' }>> = {}): SeniorDiagramSpec => ({
  kind: 'coordinate_plane',
  xMin: -5,
  xMax: 6,
  yMin: -5,
  yMax: 6,
  ...over,
})

describe('the schemas', () => {
  test('a coordinate plane takes a cubic, a log graph, a dashed line, circles, a shape and the angle of a line', () => {
    const good = [
      plane({ graphs: [{ type: 'cubic', a: 1, b: -3, c: -1, d: 3 }] }),
      plane({ graphs: [{ type: 'exponential', a: 1, b: 2 }, { type: 'log', base: 2 }, { type: 'line', m: 1, c: 0, dashed: true }] }),
      plane({ circles: [{ a: 1, b: -1, r: 3 }] }),
      plane({ polygon: true, points: [{ x: -3, y: -1 }, { x: 1, y: -2 }, { x: 3, y: 2 }] }),
      plane({ graphs: [{ type: 'line', m: 1.732, c: 1 }], inclination: { label: 'θ' } }),
      { kind: 'point_angle', x: -3, y: 4 } as SeniorDiagramSpec,
    ]
    for (const d of good) {
      expect(SeniorDiagramSpecSchema.safeParse(d).success).toBe(true)
      expect(pictureProblem(d)).toBeNull()
    }
    // A point and its angle is for a senior question only.
    expect(PrimaryPictureSpecSchema.safeParse({ kind: 'point_angle', x: -3, y: 4 }).success).toBe(false)
    expect(isSeniorQuestion({ answerKind: 'number', diagram: { kind: 'point_angle', x: -3, y: 4 } })).toBe(true)
  })

  test.each([
    ['a log of base 1', plane({ graphs: [{ type: 'log', base: 1 }] }), 'not 1'],
    ['a log of a negative base', plane({ graphs: [{ type: 'log', base: -2 }] }), 'above 0'],
    ['three circles', plane({ circles: [{ a: 0, b: 0, r: 1 }, { a: 0, b: 0, r: 2 }, { a: 0, b: 0, r: 3 }] }), 'at most 2 circles'],
    ['a circle of radius 0', plane({ circles: [{ a: 0, b: 0, r: 0 }] }), 'radius above 0'],
    ['a shape of two points', plane({ polygon: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), '3 or more points'],
    ['the angle of no line', plane({ inclination: { label: 'θ' } }), 'not flat'],
    ['the angle of a flat line', plane({ graphs: [{ type: 'line', m: 0, c: 2 }], inclination: { label: 'θ' } }), 'not flat'],
    ['a line that crosses off the grid', plane({ graphs: [{ type: 'line', m: 1, c: 20 }], inclination: { label: 'θ' } }), 'inside the grid'],
    ['the origin as the point', { kind: 'point_angle', x: 0, y: 0 }, 'not the origin'],
    ['a point off the picture', { kind: 'point_angle', x: 9, y: 2 }, '-6 to 6'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as SeniorDiagramSpec)).toContain(words)
  })
})

describe('the sums a picture and a match share', () => {
  test('a cubic and a log graph have their values, and a log none at or left of its asymptote', () => {
    const cubic = { type: 'cubic' as const, a: 1, b: -3, c: -1, d: 3 }
    expect([-1, 1, 3].map((x) => graphY(cubic, x))).toEqual([0, 0, 0])
    const log = { type: 'log' as const, base: 2, a: 1, p: 1, q: 0 }
    expect(graphY(log, 3)).toBeCloseTo(1)
    expect(graphY(log, 9)).toBeCloseTo(3)
    expect(Number.isNaN(graphY(log, 1))).toBe(true)
    expect(Number.isNaN(graphY(log, 0))).toBe(true)
  })
})

describe('the senior writer', () => {
  test('is told of the new graphs and of a point and its angle', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(11))
    for (const word of ['`cubic`', '`log`', '`dashed`', '`circles`', '`polygon`', '`inclination`', '`point_angle`']) expect(senior).toContain(word)
  })
})
