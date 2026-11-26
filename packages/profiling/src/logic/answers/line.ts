import type { LineSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P174: a straight line drawn on a grid, from the "Draw on the picture" board (on the v1 Line tool): the learner taps two points the line goes through. The key
 * is two points on the line (`0; -1; 2; 3`), and an answer is right when its two points are on the same line, whichever two they are. Pure.
 */

export const LINE_MAX_SPAN = 20

type Point = { x: number; y: number }
const whole = (v: number) => Number.isInteger(v)

/** Why a grid to draw a line on cannot be used, or null. */
export function lineProblem(g: LineSpec): string | null {
  if (![g.xMin, g.xMax, g.yMin, g.yMax].every(whole)) return 'a grid to draw a line on goes in whole steps'
  if (!(g.xMin < g.xMax && g.yMin < g.yMax)) return 'a grid has xMin below xMax and yMin below yMax'
  if (g.xMax - g.xMin > LINE_MAX_SPAN || g.yMax - g.yMin > LINE_MAX_SPAN) return `a grid to draw a line on is at most ${LINE_MAX_SPAN} squares across and up`
  return null
}

/** The two points of a key or an answer, or null when they are not four numbers making two different points. */
export function linePoints(text: string, read: (t: string) => number | null): [Point, Point] | null {
  const v = splitValues(text).map((t) => read(t))
  if (v.length !== 4 || !v.every((n): n is number => n !== null && Number.isFinite(n))) return null
  const a = { x: v[0]!, y: v[1]! }
  const b = { x: v[2]!, y: v[3]! }
  return a.x === b.x && a.y === b.y ? null : [a, b]
}

/** Why the key of a line to draw is not two different corners of the grid, or null. */
export function lineKeyProblem(q: { answer: string; answerKind: string; line: LineSpec }, read: (t: string) => number | null): string | null {
  if (q.answerKind !== 'list') return 'a line to draw has a list answer: two points on it, x and y each'
  const pts = linePoints(q.answer, read)
  if (!pts) return 'the answer is two different points on the line: x1; y1; x2; y2'
  const on = (p: Point) => whole(p.x) && whole(p.y) && p.x >= q.line.xMin && p.x <= q.line.xMax && p.y >= q.line.yMin && p.y <= q.line.yMax
  return pts.every(on) ? null : 'each point of the answer is on a corner of the grid'
}

/** True when the two points of the answer are on the line through the two points of the key. */
export function sameLine(key: [Point, Point], answer: [Point, Point]): boolean {
  const [p, q] = key
  const cross = (r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  return answer.every((r) => Math.abs(cross(r)) < 1e-9)
}

/** Marks a drawn (or typed) line: right when its two points are on the key's line. `comparable` is false when the answer is not two points. */
export function markLine(key: string, answer: string, read: (t: string) => number | null): { correct: boolean; comparable: boolean } {
  const k = linePoints(key, read)
  const a = linePoints(answer, read)
  if (!k || !a) return { correct: false, comparable: false }
  return { correct: sameLine(k, a), comparable: true }
}

/** A question with a line as it is saved: its list is ordered, with a name over each box for a learner who types two points instead. */
export function tidyLine<Q extends { answerKind: string; line?: LineSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.line || q.answerKind !== 'list') return q
  return { ...q, ordered: true, labels: ['First x', 'First y', 'Second x', 'Second y'] }
}

/** The answer two tapped points make (`x1; y1; x2; y2`), or '' while there are not two different points. */
export const lineAnswer = (a: Point | null, b: Point | null): string => (a && b && (a.x !== b.x || a.y !== b.y) ? `${a.x}; ${a.y}; ${b.x}; ${b.y}` : '')

/** Where the line through a and b crosses the edge of the grid: the two ends of the line drawn across it, or null when a and b are one point. */
export function lineEnds(g: LineSpec, a: Point, b: Point): [Point, Point] | null {
  if (a.x === b.x && a.y === b.y) return null
  if (a.x === b.x) return [{ x: a.x, y: g.yMin }, { x: a.x, y: g.yMax }]
  const m = (b.y - a.y) / (b.x - a.x)
  const yAt = (x: number) => a.y + m * (x - a.x)
  const xAt = (y: number) => a.x + (y - a.y) / m
  const out: Point[] = []
  for (const x of [g.xMin, g.xMax]) {
    const y = yAt(x)
    if (y >= g.yMin - 1e-9 && y <= g.yMax + 1e-9) out.push({ x, y })
  }
  if (m !== 0)
    for (const y of [g.yMin, g.yMax]) {
      const x = xAt(y)
      if (x > g.xMin + 1e-9 && x < g.xMax - 1e-9) out.push({ x, y })
    }
  return out.length >= 2 ? [out[0]!, out[1]!] : null
}
