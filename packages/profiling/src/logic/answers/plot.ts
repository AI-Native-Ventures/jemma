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
  if (p.curve && p.place.length !== CURVE_POINTS[p.curve]) return `a ${CURVE_NAME[p.curve]} is sketched through ${CURVE_POINTS[p.curve]} key points`
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

// ---- P181: a hyperbola and a cubic graph -------------------------------------------------------------------------------------
//
// The rest of the "Sketch a graph" board: a hyperbola y = a/(x − p) + q through 3 points (both asymptotes are drawn), and a cubic graph through 4 key points.
// Like a parabola, the points make exactly one curve of their kind, so the answer is marked by its curve.

export type CurveKind = NonNullable<PlotSpec['curve']>
/** y = a/(x − p) + q: its asymptotes are x = p and y = q. */
export type Hyperbola = { a: number; p: number; q: number }
/** y = ax³ + bx² + cx + d. */
export type Cubic = { a: number; b: number; c: number; d: number }
export type Curve = { kind: 'parabola'; f: Parabola } | { kind: 'hyperbola'; f: Hyperbola } | { kind: 'cubic'; f: Cubic }

/** How many points make each curve, and its name in words. */
export const CURVE_POINTS: Record<CurveKind, number> = { parabola: 3, hyperbola: 3, cubic: 4 }
export const CURVE_NAME: Record<CurveKind, string> = { parabola: 'parabola', hyperbola: 'hyperbola', cubic: 'cubic graph' }

/** The hyperbola y = a/(x − p) + q through three points, or null when there is none (the three are on a line, or two share an x or a y on a line). */
export function hyperbolaThrough(pts: Point[]): Hyperbola | null {
  if (pts.length !== 3) return null
  // xy = qx + py + c with c = a − pq: three equations in q, p and c, solved by Cramer's rule.
  const [r1, r2, r3] = pts as [Point, Point, Point]
  const det = (m: number[][]) =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
  const rows = [r1, r2, r3].map((r) => [r.x, r.y, 1])
  const rhs = [r1, r2, r3].map((r) => r.x * r.y)
  const d = det(rows)
  if (Math.abs(d) < 1e-9) return null
  const col = (k: number) => det(rows.map((row, i) => row.map((v, j) => (j === k ? rhs[i]! : v))))
  const q = col(0) / d
  const p = col(1) / d
  const c = col(2) / d
  const a = c + p * q
  if (Math.abs(a) < 1e-9 || pts.some((r) => Math.abs(r.x - p) < 1e-9)) return null
  return { a, p, q }
}

/** The cubic graph through four points with different x values, or null when there is none (two share an x, or the four are on a parabola or a line). */
export function cubicThrough(pts: Point[]): Cubic | null {
  if (pts.length !== 4 || new Set(pts.map((r) => r.x)).size !== 4) return null
  // Lagrange: add up each point's own cubic, kept as its four numbers.
  const out = [0, 0, 0, 0]
  pts.forEach((r, i) => {
    const others = pts.filter((_, j) => j !== i).map((o) => o.x)
    const scale = r.y / others.reduce((m, x) => m * (r.x - x), 1)
    const [u, v, w] = others as [number, number, number]
    out[0]! += scale
    out[1]! -= scale * (u + v + w)
    out[2]! += scale * (u * v + u * w + v * w)
    out[3]! -= scale * u * v * w
  })
  const [a, b, c, d] = out as [number, number, number, number]
  return Math.abs(a) < 1e-9 ? null : { a, b, c, d }
}

/** The curve of a kind through points, or null when they make none. */
export function curveThrough(kind: CurveKind, pts: Point[]): Curve | null {
  if (kind === 'hyperbola') {
    const f = hyperbolaThrough(pts)
    return f ? { kind, f } : null
  }
  if (kind === 'cubic') {
    const f = cubicThrough(pts)
    return f ? { kind, f } : null
  }
  const f = parabolaThrough(pts)
  return f ? { kind: 'parabola', f } : null
}

/** The y of a curve at x (not a number where it has none: on the asymptote of a hyperbola). */
export function curveAt(c: Curve, x: number): number {
  if (c.kind === 'hyperbola') return Math.abs(x - c.f.p) < 1e-12 ? NaN : c.f.a / (x - c.f.p) + c.f.q
  if (c.kind === 'cubic') return ((c.f.a * x + c.f.b) * x + c.f.c) * x + c.f.d
  return parabolaAt(c.f, x)
}

/** True when two curves are one graph: the same kind with the same numbers, to a millionth. */
export function sameCurve(c: Curve, d: Curve): boolean {
  if (c.kind !== d.kind) return false
  const close = (u: number, v: number) => Math.abs(u - v) < 1e-6
  if (c.kind === 'hyperbola' && d.kind === 'hyperbola') return close(c.f.a, d.f.a) && close(c.f.p, d.f.p) && close(c.f.q, d.f.q)
  if (c.kind === 'cubic' && d.kind === 'cubic') return close(c.f.a, d.f.a) && close(c.f.b, d.f.b) && close(c.f.c, d.f.c) && close(c.f.d, d.f.d)
  return c.kind === 'parabola' && d.kind === 'parabola' && sameParabola(c.f, d.f)
}

/** The turning points of a curve: one for a parabola, two or none for a cubic graph, none for a hyperbola. */
export function turningPoints(c: Curve): Point[] {
  if (c.kind === 'parabola') return [turningPoint(c.f)]
  if (c.kind === 'hyperbola') return []
  // 3ax² + 2bx + c = 0
  const { a, b, c: k } = c.f
  const disc = 4 * b * b - 12 * a * k
  if (disc <= 1e-12) return []
  const xs = [(-2 * b - Math.sqrt(disc)) / (6 * a), (-2 * b + Math.sqrt(disc)) / (6 * a)].sort((u, v) => u - v)
  return xs.map((x) => ({ x, y: curveAt(c, x) }))
}

/** A number as a sketch writes it: a true minus sign, a decimal comma, at most two decimals. */
const said = (v: number) => {
  const r = Math.round(v * 100) / 100
  const t = String(Math.abs(r) < 1e-9 ? 0 : Math.abs(r)).replace('.', ',')
  return r < -1e-9 ? `\u2212${t}` : t
}

/** What a curve is said by in the results: where it turns ("turns at (0 ; −4)"), or its asymptotes ("has asymptotes x = 1 and y = 2"). */
export function curveWords(c: Curve): string {
  if (c.kind === 'hyperbola') return `has asymptotes x = ${said(c.f.p)} and y = ${said(c.f.q)}`
  const tops = turningPoints(c)
  return tops.length === 0 ? 'has no turning point' : `turns at ${tops.map(sketchName).join(' and ')}`
}

/** Marks a sketch (tapped or typed): right when its points make the key's curve. `comparable` is false when the answer is not points. */
export function markSketch(key: string, answer: string, read: (t: string) => number | null, kind: CurveKind = 'parabola'): { correct: boolean; comparable: boolean } {
  const k = plotPoints(key, read)
  const a = plotPoints(answer, read)
  if (!k || !a) return { correct: false, comparable: false }
  const f = curveThrough(kind, k)
  const g = curveThrough(kind, a)
  return { correct: f !== null && g !== null && sameCurve(f, g), comparable: true }
}

const inGrid = (plot: PlotSpec, pt: Point) => pt.x >= plot.xMin && pt.x <= plot.xMax && pt.y >= plot.yMin && pt.y <= plot.yMax

/**
 * Why the key of a sketch is not the graph of its question, or null: the key points make one curve of its kind that shows its shape on the grid (a parabola and a
 * cubic graph turn inside it, a hyperbola has both asymptotes inside it), and it is the graph of the equation in the question (`y = x² − 4`, read by
 * `graphOf`) at every whole x of the grid.
 */
export function sketchKeyProblem(
  q: { prompt: string; answer: string; plot: PlotSpec },
  read: (t: string) => number | null,
  graphOf: (text: string) => ((x: number) => number) | null,
): string | null {
  const kind: CurveKind = q.plot.curve ?? 'parabola'
  const n = CURVE_POINTS[kind]
  const name = CURVE_NAME[kind]
  const pts = plotPoints(q.answer, read)
  if (!pts) return 'the answer is the x and the y of each key point'
  const curve = curveThrough(kind, pts)
  if (!curve)
    return kind === 'cubic'
      ? 'the 4 key points make no cubic graph: each has its own x, and they are not on a parabola or a line'
      : kind === 'hyperbola'
        ? 'the 3 key points make no hyperbola y = a/(x − p) + q'
        : `the ${n} key points make no ${name}: each has its own x, and they are not on one line`
  if (curve.kind === 'hyperbola') {
    const { p, q: level } = curve.f
    if (!(p > q.plot.xMin && p < q.plot.xMax && level > q.plot.yMin && level < q.plot.yMax)) return 'both asymptotes of the hyperbola are inside the grid'
  } else if (turningPoints(curve).some((t) => !inGrid(q.plot, t))) return `the ${name} turns inside the grid`
  const graph = graphOf(q.prompt)
  if (!graph) return 'the question gives the equation of the graph to sketch, as y = ... (y = x² − 4)'
  const show = (y: number) => (Number.isFinite(y) ? String(Math.round(y * 1000) / 1000) : 'no value')
  for (const pt of pts) {
    const y = graph(pt.x)
    if (!Number.isFinite(y) || Math.abs(y - pt.y) > 1e-6) return `the key point (${pt.x}; ${pt.y}) is not on the graph of the question: at x = ${pt.x} it has y = ${show(y)}`
  }
  for (let x = q.plot.xMin; x <= q.plot.xMax; x++) {
    const y = graph(x)
    const want = curveAt(curve, x)
    if (!Number.isFinite(y) && !Number.isFinite(want)) continue
    if (!Number.isFinite(y) || !Number.isFinite(want) || Math.abs(y - want) > 1e-6) return `the graph of the question is not a ${name}: at x = ${x} it has y = ${show(y)}, not ${show(want)}`
  }
  return null
}

/**
 * The curve drawn across a grid: the pieces of it inside the grid, each as points to join. A parabola is one piece, or two when it turns outside; a hyperbola
 * is drawn on each side of its asymptote, never across it. A parabola alone (P176) is taken as one too.
 */
export function sketchCurve(plot: PlotSpec, given: Curve | Parabola, steps = 160): Point[][] {
  const c: Curve = 'kind' in given ? given : { kind: 'parabola', f: given }
  const at = (x: number) => curveAt(c, x)
  const inside = (y: number) => Number.isFinite(y) && y >= plot.yMin - 1e-9 && y <= plot.yMax + 1e-9
  // Where the curve crosses the top or the bottom of the grid between x0 (inside) and x1 (outside), or the other way round.
  const edge = (x0: number, x1: number): Point => {
    const y1 = at(x1)
    const level = y1 > plot.yMax ? plot.yMax : plot.yMin
    let lo = x0
    let hi = x1
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (inside(at(mid)) === inside(at(lo))) lo = mid
      else hi = mid
    }
    return { x: (lo + hi) / 2, y: level }
  }
  // The stretches of x to draw: the whole grid, or each side of a hyperbola's asymptote.
  const gap = (plot.xMax - plot.xMin) / steps / 4
  const spans: [number, number][] =
    c.kind === 'hyperbola' && c.f.p > plot.xMin && c.f.p < plot.xMax
      ? [
          [plot.xMin, c.f.p - gap],
          [c.f.p + gap, plot.xMax],
        ]
      : [[plot.xMin, plot.xMax]]
  const out: Point[][] = []
  for (const [from, to] of spans) {
    let piece: Point[] = []
    let prevX = from
    for (let k = 0; k <= steps; k++) {
      const x = from + ((to - from) * k) / steps
      const y = at(x)
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
  }
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
