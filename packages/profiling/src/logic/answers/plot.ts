import type { PlotSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P171: points placed on a grid, from the "Plot points on a grid" board: the learner taps the grid where each point goes (a corner of a reflected or moved
 * shape, a point from a table). The key is an ordered list of the x and the y of each point (`4; 1; 1; 1; 1; 4`), so the list marking marks each number, and a
 * learner who types the coordinates instead is marked the same way. Pure.
 */

/** The most squares across or up a grid, and the most points to place or given. */
export const PLOT_MAX_SPAN = 20
export const PLOT_MAX_PLACE = 4
export const PLOT_MAX_GIVEN = 6
export const PLOT_LABEL_MAX = 6

type Point = { x: number; y: number }

const whole = (v: number) => Number.isInteger(v)
const on = (p: PlotSpec, q: Point) => whole(q.x) && whole(q.y) && q.x >= p.xMin && q.x <= p.xMax && q.y >= p.yMin && q.y <= p.yMax

/** Why a grid to place points on cannot be used, or null. */
export function plotProblem(p: PlotSpec): string | null {
  if (![p.xMin, p.xMax, p.yMin, p.yMax].every(whole)) return 'a grid to place points on goes in whole steps'
  if (!(p.xMin < p.xMax && p.yMin < p.yMax)) return 'a grid has xMin below xMax and yMin below yMax'
  if (p.xMax - p.xMin > PLOT_MAX_SPAN || p.yMax - p.yMin > PLOT_MAX_SPAN) return `a grid to place points on is at most ${PLOT_MAX_SPAN} squares across and up`
  if (p.place.length < 1 || p.place.length > PLOT_MAX_PLACE) return `1 to ${PLOT_MAX_PLACE} points are placed`
  const given = p.given ?? []
  if (given.length > PLOT_MAX_GIVEN) return `at most ${PLOT_MAX_GIVEN} points are given`
  if (given.some((q) => !on(p, q))) return 'each given point is on a corner of the grid'
  // A sketch writes the coordinates on the grid, not the names, so its names may be longer ("turning point").
  const most = p.curve ? PLOT_CURVE_NAME_MAX : PLOT_LABEL_MAX
  const names = [...p.place, ...given.map((q) => q.label)].map((l) => l.trim())
  if (names.some((l) => !l || l.length > most)) return `each point has a name of 1 to ${most} characters`
  if (p.shape && given.length < 3) return 'a shape has 3 or more given points'
  if (p.curve && (p.shape || given.length > 0)) return 'a sketch has no given points and no shape'
  if (p.curve === 'parabola' && p.place.length !== 3) return 'a parabola is sketched through 3 key points'
  return null
}

// ---- P176: a sketch of a parabola --------------------------------------------------------------------------------------------
//
// From the "Sketch a graph" board: the learner taps the key points of the graph in the question (where it cuts the x-axis, its turning point) and Jemma joins
// them into the curve. Three points with different x values that are not on one line make exactly one parabola, so the answer is marked by its curve: three
// other points of the same graph are right too, in any order. The key is checked against the equation in the question when the lesson is saved.

/** The longest name of a key point of a sketch. */
export const PLOT_CURVE_NAME_MAX = 16

export type Parabola = { a: number; b: number; c: number }

/** The parabola y = ax² + bx + c through three points, or null when there is none (two points with one x, or the three on a line). */
export function parabolaThrough(pts: Point[]): Parabola | null {
  if (pts.length !== 3) return null
  const [p, q, r] = pts as [Point, Point, Point]
  const d = (p.x - q.x) * (p.x - r.x) * (q.x - r.x)
  if (d === 0) return null
  const a = (r.x * (q.y - p.y) + q.x * (p.y - r.y) + p.x * (r.y - q.y)) / d
  if (Math.abs(a) < 1e-9) return null
  const b = (r.x * r.x * (p.y - q.y) + q.x * q.x * (r.y - p.y) + p.x * p.x * (q.y - r.y)) / d
  const c = (q.x * r.x * (q.x - r.x) * p.y + r.x * p.x * (r.x - p.x) * q.y + p.x * q.x * (p.x - q.x) * r.y) / d
  return { a, b, c }
}

/** The y of a parabola at x. */
export const parabolaAt = (f: Parabola, x: number): number => (f.a * x + f.b) * x + f.c

/** The turning point of a parabola. */
export const turningPoint = (f: Parabola): Point => {
  const x = -f.b / (2 * f.a)
  return { x, y: parabolaAt(f, x) }
}

/** True when two parabolas are one graph (their numbers are the same, to a millionth). */
export const sameParabola = (f: Parabola, g: Parabola): boolean => Math.abs(f.a - g.a) < 1e-6 && Math.abs(f.b - g.b) < 1e-6 && Math.abs(f.c - g.c) < 1e-6

/** Marks a sketch (tapped or typed): right when its three points make the key's parabola. `comparable` is false when the answer is not points. */
export function markSketch(key: string, answer: string, read: (t: string) => number | null): { correct: boolean; comparable: boolean } {
  const k = plotPoints(key, read)
  const a = plotPoints(answer, read)
  if (!k || !a) return { correct: false, comparable: false }
  const f = parabolaThrough(k)
  const g = parabolaThrough(a)
  return { correct: f !== null && g !== null && sameParabola(f, g), comparable: true }
}

/**
 * Why the key of a sketch is not the graph of its question, or null: the key points make one parabola that turns inside the grid, and it is the graph of the
 * equation in the question (`y = x² − 4`, read by `graphOf`) at every whole x of the grid.
 */
export function sketchKeyProblem(
  q: { prompt: string; answer: string; plot: PlotSpec },
  read: (t: string) => number | null,
  graphOf: (text: string) => ((x: number) => number) | null,
): string | null {
  const pts = plotPoints(q.answer, read)
  if (!pts) return 'the answer is the x and the y of each key point'
  const f = parabolaThrough(pts)
  if (!f) return 'the 3 key points make no parabola: each has its own x, and they are not on one line'
  const top = turningPoint(f)
  if (top.x < q.plot.xMin || top.x > q.plot.xMax || top.y < q.plot.yMin || top.y > q.plot.yMax) return 'the parabola turns inside the grid'
  const graph = graphOf(q.prompt)
  if (!graph) return 'the question gives the equation of the graph to sketch, as y = ... (y = x² − 4)'
  const said = (y: number) => (Number.isFinite(y) ? String(Math.round(y * 1000) / 1000) : 'no value')
  for (const pt of pts) {
    const y = graph(pt.x)
    if (!Number.isFinite(y) || Math.abs(y - pt.y) > 1e-6) return `the key point (${pt.x}; ${pt.y}) is not on the graph of the question: at x = ${pt.x} it has y = ${said(y)}`
  }
  for (let x = q.plot.xMin; x <= q.plot.xMax; x++) {
    const y = graph(x)
    if (!Number.isFinite(y) || Math.abs(y - parabolaAt(f, x)) > 1e-6) return `the graph of the question is not a parabola: at x = ${x} it has y = ${said(y)}, not ${said(parabolaAt(f, x))}`
  }
  return null
}

/** The curve of a parabola drawn across a grid: the pieces of it inside the grid (one, or two when it turns outside), each as points to join. */
export function sketchCurve(plot: PlotSpec, f: Parabola, steps = 160): Point[][] {
  const out: Point[][] = []
  let piece: Point[] = []
  const inside = (y: number) => y >= plot.yMin - 1e-9 && y <= plot.yMax + 1e-9
  // Where the curve crosses the top or the bottom of the grid between x0 (inside) and x1 (outside), or the other way round.
  const edge = (x0: number, x1: number): Point => {
    const y1 = parabolaAt(f, x1)
    const level = y1 > plot.yMax ? plot.yMax : plot.yMin
    let lo = x0
    let hi = x1
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (inside(parabolaAt(f, mid)) === inside(parabolaAt(f, lo))) lo = mid
      else hi = mid
    }
    return { x: (lo + hi) / 2, y: level }
  }
  let prevX = plot.xMin
  for (let k = 0; k <= steps; k++) {
    const x = plot.xMin + ((plot.xMax - plot.xMin) * k) / steps
    const y = parabolaAt(f, x)
    if (inside(y)) {
      if (piece.length === 0 && k > 0) piece.push(edge(x, prevX))
      piece.push({ x, y })
    } else if (piece.length > 0) {
      piece.push(edge(prevX, x))
      out.push(piece)
      piece = []
    }
    prevX = x
  }
  if (piece.length > 1) out.push(piece)
  return out.filter((p) => p.length > 1)
}

/** A point as the sketch writes it, "(−2 ; 0)": a true minus sign, a decimal comma, at most two decimals. */
export function sketchName(p: Point): string {
  const n = (v: number) => {
    const r = Math.round(v * 100) / 100
    const t = String(Math.abs(r) < 1e-9 ? 0 : Math.abs(r)).replace('.', ',')
    return r < -1e-9 ? `\u2212${t}` : t
  }
  return `(${n(p.x)} ; ${n(p.y)})`
}

/** The points of a key or an answer (an x and a y for each point, in order), or null when the numbers do not make whole points. */
export function plotPoints(answer: string, read: (t: string) => number | null): Point[] | null {
  const values = splitValues(answer).map((t) => read(t))
  if (values.length % 2 !== 0 || !values.every((v): v is number => v !== null && Number.isFinite(v))) return null
  return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[2 * i]!, y: values[2 * i + 1]! }))
}

/** Why the key of a question with a grid is not a point on the grid for each point to place, or null. */
export function plotKeyProblem(q: { answer: string; answerKind: string; plot: PlotSpec }, read: (t: string) => number | null): string | null {
  if (q.answerKind !== 'list') return 'points placed on a grid have a list answer: the x and the y of each point'
  const points = plotPoints(q.answer, read)
  if (!points) return 'the answer is the x and the y of each point, in order'
  if (points.length !== q.plot.place.length) return `the answer has ${points.length} points for ${q.plot.place.length} to place`
  if (points.some((pt) => !on(q.plot, pt))) return 'each point of the answer is on a corner of the grid'
  return null
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth']

/**
 * A question with a grid as it is saved: its list is ordered, with a name over each box (`A' x`, `A' y`) for a learner who types the coordinates instead. The
 * points of a sketch (P176) may be any points of the graph, in any order, so their boxes are First x, First y, Second x and so on.
 */
export function tidyPlot<Q extends { answerKind: string; plot?: PlotSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.plot || q.answerKind !== 'list') return q
  if (q.plot.curve) return { ...q, ordered: true, labels: q.plot.place.flatMap((_, i) => [`${ORDINALS[i]} x`, `${ORDINALS[i]} y`]) }
  return { ...q, ordered: true, labels: q.plot.place.flatMap((l) => [`${l.trim()} x`, `${l.trim()} y`]) }
}

/** The answer the placed points make, as one text (the x and the y of each, in order), or '' while a point is not placed. */
export const plotAnswer = (points: (Point | null)[]): string =>
  points.length > 0 && points.every((p) => p !== null) ? points.map((p) => `${p!.x}; ${p!.y}`).join('; ') : ''
