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
  const names = [...p.place, ...given.map((q) => q.label)].map((l) => l.trim())
  if (names.some((l) => !l || l.length > PLOT_LABEL_MAX)) return `each point has a name of 1 to ${PLOT_LABEL_MAX} characters`
  if (p.shape && given.length < 3) return 'a shape has 3 or more given points'
  return null
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

/** A question with a grid as it is saved: its list is ordered, with a name over each box (`A' x`, `A' y`) for a learner who types the coordinates instead. */
export function tidyPlot<Q extends { answerKind: string; plot?: PlotSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.plot || q.answerKind !== 'list') return q
  return { ...q, ordered: true, labels: q.plot.place.flatMap((l) => [`${l.trim()} x`, `${l.trim()} y`]) }
}

/** The answer the placed points make, as one text (the x and the y of each, in order), or '' while a point is not placed. */
export const plotAnswer = (points: (Point | null)[]): string =>
  points.length > 0 && points.every((p) => p !== null) ? points.map((p) => `${p!.x}; ${p!.y}`).join('; ') : ''
