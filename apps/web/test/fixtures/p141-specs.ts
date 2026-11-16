import type { CoordinatePlaneSpec, DiagramSpec } from '@jemma/profiling/schemas'

// P141: pictures that must draw exactly as they did before the thinning of axis numbers and the inequality rays (their markup was taken from the
// code before the change, p141-before.json). None of them is crowded and none has an inequality as a label.
type NumberLineSpec = Extract<DiagramSpec, { kind: 'number_line' }>

export const NUMBER_LINES: Record<string, NumberLineSpec> = {
  hops: { kind: 'number_line', min: 0, max: 12, step: 1, marks: [{ value: 11, label: '2x + 3' }] },
  fraction: { kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '3/4' }] },
  plain: { kind: 'number_line', min: 0, max: 10, step: 1, marks: [] },
  word: { kind: 'number_line', min: -3, max: 8, step: 1, marks: [{ value: 4, label: 'A' }] },
  two: { kind: 'number_line', min: 0, max: 12, step: 1, marks: [{ value: 5, label: '2x + 3' }, { value: 6, label: 'x + 8' }] },
  negative: { kind: 'number_line', min: -5, max: 5, step: 1, marks: [{ value: -2, label: '-2' }] },
  equals: { kind: 'number_line', min: 0, max: 10, step: 1, marks: [{ value: 4, label: 'x = 4' }] },
}

export const PLANES: Record<string, CoordinatePlaneSpec> = {
  small: {
    kind: 'coordinate_plane',
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 5,
    step: 1,
    graphs: [{ type: 'line', m: 1, c: 2, label: 'y = x + 2' }],
    points: [{ x: 0, y: 2, label: '(0; 2)' }],
  },
  wide: {
    kind: 'coordinate_plane',
    xMin: -8,
    xMax: 8,
    yMin: -4,
    yMax: 6,
    step: 2,
    graphs: [{ type: 'parabola', a: 1, p: 0, q: -2, label: 'y = x^2 - 2' }],
    points: [],
  },
  steps2: { kind: 'coordinate_plane', xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 2, graphs: [{ type: 'line', m: -1, c: 3, label: 'y = -x + 3' }], points: [{ x: 3, y: 0 }] },
  quadrant: { kind: 'coordinate_plane', xMin: 0, xMax: 10, yMin: 0, yMax: 10, step: 1, graphs: [{ type: 'line', m: 1, c: 0, label: 'y = x' }], points: [] },
}
