import type { Graph } from '@jemma/profiling/schemas'
import { fmt } from './shared'

/**
 * The arithmetic behind a coordinate plane, as pure functions: no React, no browser.
 *
 * The model gives each graph by its constants. Code samples it here, breaks the curve where it is undefined (the asymptote of a hyperbola,
 * tan) and where it leaves the frame, and never hands back a point outside the frame. A line is clipped exactly (two points).
 */

export type Frame = { xMin: number; xMax: number; yMin: number; yMax: number }
export type Pt = { x: number; y: number }

const RAD = Math.PI / 180
/** Samples across the frame for a curve. Each end of a piece that meets the frame's edge is found exactly, by halving. */
const SAMPLES = 240
const HALVINGS = 48
/** A tan whose cosine is this small is taken as undefined (the asymptote), not as a number of 1e16. */
const TAN_GAP = 1e-9
/** A step the model gave is used on an axis when it puts between 2 and this many numbers on it (a step of 90 for the x axis of a sine is no use to the y axis). */
const MIN_GIVEN_NUMBERS = 2
const MAX_GIVEN_NUMBERS = 40
const MAX_NUMBERS = 10

const q = (g: { q?: number }) => g.q ?? 0
const p = (g: { p?: number }) => g.p ?? 0

/** y at x, or NaN where the graph has no value. For `trig`, x is in degrees. */
export function graphValue(g: Graph, x: number): number {
  switch (g.type) {
    case 'line':
      return g.m * x + g.c
    case 'parabola':
      return g.a * (x - p(g)) ** 2 + q(g)
    case 'hyperbola': {
      const d = x - p(g)
      return d === 0 ? Number.NaN : g.a / d + q(g)
    }
    case 'exponential':
      return g.a * g.b ** (x - p(g)) + q(g)
    case 'trig': {
      const t = (g.b ?? 1) * x * RAD
      if (g.fn === 'sin') return (g.a ?? 1) * Math.sin(t) + q(g)
      if (g.fn === 'cos') return (g.a ?? 1) * Math.cos(t) + q(g)
      return Math.abs(Math.cos(t)) < TAN_GAP ? Number.NaN : (g.a ?? 1) * Math.tan(t) + q(g)
    }
  }
}

/** Is there an asymptote between x0 and x1 (the curve goes off to infinity there and comes back on the other side)? */
function breaksBetween(g: Graph, x0: number, x1: number): boolean {
  if (g.type === 'hyperbola') return (x0 - p(g)) * (x1 - p(g)) <= 0
  if (g.type === 'trig' && g.fn === 'tan') {
    const b = g.b ?? 1
    return Math.floor((b * x0 + 90) / 180) !== Math.floor((b * x1 + 90) / 180)
  }
  return false
}

const numbersOf = (g: Graph) => Object.values(g).filter((v): v is number => typeof v === 'number')

/** The two ends of the stretch of a line that is inside the frame, or none. */
function clipLine(g: Extract<Graph, { type: 'line' }>, f: Frame): Pt[][] {
  const at = (x: number): Pt => ({ x, y: Math.min(f.yMax, Math.max(f.yMin, g.m * x + g.c)) })
  if (g.m === 0) return g.c >= f.yMin && g.c <= f.yMax ? [[at(f.xMin), at(f.xMax)]] : []
  const a = (f.yMin - g.c) / g.m
  const b = (f.yMax - g.c) / g.m
  const lo = Math.max(f.xMin, Math.min(a, b))
  const hi = Math.min(f.xMax, Math.max(a, b))
  return lo < hi ? [[at(lo), at(hi)]] : []
}

/**
 * The graph as pieces of a curve, each a list of points in the frame's own numbers. A piece ends where the curve is undefined, jumps over an
 * asymptote, or meets the edge of the frame (at the edge itself). Nothing is outside the frame. Never throws: a graph with a constant that is
 * not a number, or a frame with no size, is nothing.
 */
export function sampleGraph(g: Graph, f: Frame): Pt[][] {
  if (!(f.xMin < f.xMax) || !(f.yMin < f.yMax) || ![f.xMin, f.xMax, f.yMin, f.yMax].every(Number.isFinite)) return []
  if (!numbersOf(g).every(Number.isFinite)) return []
  if (g.type === 'line') return clipLine(g, f)

  const within = (y: number) => y >= f.yMin && y <= f.yMax
  const at = (x: number) => graphValue(g, x)
  /** The x, between an inside sample and an outside one, where the curve meets the edge of the frame: the last point that is inside. */
  const edge = (inX: number, outX: number): Pt => {
    let lo = inX
    let hi = outX
    for (let i = 0; i < HALVINGS; i++) {
      const mid = (lo + hi) / 2
      if (within(at(mid))) lo = mid
      else hi = mid
    }
    return { x: lo, y: at(lo) }
  }
  /** The x, between a sample below the frame and one above it (or the other way round), where the curve is at `target`. */
  const meet = (x0: number, x1: number, target: number): Pt => {
    const rising = at(x0) < target
    let lo = x0
    let hi = x1
    for (let i = 0; i < HALVINGS; i++) {
      const mid = (lo + hi) / 2
      if (at(mid) < target === rising) lo = mid
      else hi = mid
    }
    return { x: lo, y: Math.min(f.yMax, Math.max(f.yMin, at(lo))) }
  }

  const pieces: Pt[][] = []
  let cur: Pt[] = []
  const flush = () => {
    if (cur.length >= 2) pieces.push(cur)
    cur = []
  }
  let prev: (Pt & { in: boolean }) | null = null
  for (let i = 0; i <= SAMPLES; i++) {
    const x = i === SAMPLES ? f.xMax : f.xMin + ((f.xMax - f.xMin) * i) / SAMPLES
    const y = at(x)
    if (!Number.isFinite(y)) {
      flush()
      prev = null
      continue
    }
    const here = { x, y, in: within(y) }
    if (prev && breaksBetween(g, prev.x, x)) {
      flush()
      prev = null
    }
    if (prev) {
      if (prev.in && here.in) cur.push({ x, y })
      else if (prev.in) {
        cur.push(edge(prev.x, x))
        flush()
      } else if (here.in) {
        cur = [edge(x, prev.x), { x, y }]
      } else if ((prev.y < f.yMin && y > f.yMax) || (prev.y > f.yMax && y < f.yMin)) {
        // From one side of the frame to the other between two samples: the stretch inside is narrower than the gap.
        const a = meet(prev.x, x, f.yMin)
        const b = meet(prev.x, x, f.yMax)
        pieces.push(a.x <= b.x ? [a, b] : [b, a])
      }
    } else if (here.in) {
      cur = [{ x, y }]
    }
    prev = here
  }
  flush()
  return pieces.filter((piece) => piece.every((pt) => pt.x >= f.xMin && pt.x <= f.xMax && within(pt.y)))
}

const clean = (v: number) => (Math.round(v * 1e9) / 1e9 === 0 ? 0 : Math.round(v * 1e9) / 1e9)

/** The multiples of `step` inside [min, max], with no rounding noise (0.1 + 0.2 never shows up as 0.30000000000000004). */
export function ticksOf(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !(min < max)) return []
  const out: number[] = []
  for (let k = Math.ceil(min / step - 1e-9); k <= Math.floor(max / step + 1e-9) && out.length < 1000; k++) out.push(clean(k * step))
  return out
}

const numbersOnAxis = (min: number, max: number, step: number) => ticksOf(min, max, step).filter((v) => v !== 0).length

/**
 * Where the numbers go on an axis. The step the model gave is used when it is above 0 and suits the axis (not a wall of numbers, not hardly any: one step
 * is given for both axes); otherwise the smallest of 1, 2, 5, 10, 20, 50 ... that puts at most ten numbers (not counting 0) on the axis.
 */
export function defaultStep(min: number, max: number, given?: number): number {
  if (given !== undefined && given > 0) {
    const n = numbersOnAxis(min, max, given)
    if (n >= MIN_GIVEN_NUMBERS && n <= MAX_GIVEN_NUMBERS) return given
  }
  const range = max - min
  if (!(range > 0) || !Number.isFinite(range)) return 1
  let scale = 10 ** Math.floor(Math.log10(range / MAX_NUMBERS) - 1)
  for (let guard = 0; guard < 40; guard++, scale *= 10) {
    for (const m of [1, 2, 5]) {
      const step = clean(m * scale)
      if (step > 0 && numbersOnAxis(min, max, step) <= MAX_NUMBERS) return step
    }
  }
  return range
}

const coefficient = (a: number) => (a === 1 ? '' : a === -1 ? '-' : fmt(a))
const plus = (v: number) => (v === 0 ? '' : v < 0 ? ` - ${fmt(-v)}` : ` + ${fmt(v)}`)
const shifted = (offset: number) => (offset === 0 ? 'x' : `(x ${offset < 0 ? '+' : '-'} ${fmt(Math.abs(offset))})`)

/** The graph as a line of algebra, for the spoken description of a picture on a card (never for a question: it can be the answer). */
export function graphEquation(g: Graph): string {
  switch (g.type) {
    case 'line':
      return g.m === 0 ? `y = ${fmt(g.c)}` : `y = ${coefficient(g.m)}x${plus(g.c)}`
    case 'parabola':
      return `y = ${coefficient(g.a)}${shifted(p(g))}^2${plus(q(g))}`
    case 'hyperbola':
      return `y = ${fmt(g.a)}/${shifted(p(g))}${plus(q(g))}`
    case 'exponential': {
      const power = `${fmt(g.b)}^${shifted(p(g))}`
      return `y = ${g.a === 1 ? power : g.a === -1 ? `-${power}` : `${fmt(g.a)} × ${power}`}${plus(q(g))}`
    }
    case 'trig': {
      const b = g.b ?? 1
      return `y = ${coefficient(g.a ?? 1)}${g.fn} ${b === 1 ? '' : b === -1 ? '-' : fmt(b)}x${plus(q(g))}`
    }
  }
}
