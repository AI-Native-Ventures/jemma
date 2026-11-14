import { describe, expect, test } from 'vitest'
import type { Graph } from '@jemma/profiling/schemas'
import { defaultStep, graphEquation, graphValue, sampleGraph, ticksOf, type Frame } from '@/components/diagrams/plane-math'

// P87, decision 1: the sampler as a pure function. The model gives a graph by its constants; code samples it, breaks the curve where it is
// undefined or leaves the frame, and never returns a point outside the frame.

const frame = (xMin: number, xMax: number, yMin: number, yMax: number): Frame => ({ xMin, xMax, yMin, yMax })
const SQUARE = frame(-5, 5, -5, 5)
const inside = (f: Frame, pieces: { x: number; y: number }[][]) =>
  pieces.every((p) => p.every((pt) => pt.x >= f.xMin && pt.x <= f.xMax && pt.y >= f.yMin && pt.y <= f.yMax && Number.isFinite(pt.x) && Number.isFinite(pt.y)))
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('graphValue: each kind of graph, with its defaults', () => {
  test('a line', () => expect(graphValue({ type: 'line', m: 2, c: 1 }, 3)).toBe(7))
  test('a parabola: y = a(x - p)^2 + q, p and q default to 0', () => {
    expect(graphValue({ type: 'parabola', a: 1 }, 3)).toBe(9)
    expect(graphValue({ type: 'parabola', a: -2, p: 1, q: 3 }, 3)).toBe(-5)
  })
  test('a hyperbola: y = a/(x - p) + q, undefined at x = p', () => {
    expect(graphValue({ type: 'hyperbola', a: 4 }, 2)).toBe(2)
    expect(graphValue({ type: 'hyperbola', a: 2, p: 1, q: 1 }, 3)).toBe(2)
    expect(graphValue({ type: 'hyperbola', a: 4 }, 0)).toBeNaN()
  })
  test('an exponential: y = a·b^(x - p) + q', () => {
    expect(graphValue({ type: 'exponential', a: 1, b: 2 }, 3)).toBe(8)
    expect(graphValue({ type: 'exponential', a: 3, b: 0.5, p: 1, q: -2 }, 3)).toBeCloseTo(-1.25, 12)
  })
  test('sin, cos and tan take degrees: y = a·fn(b·x) + q, a and b default to 1, q to 0', () => {
    close(graphValue({ type: 'trig', fn: 'sin' }, 30), 0.5)
    close(graphValue({ type: 'trig', fn: 'sin' }, 90), 1)
    close(graphValue({ type: 'trig', fn: 'cos' }, 60), 0.5)
    close(graphValue({ type: 'trig', fn: 'cos', a: 2, b: 2, q: 1 }, 0), 3)
    close(graphValue({ type: 'trig', fn: 'cos', a: 2, b: 2, q: 1 }, 90), -1)
    close(graphValue({ type: 'trig', fn: 'tan' }, 45), 1)
    close(graphValue({ type: 'trig', fn: 'tan', b: 0.5 }, 90), 1)
  })
  test('tan is undefined at 90 degrees', () => {
    expect(graphValue({ type: 'trig', fn: 'tan' }, 90)).toBeNaN()
    expect(graphValue({ type: 'trig', fn: 'tan' }, -270)).toBeNaN()
  })
})

describe('sampleGraph: a line is clipped to the frame', () => {
  test('y = 2x + 1 in a grid from -5 to 5 is one piece of two points, on the edges of the frame', () => {
    const pieces = sampleGraph({ type: 'line', m: 2, c: 1 }, SQUARE)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toHaveLength(2)
    const [a, b] = pieces[0]!
    close(a!.x, -3)
    close(a!.y, -5)
    close(b!.x, 2)
    close(b!.y, 5)
    expect(inside(SQUARE, pieces)).toBe(true)
  })
  test('every point of the line is on the line', () => {
    for (const [x, y] of sampleGraph({ type: 'line', m: -0.5, c: 1 }, SQUARE).flat().map((p) => [p.x, p.y] as const)) close(y, -0.5 * x + 1)
  })
  test('a flat line, a steep line and a line through the whole frame', () => {
    const flat = sampleGraph({ type: 'line', m: 0, c: 2 }, SQUARE)
    expect(flat[0]!.map((p) => [p.x, p.y])).toEqual([[-5, 2], [5, 2]])
    const steep = sampleGraph({ type: 'line', m: 1000, c: 0 }, SQUARE)
    expect(steep).toHaveLength(1)
    expect(inside(SQUARE, steep)).toBe(true)
    const through = sampleGraph({ type: 'line', m: 1, c: 0 }, SQUARE)
    expect(through[0]!.map((p) => [p.x, p.y])).toEqual([[-5, -5], [5, 5]])
  })
  test('a line outside the frame is nothing', () => {
    expect(sampleGraph({ type: 'line', m: 1, c: 20 }, SQUARE)).toEqual([])
    expect(sampleGraph({ type: 'line', m: 0, c: -6 }, SQUARE)).toEqual([])
  })
})

describe('sampleGraph: curves are broken where they are undefined or leave the frame', () => {
  test('y = 1/x has two pieces, one each side of the asymptote, and none touches x = 0', () => {
    const pieces = sampleGraph({ type: 'hyperbola', a: 1 }, SQUARE)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]!.every((p) => p.x < 0)).toBe(true)
    expect(pieces[1]!.every((p) => p.x > 0)).toBe(true)
    expect(inside(SQUARE, pieces)).toBe(true)
    // the right piece comes down from the top of the frame at x = 0.2 (y = 5)
    close(pieces[1]![0]!.x, 0.2, 1e-4)
    close(pieces[1]![0]!.y, 5, 1e-3)
  })
  test('y = 2/(x - 1) + 1: the asymptote is at x = 1', () => {
    const pieces = sampleGraph({ type: 'hyperbola', a: 2, p: 1, q: 1 }, SQUARE)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]!.every((p) => p.x < 1)).toBe(true)
    expect(pieces[1]!.every((p) => p.x > 1)).toBe(true)
    for (const { x, y } of pieces.flat()) close(y, 2 / (x - 1) + 1, 1e-9)
  })
  test('y = tan x in degrees from -180 to 180 has three pieces, broken at -90 and 90', () => {
    const f = frame(-180, 180, -5, 5)
    const pieces = sampleGraph({ type: 'trig', fn: 'tan' }, f)
    expect(pieces).toHaveLength(3)
    expect(inside(f, pieces)).toBe(true)
    for (const piece of pieces) {
      const xs = piece.map((p) => p.x)
      const k = (x: number) => Math.floor((x + 90) / 180)
      expect(new Set(xs.map(k)).size).toBe(1)
    }
    const middle = pieces.find((p) => p.some((pt) => Math.abs(pt.x) < 1))!
    close(Math.min(...middle.map((p) => p.x)), Math.atan(5) * (180 / Math.PI) * -1, 1e-3)
  })
  test('y = sin x from -360 to 360 is one piece that reaches 1 at 90', () => {
    const f = frame(-360, 360, -2, 2)
    const pieces = sampleGraph({ type: 'trig', fn: 'sin' }, f)
    expect(pieces).toHaveLength(1)
    expect(inside(f, pieces)).toBe(true)
    const top = pieces[0]!.reduce((best, p) => (p.y > best.y ? p : best))
    close(top.y, 1, 1e-3)
  })
  test('a sine with an amplitude of 3 leaves a frame of height 4 and comes back: several pieces', () => {
    const f = frame(0, 360, -2, 2)
    const pieces = sampleGraph({ type: 'trig', fn: 'sin', a: 3 }, f)
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    expect(inside(f, pieces)).toBe(true)
    for (const { x, y } of pieces.flat()) close(y, 3 * Math.sin((x * Math.PI) / 180), 1e-6)
  })
  test('y = 2^x leaves the top of the frame at x = log2(10)', () => {
    const f = frame(-3, 5, -1, 10)
    const pieces = sampleGraph({ type: 'exponential', a: 1, b: 2 }, f)
    expect(pieces).toHaveLength(1)
    const end = pieces[0]!.at(-1)!
    close(end.x, Math.log2(10), 1e-3)
    close(end.y, 10, 1e-2)
    expect(inside(f, pieces)).toBe(true)
  })
  test('y = x^2 - 2 in a frame from y = -1 to 3 is two pieces, and the curve below the frame is left out', () => {
    const f = frame(-5, 5, -1, 3)
    const pieces = sampleGraph({ type: 'parabola', a: 1, q: -2 }, f)
    expect(pieces).toHaveLength(2)
    close(pieces[0]![0]!.x, -Math.sqrt(5), 1e-3)
    close(pieces[0]!.at(-1)!.x, -1, 1e-3)
    close(pieces[1]![0]!.x, 1, 1e-3)
    close(pieces[1]!.at(-1)!.x, Math.sqrt(5), 1e-3)
    expect(inside(f, pieces)).toBe(true)
  })
  test('a graph entirely outside the frame is nothing', () => {
    expect(sampleGraph({ type: 'parabola', a: 1, q: 50 }, SQUARE)).toEqual([])
    expect(sampleGraph({ type: 'exponential', a: 1, b: 2, q: 100 }, SQUARE)).toEqual([])
  })
  test('a curve that goes from below the frame to above it between two samples is still drawn', () => {
    // y = 1e-6 · (1e300)^x climbs through the frame (y from 0.5 to 5) in a stretch of x narrower than the gap between two samples
    const f = frame(0, 2, 0.5, 5)
    const pieces = sampleGraph({ type: 'exponential', a: 1e-6, b: 1e300 }, f)
    expect(pieces).toHaveLength(1)
    expect(inside(f, pieces)).toBe(true)
    close(pieces[0]![0]!.y, 0.5, 1e-6)
    close(pieces[0]!.at(-1)!.y, 5, 1e-6)
  })
})

describe('sampleGraph never throws and never leaves the frame', () => {
  const graphs: Graph[] = [
    { type: 'exponential', a: 1, b: 0 },
    { type: 'exponential', a: 1, b: -2 },
    { type: 'exponential', a: 1, b: 1e308 },
    { type: 'hyperbola', a: 0 },
    { type: 'hyperbola', a: 1e300, p: 0.0001 },
    { type: 'trig', fn: 'tan', b: 0 },
    { type: 'trig', fn: 'tan', b: 1e6 },
    { type: 'trig', fn: 'cos', a: 1e308, b: 1e308 },
    { type: 'line', m: Number.NaN, c: 0 },
    { type: 'line', m: Number.POSITIVE_INFINITY, c: 0 },
    { type: 'parabola', a: 1e200, p: 1e200 },
  ]
  test.each(graphs.map((g, i) => [i, g] as const))('graph %i', (_i, g) => {
    expect(() => sampleGraph(g, SQUARE)).not.toThrow()
    expect(inside(SQUARE, sampleGraph(g, SQUARE))).toBe(true)
  })
  test('a frame that is upside down or has no width is nothing', () => {
    expect(sampleGraph({ type: 'line', m: 1, c: 0 }, frame(5, -5, -5, 5))).toEqual([])
    expect(sampleGraph({ type: 'parabola', a: 1 }, frame(0, 0, -5, 5))).toEqual([])
  })
})

describe('numbers on the axes: at most 10 an axis', () => {
  test.each([
    [-5, 5, 1],
    [0, 10, 1],
    [-3, 8, 2],
    [-10, 10, 2],
    [-6, 6, 2],
    [0, 12, 2],
    [-20, 20, 5],
    [-100, 100, 20],
    [-1, 1, 0.2],
    [0, 360, 50],
    [-360, 360, 100],
    [-180, 180, 50],
  ])('from %i to %i the step is %d', (min, max, step) => expect(defaultStep(min, max)).toBe(step))

  test('every default gives at most ten numbers other than 0', () => {
    for (const [min, max] of [[-5, 5], [0, 7], [-13, 29], [0.5, 3.5], [-200, 0], [-0.3, 0.3], [-1000, 1000], [10, 20], [-90, 450]] as const) {
      const step = defaultStep(min, max)
      expect(ticksOf(min, max, step).filter((v) => v !== 0).length).toBeLessThanOrEqual(10)
    }
  })

  test('ticksOf lists the multiples of the step inside the frame, with no rounding noise', () => {
    expect(ticksOf(-5, 5, 2)).toEqual([-4, -2, 0, 2, 4])
    expect(ticksOf(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    expect(ticksOf(-1.5, 1.5, 0.5)).toEqual([-1.5, -1, -0.5, 0, 0.5, 1, 1.5])
  })

  test('a step the model gave is used; one that would give a wall of numbers, or is not above 0, is not', () => {
    expect(defaultStep(-5, 5, 2)).toBe(2)
    expect(defaultStep(-5, 5, 0.001)).toBe(1)
    expect(defaultStep(-2, 2, 90)).toBe(0.5)
    expect(defaultStep(-360, 360, 90)).toBe(90)
    expect(defaultStep(0, 3, 2)).toBe(0.5)
    expect(defaultStep(-5, 5, 0)).toBe(1)
    expect(defaultStep(-5, 5, -1)).toBe(1)
    expect(defaultStep(-5, 5, Number.NaN)).toBe(1)
  })
})

describe('graphEquation: the graph in words, for the spoken description', () => {
  test.each([
    [{ type: 'line', m: 2, c: 1 }, 'y = 2x + 1'],
    [{ type: 'line', m: 1, c: 0 }, 'y = x'],
    [{ type: 'line', m: -1, c: -3 }, 'y = -x - 3'],
    [{ type: 'line', m: 0.5, c: 0 }, 'y = 0,5x'],
    [{ type: 'line', m: 0, c: 4 }, 'y = 4'],
    [{ type: 'parabola', a: 1 }, 'y = x^2'],
    [{ type: 'parabola', a: -2, p: 1, q: 3 }, 'y = -2(x - 1)^2 + 3'],
    [{ type: 'parabola', a: 1, p: -2 }, 'y = (x + 2)^2'],
    [{ type: 'hyperbola', a: 4 }, 'y = 4/x'],
    [{ type: 'hyperbola', a: 2, p: 1, q: -1 }, 'y = 2/(x - 1) - 1'],
    [{ type: 'exponential', a: 1, b: 2 }, 'y = 2^x'],
    [{ type: 'exponential', a: 3, b: 0.5, p: 1, q: -2 }, 'y = 3 × 0,5^(x - 1) - 2'],
    [{ type: 'trig', fn: 'sin' }, 'y = sin x'],
    [{ type: 'trig', fn: 'cos', a: 2, b: 2, q: 1 }, 'y = 2cos 2x + 1'],
    [{ type: 'trig', fn: 'tan', b: 0.5 }, 'y = tan 0,5x'],
  ] as [Graph, string][])('%j is %s', (g, text) => expect(graphEquation(g)).toBe(text))
})
