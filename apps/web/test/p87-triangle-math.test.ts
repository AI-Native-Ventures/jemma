import { describe, expect, test } from 'vitest'
import { layoutTriangle, triangleAngles, type TriangleLayout } from '@/components/diagrams/triangle-math'

// P87, decision 1: the shape of a triangle, as a pure function. Drawn from the angles when they are given (they must add up to 180), else from
// equal sides; always scaled to fit its box; names outside the corners, angle labels inside, a small square at a right angle.

const BOX = { x0: 60, y0: 40, x1: 260, y1: 210 }
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const angleAt = (l: TriangleLayout, i: number) => {
  const v = l.points[i]!
  const a = l.points[(i + 1) % 3]!
  const b = l.points[(i + 2) % 3]!
  const cos = ((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (dist(v, a) * dist(v, b))
  return (Math.acos(cos) * 180) / Math.PI
}
const centroid = (l: TriangleLayout) => ({ x: sum(l.points.map((p) => p.x)) / 3, y: sum(l.points.map((p) => p.y)) / 3 })
/** Is the point inside the triangle (same side of all three edges)? */
const within = (l: TriangleLayout, pt: { x: number; y: number }) => {
  const side = (a: { x: number; y: number }, b: { x: number; y: number }) => (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x)
  const s = [side(l.points[0]!, l.points[1]!), side(l.points[1]!, l.points[2]!), side(l.points[2]!, l.points[0]!)]
  return s.every((v) => v > 0) || s.every((v) => v < 0)
}

describe('triangleAngles: the angles the shape is drawn from', () => {
  test('angles that add up to 180 are used', () => expect(triangleAngles({ angles: [90, 60, 30] })).toEqual([90, 60, 30]))
  test('angles within half a degree of 180 are used, scaled so that they add up to exactly 180', () => {
    const a = triangleAngles({ angles: [90, 60.2, 30.2] })
    expect(sum(a)).toBeCloseTo(180, 12)
    expect(a[0]).toBeCloseTo(90 * (180 / 180.4), 12)
  })
  test('angles that do not add up to 180, or that are not three positive numbers, are not used', () => {
    expect(triangleAngles({ angles: [90, 60, 40] })).toEqual([60, 60, 60])
    expect(triangleAngles({ angles: [90, 90] })).toEqual([60, 60, 60])
    expect(triangleAngles({ angles: [0, 90, 90] })).toEqual([60, 60, 60])
    expect(triangleAngles({ angles: [Number.NaN, 90, 90] })).toEqual([60, 60, 60])
  })
  test('no angles: equal sides', () => expect(triangleAngles({})).toEqual([60, 60, 60]))
  test('no angles but a right angle at one corner: a right-angled triangle, with the 90 where it was asked', () => {
    for (const at of [0, 1, 2] as const) {
      const a = triangleAngles({ rightAngleAt: at })
      expect(a[at]).toBe(90)
      expect(sum(a)).toBeCloseTo(180, 9)
      expect(a.filter((v) => v === 90)).toHaveLength(1)
    }
  })
})

describe('layoutTriangle: 90, 60, 30 with the right angle at the first corner', () => {
  const l = layoutTriangle([90, 60, 30], BOX, 0)

  test('the right angle is at the bottom left, the base runs right from it and the third corner is straight above it', () => {
    expect(l.points[0]!.y).toBeCloseTo(l.points[1]!.y, 9)
    expect(l.points[1]!.x).toBeGreaterThan(l.points[0]!.x)
    expect(l.points[2]!.x).toBeCloseTo(l.points[0]!.x, 9)
    expect(l.points[2]!.y).toBeLessThan(l.points[0]!.y)
  })
  test('the corners really are 90, 60 and 30 degrees', () => {
    expect(angleAt(l, 0)).toBeCloseTo(90, 6)
    expect(angleAt(l, 1)).toBeCloseTo(60, 6)
    expect(angleAt(l, 2)).toBeCloseTo(30, 6)
  })
  test('it fits its box, and fills it along the side that is the limit', () => {
    const xs = l.points.map((p) => p.x)
    const ys = l.points.map((p) => p.y)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(BOX.x0 - 1e-9)
    expect(Math.max(...xs)).toBeLessThanOrEqual(BOX.x1 + 1e-9)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(BOX.y0 - 1e-9)
    expect(Math.max(...ys)).toBeLessThanOrEqual(BOX.y1 + 1e-9)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    expect(Math.max(w / (BOX.x1 - BOX.x0), h / (BOX.y1 - BOX.y0))).toBeCloseTo(1, 9)
  })
  test('the names are outside the corners, the side labels outside the edges, the angle labels inside the corners', () => {
    const c = centroid(l)
    for (let i = 0; i < 3; i++) {
      expect(dist(l.names[i]!, c)).toBeGreaterThan(dist(l.points[i]!, c))
      expect(within(l, l.sides[i]!.at)).toBe(false)
      expect(within(l, l.angles[i]!.at)).toBe(true)
    }
  })
  test('a side label is beside the middle of its own edge: side 0 is corner 0 to corner 1, side 1 is 1 to 2, side 2 is 2 to 0', () => {
    for (let i = 0; i < 3; i++) {
      const mid = { x: (l.points[i]!.x + l.points[(i + 1) % 3]!.x) / 2, y: (l.points[i]!.y + l.points[(i + 1) % 3]!.y) / 2 }
      expect(dist(l.sides[i]!.at, mid)).toBeLessThan(20)
      expect(dist(l.sides[i]!.at, mid)).toBeGreaterThan(8)
    }
  })
  test('a small square at the right angle, and only there', () => {
    expect(l.right?.at).toBe(0)
    expect(l.right?.path.startsWith('M')).toBe(true)
    expect(l.arcs[0]).toBeNull()
    expect(l.arcs[1]).not.toBeNull()
    expect(l.arcs[2]).not.toBeNull()
  })
})

describe('layoutTriangle: other triangles', () => {
  test('with the right angle at the second corner, that corner is at the bottom left, the third at the bottom right, the first straight above', () => {
    const l = layoutTriangle([30, 90, 60], BOX, 1)
    expect(l.right?.at).toBe(1)
    expect(angleAt(l, 1)).toBeCloseTo(90, 6)
    expect(l.points[1]!.y).toBeCloseTo(l.points[2]!.y, 9)
    expect(l.points[1]!.x).toBeLessThan(l.points[2]!.x)
    expect(l.points[0]!.x).toBeCloseTo(l.points[1]!.x, 9)
    expect(l.points[0]!.y).toBeLessThan(l.points[1]!.y)
  })
  test('with the right angle at the third corner, that corner is at the bottom left, the first at the bottom right, the second on top', () => {
    const l = layoutTriangle([30, 60, 90], BOX, 2)
    expect(l.right?.at).toBe(2)
    expect(l.points[2]!.y).toBeCloseTo(l.points[0]!.y, 9)
    expect(l.points[2]!.x).toBeLessThan(l.points[0]!.x)
    expect(l.points[1]!.y).toBeLessThan(l.points[2]!.y)
  })
  test('no right angle: the second corner is at the bottom left, the third at the bottom right, the first at the top', () => {
    const l = layoutTriangle([50, 60, 70], BOX, null)
    expect(l.right).toBeNull()
    expect(l.points[1]!.y).toBeCloseTo(l.points[2]!.y, 9)
    expect(l.points[1]!.x).toBeLessThan(l.points[2]!.x)
    expect(l.points[0]!.y).toBeLessThan(l.points[1]!.y)
    for (const [i, want] of [50, 60, 70].entries()) expect(angleAt(l, i)).toBeCloseTo(want, 6)
  })
  test('equal sides: three equal edges', () => {
    const l = layoutTriangle([60, 60, 60], BOX, null)
    expect(dist(l.points[0]!, l.points[1]!)).toBeCloseTo(dist(l.points[1]!, l.points[2]!), 9)
    expect(dist(l.points[1]!, l.points[2]!)).toBeCloseTo(dist(l.points[2]!, l.points[0]!), 9)
  })
  test('an obtuse and a very thin triangle still fit the box, with their labels in the right place', () => {
    for (const angles of [[120, 30, 30], [170, 5, 5], [1, 1, 178]] as const) {
      const l = layoutTriangle([...angles], BOX, null)
      for (const p of l.points) {
        expect(p.x).toBeGreaterThanOrEqual(BOX.x0 - 1e-9)
        expect(p.x).toBeLessThanOrEqual(BOX.x1 + 1e-9)
        expect(p.y).toBeGreaterThanOrEqual(BOX.y0 - 1e-9)
        expect(p.y).toBeLessThanOrEqual(BOX.y1 + 1e-9)
      }
      for (let i = 0; i < 3; i++) expect(within(l, l.angles[i]!.at)).toBe(true)
    }
  })
})
