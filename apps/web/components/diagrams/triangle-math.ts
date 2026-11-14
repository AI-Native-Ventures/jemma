import type { TriangleSpec } from '@jemma/profiling/schemas'

/**
 * The shape of a triangle, as pure functions: no React, no browser.
 *
 * Drawn from the angles when they are given and add up to 180 (within half a degree), else from equal sides; a right angle with no angles
 * given is a right-angled triangle. Always scaled to fit its box. The corner with the right angle (or, with none, the second corner) is at
 * the bottom left, the next corner is at the bottom right and the last one is the top.
 */

export type Pt = { x: number; y: number }
export type Box = { x0: number; y0: number; x1: number; y1: number }
export type Placed = { at: Pt; anchor: 'start' | 'middle' | 'end' }
export type TriangleLayout = {
  /** The corners, in the order of `vertices`, in the drawing's own numbers (y goes down). */
  points: [Pt, Pt, Pt]
  /** Where the name of each corner goes (the centre of the text), outside the corner. */
  names: [Pt, Pt, Pt]
  /** Where the label of each side goes: side i runs from corner i to corner i + 1, so side 2 is the one from the third corner back to the first. */
  sides: [Placed, Placed, Placed]
  /** Where the label of each angle goes, inside its corner. */
  angles: [Placed, Placed, Placed]
  /** A small arc in each corner that has no right angle. */
  arcs: [string | null, string | null, string | null]
  /** The small square at the right angle. */
  right: { at: number; path: string } | null
}

const RAD = Math.PI / 180
const TOLERANCE = 0.5
const EQUAL: [number, number, number] = [60, 60, 60]
/** The look of a right-angled triangle drawn from the right angle alone: legs of 4 and 3 (the angles of a 3-4-5 triangle). */
const OTHER_ANGLES: [number, number] = [Math.atan(3 / 4) / RAD, 90 - Math.atan(3 / 4) / RAD]

const NAME_GAP = 17
const SIDE_GAP = 14
const SQUARE = 11
const ARC = 15

/** The three angles the shape is drawn from, adding up to exactly 180. */
export function triangleAngles(spec: Pick<TriangleSpec, 'angles' | 'rightAngleAt'>): [number, number, number] {
  const a = spec.angles
  if (a && a.length === 3 && a.every((v) => Number.isFinite(v) && v > 0)) {
    const total = a[0]! + a[1]! + a[2]!
    if (Math.abs(total - 180) <= TOLERANCE) return [(a[0]! * 180) / total, (a[1]! * 180) / total, (a[2]! * 180) / total]
  }
  const right = spec.rightAngleAt
  if (right !== undefined) {
    const out: [number, number, number] = [0, 0, 0]
    out[right] = 90
    out[(right + 1) % 3] = OTHER_ANGLES[0]
    out[(right + 2) % 3] = OTHER_ANGLES[1]
    return out
  }
  return [...EQUAL]
}

const unit = (from: Pt, to: Pt): Pt => {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d }
}
const add = (p: Pt, v: Pt, k: number): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k })
const r2 = (n: number) => Math.round(n * 100) / 100

/** The corner of the right angle among the angles, if one is 90 (within half a degree). */
export const rightCorner = (angles: readonly number[]): number | null => {
  const i = angles.findIndex((v) => Math.abs(v - 90) <= TOLERANCE)
  return i < 0 ? null : i
}

/** Lays the triangle out in `box`. `rightAt` is the corner with the right angle, or null. */
export function layoutTriangle(angles: readonly [number, number, number], box: Box, rightAt: number | null): TriangleLayout {
  // Corner `bl` at the bottom left, `br` at the bottom right, `ap` at the top. The base is opposite the top corner, so by the law of sines
  // its length is sin(angle at ap), and the side from bl up to the top is sin(angle at br).
  const bl = rightAt ?? 1
  const br = (bl + 1) % 3
  const ap = (bl + 2) % 3
  const raw: Pt[] = []
  raw[bl] = { x: 0, y: 0 }
  raw[br] = { x: Math.sin(angles[ap]! * RAD), y: 0 }
  raw[ap] = { x: Math.sin(angles[br]! * RAD) * Math.cos(angles[bl]! * RAD), y: Math.sin(angles[br]! * RAD) * Math.sin(angles[bl]! * RAD) }

  const xs = raw.map((p) => p.x)
  const ys = raw.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY
  const boxW = box.x1 - box.x0
  const boxH = box.y1 - box.y0
  const scale = Math.min(boxW / w, boxH / h)
  const left = box.x0 + (boxW - w * scale) / 2
  const top = box.y0 + (boxH - h * scale) / 2
  // y goes down on the screen: flip it.
  const points = raw.map((p) => ({ x: left + (p.x - minX) * scale, y: top + (h - (p.y - minY)) * scale })) as [Pt, Pt, Pt]

  const c = { x: (points[0].x + points[1].x + points[2].x) / 3, y: (points[0].y + points[1].y + points[2].y) / 3 }
  const names = points.map((p) => add(p, unit(c, p), NAME_GAP)) as [Pt, Pt, Pt]

  const sides = [0, 1, 2].map((i): Placed => {
    const a = points[i]!
    const b = points[(i + 1) % 3]!
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const along = unit(a, b)
    let n: Pt = { x: -along.y, y: along.x }
    if ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y < 0) n = { x: -n.x, y: -n.y }
    return { at: add(mid, n, SIDE_GAP), anchor: n.x > 0.35 ? 'start' : n.x < -0.35 ? 'end' : 'middle' }
  }) as [Placed, Placed, Placed]

  const inside = [0, 1, 2].map((i) => {
    const v = points[i]!
    const u1 = unit(v, points[(i + 1) % 3]!)
    const u2 = unit(v, points[(i + 2) % 3]!)
    const b = Math.hypot(points[(i + 1) % 3]!.x - v.x, points[(i + 1) % 3]!.y - v.y)
    const c2 = Math.hypot(points[(i + 2) % 3]!.x - v.x, points[(i + 2) % 3]!.y - v.y)
    // The bisector of the angle runs from the corner to the opposite edge for this long; the label stays well inside it.
    const reach = (2 * b * c2 * Math.cos((angles[i]! * RAD) / 2)) / (b + c2 || 1)
    const bis = unit({ x: 0, y: 0 }, { x: u1.x + u2.x, y: u1.y + u2.y })
    // far enough from the corner for the text to sit in a narrow angle, but never beyond 60% of the way across
    const distance = Math.min(reach * 0.6, Math.max(22, 17 / Math.max(0.05, Math.sin((angles[i]! * RAD) / 2))))
    return { u1, u2, bis, distance }
  })
  const angleLabels = inside.map((s, i): Placed => ({ at: add(points[i]!, s.bis, s.distance), anchor: 'middle' })) as [Placed, Placed, Placed]

  const arcs = inside.map((s, i) => {
    if (i === rightAt) return null
    const v = points[i]!
    const a = add(v, s.u1, ARC)
    const b = add(v, s.u2, ARC)
    const sweep = s.u1.x * s.u2.y - s.u1.y * s.u2.x > 0 ? 1 : 0
    return `M${r2(a.x)} ${r2(a.y)} A${ARC} ${ARC} 0 0 ${sweep} ${r2(b.x)} ${r2(b.y)}`
  }) as [string | null, string | null, string | null]

  let right: TriangleLayout['right'] = null
  if (rightAt !== null) {
    const s = inside[rightAt]!
    const v = points[rightAt]!
    const a = add(v, s.u1, SQUARE)
    const m = add(a, s.u2, SQUARE)
    const b = add(v, s.u2, SQUARE)
    right = { at: rightAt, path: `M${r2(a.x)} ${r2(a.y)} L${r2(m.x)} ${r2(m.y)} L${r2(b.x)} ${r2(b.y)}` }
  }

  return { points, names, sides, angles: angleLabels, arcs, right }
}
