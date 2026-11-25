import type { DataGraphSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P167: a graph the learner draws, from the "Draw a graph of data" board: a bar graph whose empty bars the learner drags up, or a picture graph whose empty rows
 * the learner fills with pictures (each picture stands for `per`). The bars with `value: null` are the answer, in order. The answer is marked as it always was:
 * one bar is a `whole` answer (`6`), more are an ordered `list` (`6; 3`), so a learner who types the numbers instead is marked the same way.
 *
 * These rules keep a graph small enough for a phone and a young learner, and make every key one the learner can draw: a bar stops on a line of the scale, and a
 * row is whole pictures. Pure: no database, no model, no browser.
 */

export const GRAPH_MIN_BARS = 2
export const GRAPH_MAX_BARS = 8
/** The most lines on the scale of a bar graph (`yMax / step`), and the most pictures in a row. */
export const GRAPH_MAX_LINES = 20
export const GRAPH_MAX_PICTURES = 8
/** The longest name of a bar ("Mon", "Dogs", "Grade 4"): it is written under the bar. */
export const GRAPH_LABEL_MAX = 12

/** The reader of one value: a number, or null when the text is not one. */
type Reader = (text: string) => number | null

/** What one line of the scale (a bar graph) or one picture (a picture graph) is worth. */
export const graphUnit = (g: DataGraphSpec): number => (g.kind === 'pictures' ? (g.per ?? 1) : (g.step ?? 1))

/** The places in `bars` of the bars the learner draws (value `null`), left to right. */
export const blankBars = (g: DataGraphSpec): number[] => g.bars.flatMap((b, i) => (b.value === null ? [i] : []))

/** The names of the bars the learner draws, in order: the labels over the boxes when the numbers are typed instead. */
export const blankLabels = (g: DataGraphSpec): string[] => blankBars(g).map((i) => g.bars[i]!.label.trim())

/** The top of the scale of a bar graph; the most a row of a picture graph can hold. */
export const graphTop = (g: DataGraphSpec): number => (g.kind === 'pictures' ? GRAPH_MAX_PICTURES * graphUnit(g) : (g.yMax ?? 0))

/** True when `v` is a value a bar or a row can show: a whole number of lines or pictures, from 0 to the top. */
const drawable = (g: DataGraphSpec, v: number): boolean => Number.isInteger(v) && v >= 0 && v <= graphTop(g) && v % graphUnit(g) === 0

/** Why a graph cannot be drawn, or null. The save gate asks it of every question that has one. */
export function graphProblem(g: DataGraphSpec): string | null {
  const n = g.bars.length
  if (n < GRAPH_MIN_BARS || n > GRAPH_MAX_BARS) return `a graph has ${GRAPH_MIN_BARS} to ${GRAPH_MAX_BARS} bars`
  if (g.bars.some((b) => !b.label.trim() || b.label.trim().length > GRAPH_LABEL_MAX)) return `each bar has a name of 1 to ${GRAPH_LABEL_MAX} characters`
  if (blankBars(g).length === 0) return 'a graph to draw has at least one bar with the value null'
  const unit = graphUnit(g)
  if (!(Number.isInteger(unit) && unit >= 1)) return g.kind === 'pictures' ? 'per is a whole number, 1 or more' : 'step is a whole number, 1 or more'
  if (g.kind === 'bars') {
    const top = g.yMax
    if (top === undefined || !Number.isInteger(top) || top <= 0) return 'a bar graph has a yMax, a whole number above 0'
    if (top % unit !== 0) return 'yMax is a whole number of steps'
    if (top / unit > GRAPH_MAX_LINES) return `a bar graph has at most ${GRAPH_MAX_LINES} lines on its scale`
    if (g.bars.some((b) => b.value !== null && !drawable(g, b.value))) return 'each given bar stands on a line of the scale, from 0 to yMax'
    return null
  }
  if (g.bars.some((b) => b.value !== null && !drawable(g, b.value))) return `each given row is a whole number of pictures, at most ${GRAPH_MAX_PICTURES}`
  return null
}

/** The values of a key (or of a typed answer) of a graph question, or null when one of them does not read. */
export function graphValues(answer: string, read: Reader): number[] | null {
  const values = splitValues(answer).map((t) => read(t))
  return values.every((v): v is number => v !== null && Number.isFinite(v)) ? values : null
}

/** Why the key of a graph question cannot be drawn on its graph, or null: one value for each empty bar, each one the bar can show (and more than 0). */
export function graphKeyProblem(q: { answer: string; answerKind: string; graph: DataGraphSpec }, read: Reader): string | null {
  const blanks = blankBars(q.graph).length
  if (blanks === 1 && q.answerKind !== 'whole') return 'a graph with one bar to draw has a whole answer'
  if (blanks > 1 && q.answerKind !== 'list') return 'a graph with more than one bar to draw has a list answer'
  const values = graphValues(q.answer, read)
  if (!values) return 'each value of the answer is a number'
  if (values.length !== blanks) return `the answer has ${values.length} values for ${blanks} bars to draw`
  if (values.some((v) => v <= 0 || !drawable(q.graph, v))) {
    return q.graph.kind === 'pictures'
      ? `each value of the answer is 1 to ${GRAPH_MAX_PICTURES} whole pictures`
      : 'each value of the answer is on a line of the scale, above 0 and at most yMax'
  }
  return null
}

/**
 * A question with a graph as it is saved: an answer of several bars is an ordered list, with the name of each bar over its box (for a learner who types the
 * numbers instead, and for the results). Any other question is as it was.
 */
export function tidyGraph<Q extends { answerKind: string; graph?: DataGraphSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.graph || q.answerKind !== 'list') return q
  return { ...q, ordered: true, labels: blankLabels(q.graph) }
}

/** The values the learner drew, in the order of the empty bars, as the one text the answer is sent as (`6` or `6; 3`), or '' while a bar is still empty. */
export const graphAnswer = (values: (number | null)[]): string =>
  values.length > 0 && values.every((v) => v !== null) ? values.map((v) => String(v)).join('; ') : ''

/** The value a bar or a row shows for a raw value (where a finger is on the scale), held to the scale: 0 to the top, on a line. */
export function snapGraphValue(g: DataGraphSpec, raw: number): number {
  const unit = graphUnit(g)
  const top = graphTop(g)
  const lines = Math.round(raw / unit)
  return Math.max(0, Math.min(top, lines * unit))
}
