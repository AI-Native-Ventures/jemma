import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiagramView } from '@/components/diagrams'
import { Shape2D } from '@/components/diagrams/Shape2D'

// P102: a right-angled triangle's labels go on the side or the corner they NAME, not where their place in the list falls, and a label too long for
// its place is written under the drawing, never cut off at the edge. The specs below are the ones stored in the demo's trigonometry lesson (the
// step 1 labels and the formulas of steps 2 and 3). react-dom only: no browser.

const STEP_1 = ['θ', 'opposite', 'adjacent', 'hypotenuse', '90°']
const STEP_2 = ['sin θ = opposite / hypotenuse', 'cos θ = adjacent / hypotenuse', 'tan θ = opposite / adjacent']
const STEP_3 = ['θ = sin^-1(opposite / hypotenuse)', 'θ = cos^-1(adjacent / hypotenuse)', 'θ = tan^-1(opposite / adjacent)']
const CONTRAST = ['Mistake: cos θ = opposite / hypotenuse', 'Right: sin θ = opposite / hypotenuse']

// The drawing: right angle at the bottom left (B), the angle θ at the top (A), the slanted side from A to C.
const A = [92, 58] as const
const B = [92, 138] as const
const C = [212, 138] as const
const VIEWBOX = { w: 285, h: 190 }

type Point = readonly [number, number]
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1])
function toSegment(p: Point, a: Point, b: Point) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return dist(p, [a[0] + t * dx, a[1] + t * dy])
}
const sides = { vertical: [A, B], bottom: [B, C], slanted: [A, C] } as const
const nearestSide = (p: Point) => (Object.entries(sides) as [keyof typeof sides, readonly [Point, Point]][]).map(([k, [a, b]]) => [k, toSegment(p, a, b)] as const).sort((x, y) => x[1] - y[1])[0]![0]
const nearestVertex = (p: Point) => ([['A', A], ['B', B], ['C', C]] as const).map(([k, v]) => [k, dist(p, v)] as const).sort((x, y) => x[1] - y[1])[0]![0]

/** A generous estimate of a drawn text's width: 7 px a character at the 12 px size, the 14 px size a little more. */
const widthOf = (text: string, size: number) => text.length * size * 0.6

type Drawn = { text: string; x: number; y: number; size: number; anchor: string; box: { left: number; right: number; top: number; bottom: number }; centre: Point }
function drawn(container: HTMLElement): Drawn[] {
  return [...container.querySelectorAll('svg text')].map((el) => {
    const text = el.textContent ?? ''
    const x = Number(el.getAttribute('x'))
    const y = Number(el.getAttribute('y'))
    const size = Number(el.getAttribute('font-size'))
    const anchor = el.getAttribute('text-anchor') ?? 'middle'
    const w = widthOf(text, size)
    const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2
    const box = { left, right: left + w, top: y - size, bottom: y + size * 0.25 }
    return { text, x, y, size, anchor, box, centre: [(box.left + box.right) / 2, (box.top + box.bottom) / 2] as const }
  })
}
const find = (items: Drawn[], text: string) => items.find((d) => d.text === text)
const notes = (container: HTMLElement) => [...container.querySelectorAll('[data-part="notes"] > *')].map((li) => li.textContent)

const triangle = (labels: string[]) => render(<Shape2D kind="shape_2d" shape="triangle" labels={labels} />)

describe('triangle, labels that name a side or a corner (the lesson, step 1)', () => {
  it('puts hypotenuse on the slanted side, adjacent on the upright side and opposite on the bottom', () => {
    const { container } = triangle(STEP_1)
    const items = drawn(container)
    expect(nearestSide(find(items, 'hypotenuse')!.centre)).toBe('slanted')
    expect(nearestSide(find(items, 'adjacent')!.centre)).toBe('vertical')
    expect(nearestSide(find(items, 'opposite')!.centre)).toBe('bottom')
  })

  it('puts θ at a corner that is not the right angle, and 90° at the right angle', () => {
    const { container } = triangle(STEP_1)
    const items = drawn(container)
    expect(nearestVertex(find(items, 'θ')!.centre)).toBe('A')
    expect(nearestVertex(find(items, '90°')!.centre)).toBe('B')
  })

  it('draws every one of the five labels, once, on the drawing', () => {
    const { container } = triangle(STEP_1)
    expect(drawn(container).map((d) => d.text).sort()).toEqual([...STEP_1].sort())
    expect(notes(container)).toEqual([])
  })

  it('keeps every label inside the drawing', () => {
    const { container } = triangle(STEP_1)
    for (const d of drawn(container)) {
      expect(d.box.left, d.text).toBeGreaterThanOrEqual(0)
      expect(d.box.right, d.text).toBeLessThanOrEqual(VIEWBOX.w)
      expect(d.box.top, d.text).toBeGreaterThanOrEqual(0)
      expect(d.box.bottom, d.text).toBeLessThanOrEqual(VIEWBOX.h)
    }
  })

  it('does not depend on the order of the labels', () => {
    const { container } = triangle(['hypotenuse', '90°', 'opposite', 'θ', 'adjacent'])
    const items = drawn(container)
    expect(nearestSide(find(items, 'hypotenuse')!.centre)).toBe('slanted')
    expect(nearestSide(find(items, 'adjacent')!.centre)).toBe('vertical')
    expect(nearestSide(find(items, 'opposite')!.centre)).toBe('bottom')
    expect(nearestVertex(find(items, '90°')!.centre)).toBe('B')
  })

  it('knows other angle names and other capital letters of the words', () => {
    const { container } = triangle(['α', 'Opposite', 'Adjacent', 'Hypotenuse'])
    const items = drawn(container)
    expect(nearestVertex(find(items, 'α')!.centre)).toBe('A')
    expect(nearestSide(find(items, 'Hypotenuse')!.centre)).toBe('slanted')
    expect(nearestSide(find(items, 'Adjacent')!.centre)).toBe('vertical')
    expect(nearestSide(find(items, 'Opposite')!.centre)).toBe('bottom')
  })

  it('writes a label it has no place for under the drawing (here a length)', () => {
    const { container } = triangle([...STEP_1, '5 cm'])
    expect(drawn(container).map((d) => d.text)).not.toContain('5 cm')
    expect(notes(container)).toEqual(['5 cm'])
  })
})

describe('triangle, labels too long for a side (the formulas)', () => {
  it.each([
    ['step 2', STEP_2],
    ['step 3', STEP_3],
    ['the contrast', CONTRAST],
  ])('%s: every formula is text under the drawing, one a line, and none is drawn on it', (_name, labels) => {
    const { container } = triangle(labels)
    // P129: a power is raised on the page, so the text of a formula has no caret (sin^-1 is sin with a raised minus 1).
    expect(notes(container)).toEqual(labels.map((l) => l.replace('^-1', '\u22121')))
    expect(drawn(container)).toEqual([])
  })

  it.each([
    ['step 2', STEP_2],
    ['step 3', STEP_3],
    ['the contrast', CONTRAST],
    ['step 1', STEP_1],
  ])('%s: no text of the drawing is outside its box', (_name, labels) => {
    const { container } = triangle(labels)
    for (const d of drawn(container)) {
      expect(d.box.left, d.text).toBeGreaterThanOrEqual(0)
      expect(d.box.right, d.text).toBeLessThanOrEqual(VIEWBOX.w)
    }
  })

  it('the text under the drawing is a list the page can wrap, and it is not cut', () => {
    const { container } = triangle(STEP_3)
    const list = container.querySelector('[data-part="notes"]') as HTMLElement
    expect(list).not.toBeNull()
    const style = list.getAttribute('style') ?? ''
    expect(style).toMatch(/overflow-wrap:\s*(anywhere|break-word)/)
    expect(style).not.toMatch(/nowrap|overflow:\s*hidden|ellipsis/)
  })

  it('still describes every label to a screen reader, once, in the drawing\'s own description', () => {
    const { container } = triangle(STEP_2)
    const label = container.querySelector('svg')!.getAttribute('aria-label')!
    for (const f of STEP_2) expect(label).toContain(f)
    // the list under the drawing repeats them for the eye only, so they are not read twice
    expect(container.querySelector('[data-part="notes"]')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('through the diagram view, as the lesson draws it', () => {
    const { container } = render(<DiagramView spec={{ kind: 'shape_2d', shape: 'triangle', labels: STEP_2 }} />)
    expect(notes(container)).toEqual(STEP_2)
  })
})

describe('every other triangle, and every other shape, is drawn as before', () => {
  it('a Grade 6 triangle (three lengths) keeps its labels in their three places', () => {
    const { container } = triangle(['3 cm', '4 cm', '5 cm'])
    const items = drawn(container)
    expect(items.map((d) => [d.text, d.x, d.y, d.anchor])).toEqual([
      ['3 cm', 85, 102, 'end'],
      ['4 cm', 152, 160, 'middle'],
      ['5 cm', 162, 92, 'start'],
    ])
    expect(notes(container)).toEqual([])
    // no wrapper around the drawing when there is nothing under it
    expect(container.firstElementChild!.tagName.toLowerCase()).toBe('svg')
  })

  it('a label that is too long for its place goes under the drawing, the others stay', () => {
    const { container } = triangle(['3 cm', 'the long base of this triangle', '5 cm'])
    expect(drawn(container).map((d) => d.text)).toEqual(['3 cm', '5 cm'])
    expect(notes(container)).toEqual(['the long base of this triangle'])
  })

  it('a label after the third has no place on the drawing, so it is written under it', () => {
    const { container } = triangle(['3 cm', '4 cm', '5 cm', 'Area 6 cm²'])
    expect(drawn(container).map((d) => d.text)).toEqual(['3 cm', '4 cm', '5 cm'])
    expect(notes(container)).toEqual(['Area 6 cm²'])
  })

  it('the square, the rectangle and the circle draw their labels where they did', () => {
    const rect = drawn(render(<Shape2D kind="shape_2d" shape="rectangle" labels={['8 cm', '5 cm', 'Perimeter 26 cm']} />).container)
    expect(rect.map((d) => [d.text, d.x, d.y])).toEqual([['8 cm', 132.5, 41], ['5 cm', 198.5, 90], ['Perimeter 26 cm', 132.5, 146]])
    const square = drawn(render(<Shape2D kind="shape_2d" shape="square" labels={['4 cm', 'Perimeter 16 cm']} />).container)
    expect(square.map((d) => [d.text, d.x, d.y])).toEqual([['4 cm', 142.5, 43], ['Perimeter 16 cm', 142.5, 156]])
    const circle = drawn(render(<Shape2D kind="shape_2d" shape="circle" labels={['r = 4 cm', 'Circumference = 2πr']} />).container)
    expect(circle.map((d) => [d.text, d.x, d.y])).toEqual([['r = 4 cm', 170.5, 82], ['Circumference = 2πr', 142.5, 174]])
  })
})
