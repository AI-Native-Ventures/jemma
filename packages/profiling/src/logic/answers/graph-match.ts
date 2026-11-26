import type { Graph, SeniorDiagramSpec } from '../../schemas/diagram'
import type { GraphMatchSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P184: graphs matched to their equations, from the "Match pairs" board ("later graphs and their equations"): small graphs on the left, equations on the right,
 * joined by tapping one, then the other. The key is an ordered list of the place in `equations` of the equation of each graph, from 1 (`2; 3; 1`), so the list
 * marking marks each pair. The key is checked against the graphs when the lesson is saved. Pure.
 */

export const GRAPH_MATCH_MIN = 2
export const GRAPH_MATCH_MAX = 4
export const GRAPH_EQUATION_MAX = 30

const RAD = Math.PI / 180

/** The y of a graph at x (in degrees for a trig graph), or not a number where it has none. The same sums the coordinate plane draws with. */
export function graphY(g: Graph, x: number): number {
  const q = 'q' in g ? (g.q ?? 0) : 0
  const p = 'p' in g ? (g.p ?? 0) : 0
  switch (g.type) {
    case 'line':
      return g.m * x + g.c
    case 'parabola':
      return g.a * (x - p) ** 2 + q
    case 'hyperbola':
      return x - p === 0 ? NaN : g.a / (x - p) + q
    case 'exponential':
      return g.a * g.b ** (x - p) + q
    case 'trig': {
      const t = (g.b ?? 1) * x * RAD
      if (g.fn === 'sin') return (g.a ?? 1) * Math.sin(t) + q
      if (g.fn === 'cos') return (g.a ?? 1) * Math.cos(t) + q
      return Math.abs(Math.cos(t)) < 1e-6 ? NaN : (g.a ?? 1) * Math.tan(t) + q
    }
    // P195: a cubic and a log graph.
    case 'cubic':
      return g.a * x ** 3 + (g.b ?? 0) * x ** 2 + (g.c ?? 0) * x + (g.d ?? 0)
    case 'log':
      return x - p <= 0 ? NaN : (g.a ?? 1) * (Math.log(x - p) / Math.log(g.base)) + q
  }
}

/** The small plane one graph of a match is drawn on. */
export const graphPlane = (m: GraphMatchSpec, i: number): SeniorDiagramSpec => ({
  kind: 'coordinate_plane',
  xMin: m.xMin,
  xMax: m.xMax,
  yMin: m.yMin,
  yMax: m.yMax,
  graphs: [m.graphs[i]!],
  // P198: marked in π.
  ...(m.radians ? { radians: true } : {}),
})

/** Why graphs to match cannot be shown, or null. `planeProblem` checks each small plane as a picture of a question is checked. */
export function graphMatchProblem(m: GraphMatchSpec, planeProblem: (spec: SeniorDiagramSpec) => string | null): string | null {
  if (m.graphs.length < GRAPH_MATCH_MIN || m.graphs.length > GRAPH_MATCH_MAX) return `there are ${GRAPH_MATCH_MIN} to ${GRAPH_MATCH_MAX} graphs`
  if (m.equations.length !== m.graphs.length) return 'there are as many equations as graphs'
  if (m.equations.some((e) => !e.trim() || e.trim().length > GRAPH_EQUATION_MAX)) return `each equation is 1 to ${GRAPH_EQUATION_MAX} characters`
  if (new Set(m.equations.map((e) => e.replace(/\s+/g, '').toLowerCase())).size !== m.equations.length) return 'each equation is there once'
  const trig = m.graphs.map((g) => g.type === 'trig')
  if (trig.some((t) => t !== trig[0])) return 'the graphs are all trig graphs or none of them, as they share one window'
  for (let i = 0; i < m.graphs.length; i++) {
    const problem = planeProblem(graphPlane(m, i))
    if (problem) return `graph ${i + 1}: ${problem}`
  }
  return null
}

/** The equation of each graph in a key or an answer (1 is the first equation), or null when one is not a place in the equations. */
export function graphMatchOf(answer: string, m: GraphMatchSpec): number[] | null {
  const values = splitValues(answer).map((t) => (/^\d+$/.test(t) ? Number(t) : NaN))
  return values.every((v) => Number.isInteger(v) && v >= 1 && v <= m.equations.length) ? values : null
}

/**
 * Why the key of graphs to match is not the equation of each graph, or null: one equation each, mixed up, and each equation (read by `graphOf`, in degrees for
 * trig graphs) is its graph at points across the window, and no other graph.
 */
export function graphMatchKeyProblem(
  q: { answer: string; answerKind: string; graphMatch: GraphMatchSpec },
  graphOf: (text: string) => ((x: number) => number) | null,
  degreeGraphOf: (text: string) => ((degrees: number) => number) | null,
  radianGraphOf: (text: string) => ((degrees: number) => number) | null = degreeGraphOf,
): string | null {
  const m = q.graphMatch
  if (q.answerKind !== 'list') return 'graphs matched to equations have a list answer: the place of the equation of each graph, from 1'
  const values = graphMatchOf(q.answer, m)
  if (!values) return `each value of the answer is the place of an equation, from 1 to ${m.equations.length}`
  if (values.length !== m.graphs.length) return `the answer has ${values.length} equations for ${m.graphs.length} graphs`
  if (new Set(values).size !== values.length) return 'each equation is the equation of one graph'
  if (values.every((v, i) => v === i + 1)) return 'mix up the equations: not every equation is straight across from its graph'
  const trig = m.graphs[0]!.type === 'trig'
  // P198: the equations of graphs marked in π are read in radians.
  const fns = m.equations.map((e) => (trig ? (m.radians ? radianGraphOf : degreeGraphOf)(e) : graphOf(e)))
  const bad = fns.findIndex((f) => f === null)
  if (bad >= 0) return `equation ${bad + 1} cannot be read: write it as y = ..., like y = x^2 - 4`
  const xs = Array.from({ length: 13 }, (_, k) => m.xMin + ((m.xMax - m.xMin) * (k + 0.5)) / 13)
  const fits = (g: Graph, f: (x: number) => number) => {
    let seen = 0
    for (const x of xs) {
      const a = graphY(g, x)
      const b = f(x)
      if (!Number.isFinite(a) && !Number.isFinite(b)) continue
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) return false
      seen++
    }
    return seen >= 5
  }
  for (let i = 0; i < m.graphs.length; i++) {
    if (!fits(m.graphs[i]!, fns[values[i]! - 1]!)) return `equation ${values[i]} is not the equation of graph ${i + 1}`
    const other = fns.findIndex((f, j) => j !== values[i]! - 1 && fits(m.graphs[i]!, f!))
    if (other >= 0) return `equation ${other + 1} is graph ${i + 1} too: each equation fits one graph`
  }
  return null
}

/** A question of graphs to match as it is saved: its list is ordered, with "Graph 1" and so on over its boxes. */
export function tidyGraphMatch<Q extends { answerKind: string; graphMatch?: GraphMatchSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.graphMatch || q.answerKind !== 'list') return q
  return { ...q, ordered: true, labels: q.graphMatch.graphs.map((_, i) => `Graph ${i + 1}`) }
}

/** An equation as it is shown: a one-letter or one-digit power raised (x² for x^2, 2ˣ for 2^x), a true minus sign, a dot for times. */
export const prettyEquation = (e: string): string =>
  e
    .trim()
    .replace(/\^([0-9])/g, (_, d: string) => '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'[Number(d)]!)
    .replace(/\^x/g, '\u02e3')
    .replace(/\*/g, '\u00b7')
    .replace(/-/g, '\u2212')
