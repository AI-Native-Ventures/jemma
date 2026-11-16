import { renderToStaticMarkup } from 'react-dom/server'
import type { CoordinatePlaneSpec } from '@jemma/profiling/schemas'
import { describe, expect, test } from 'vitest'
import { CoordinatePlane, DiagramView, NumberLine } from '@/components/diagrams'

// P134: a label on a number line or a graph never sits on top of the numbers. The boxes here are measured by the test with its own rough sizes of the
// letters (not the ones the drawing uses), from the x, y and text-anchor of each text. react-dom/server only: no browser.

const html = (node: React.ReactElement) => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(node)
  return box
}
const num = (el: Element, name: string) => Number(el.getAttribute(name))

type Box = { l: number; r: number; t: number; b: number }
/** The box of a text: about 0.6 of its size for each letter, `up` above the baseline and 4 below. */
function boxOfText(el: Element, size: number, perLetter = 0.6): Box {
  const w = (el.textContent ?? '').length * size * perLetter
  const x = num(el, 'x')
  const y = num(el, 'y')
  const anchor = el.getAttribute('text-anchor')
  const l = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2
  return { l, r: l + w, t: y - size * 0.8, b: y + 3 }
}
const hit = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

// ---- Number line --------------------------------------------------------------------------------------------------------------------------

const TICK_ROW = 138
const line = (over: Partial<Extract<React.ComponentProps<typeof NumberLine>, { kind: 'number_line' }>> = {}) =>
  ({ kind: 'number_line', min: 0, max: 12, step: 1, marks: [{ value: 11, label: '2x + 3' }], ...over }) as React.ComponentProps<typeof NumberLine>
/** The numbers of the row under the line. */
const tickNumbers = (box: HTMLElement) => [...box.querySelectorAll('text')].filter((t) => num(t, 'y') === TICK_ROW)
/** The highest point of each hop arc (a quadratic curve: a quarter of each end and a half of the control). */
const arcTops = (box: HTMLElement) =>
  [...box.querySelectorAll('path')].map((p) => {
    const n = (p.getAttribute('d') ?? '').match(/-?[\d.]+/g)!.map(Number)
    return 0.25 * n[1]! + 0.5 * n[3]! + 0.25 * n[5]!
  })

describe('NumberLine: the label of a point is above the line, clear of the numbers', () => {
  test('a point at 11 on a line from 0 to 12, labelled 2x + 3 (the lesson card of the 15 Nov live check)', () => {
    const box = html(<NumberLine {...line()} />)
    const label = box.querySelector('[data-mark-label]')!
    expect(label, 'the label is drawn above the line').not.toBeNull()
    expect(label.textContent).toBe('2x + 3')
    // above the row of the numbers, and above the line itself
    expect(num(label, 'y')).toBeLessThan(TICK_ROW - 30)
    expect(num(label, 'y')).toBeLessThan(112 - 8)
    // no number of the row is covered by it
    const mine = boxOfText(label, 13)
    const ticks = tickNumbers(box)
    expect(ticks.map((t) => t.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    for (const t of ticks) expect(hit(mine, boxOfText(t, 13)), `2x + 3 over the ${t.textContent}`).toBe(false)
  })

  test('the label is clear of the hop arcs too, and inside the drawing', () => {
    const box = html(<NumberLine {...line()} />)
    const arcs = arcTops(box)
    expect(arcs).toHaveLength(11)
    const mine = boxOfText(box.querySelector('[data-mark-label]')!, 13)
    expect(mine.b, 'its lowest point is above the highest arc').toBeLessThan(Math.min(...arcs))
    expect(mine.l).toBeGreaterThanOrEqual(0)
    expect(mine.r).toBeLessThanOrEqual(285)
    expect(mine.t).toBeGreaterThanOrEqual(0)
  })

  test('with no hops (a point between two steps) the label is just over the point', () => {
    const box = html(<NumberLine {...line({ marks: [{ value: 5.5, label: '2x + 3' }] })} />)
    expect(box.querySelectorAll('path')).toHaveLength(0)
    const label = box.querySelector('[data-mark-label]')!
    expect(num(label, 'y')).toBeLessThan(112 - 8)
    expect(num(label, 'y')).toBeGreaterThan(70)
    const mine = boxOfText(label, 13)
    for (const t of tickNumbers(box)) expect(hit(mine, boxOfText(t, 13))).toBe(false)
  })

  test('a long label at the end of the line is moved in, so that all of its words are inside the drawing', () => {
    for (const value of [0, 12]) {
      const box = html(<NumberLine {...line({ marks: [{ value, label: '2x + 3 = 27' }] })} />)
      const mine = boxOfText(box.querySelector('[data-mark-label]')!, 13)
      expect(mine.l, `at ${value}`).toBeGreaterThanOrEqual(0)
      expect(mine.r, `at ${value}`).toBeLessThanOrEqual(285)
    }
  })

  test('two long labels side by side go on two rows, and cover nothing of each other', () => {
    const box = html(<NumberLine {...line({ marks: [{ value: 5, label: '2x + 3' }, { value: 6, label: 'x + 8' }] })} />)
    const labels = [...box.querySelectorAll('[data-mark-label]')]
    expect(labels).toHaveLength(2)
    expect(num(labels[0]!, 'y')).not.toBe(num(labels[1]!, 'y'))
    expect(hit(boxOfText(labels[0]!, 13), boxOfText(labels[1]!, 13))).toBe(false)
    for (const l of labels) for (const t of tickNumbers(box)) expect(hit(boxOfText(l, 13), boxOfText(t, 13))).toBe(false)
  })

  test('a number of a point that is moved up stays in the row of the numbers, in the colour of the other numbers', () => {
    const box = html(<NumberLine {...line()} />)
    const eleven = tickNumbers(box).find((t) => t.textContent === '11')!
    expect(eleven.getAttribute('fill')).toBe(tickNumbers(box)[0]!.getAttribute('fill'))
    expect(eleven.getAttribute('font-weight')).toBe('400')
  })

  test('a short label (a number, a fraction) stays in the row of the numbers, drawn as it always was', () => {
    const seven = html(<NumberLine {...line({ max: 10, marks: [{ value: 7, label: '7' }] })} />)
    expect(seven.querySelector('[data-mark-label]')).toBeNull()
    const at = tickNumbers(seven).find((t) => t.textContent === '7')!
    expect(at.getAttribute('font-weight')).toBe('600')
    const demo = html(<DiagramView spec={{ kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '3/4' }] }} />)
    expect(demo.querySelector('[data-mark-label]')).toBeNull()
    expect(tickNumbers(demo).map((t) => t.textContent)).toEqual(['0', '1/4', '2/4', '3/4', '1'])
    expect(demo.querySelectorAll('tspan')).toHaveLength(0)
  })
})

// ---- Coordinate plane ---------------------------------------------------------------------------------------------------------------------

const plane = (over: Partial<CoordinatePlaneSpec> = {}): CoordinatePlaneSpec => ({ kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, ...over })
const numbersOf = (box: HTMLElement) => [...box.querySelectorAll('[data-tick], [data-zero]')]
const labelsOf = (box: HTMLElement) => [...box.querySelectorAll('[data-graph-label], [data-point-label]')]
/** The label, with the extra room of the halo; the numbers are 12 px. */
const labelBox = (el: Element) => boxOfText(el, 14, 0.62)
const numberBox = (el: Element) => boxOfText(el, 12, 0.6)

describe('CoordinatePlane: a label stays clear of the numbers of the axes', () => {
  test('a long point label just under the x axis would cover the numbers: it is moved', () => {
    const box = html(<CoordinatePlane {...plane({ points: [{ x: 1, y: -1, label: 'turning point' }] })} />)
    const label = box.querySelector('[data-point-label]')!
    for (const n of numbersOf(box)) expect(hit(labelBox(label), numberBox(n)), `over ${n.textContent}`).toBe(false)
    // and it is still inside the drawing
    const w = labelBox(label)
    expect(w.l).toBeGreaterThanOrEqual(0)
    expect(w.r).toBeLessThanOrEqual(320)
    expect(w.b).toBeLessThanOrEqual(300)
  })

  test('the numbers under it are all still there', () => {
    const box = html(<CoordinatePlane {...plane({ points: [{ x: 1, y: -1, label: 'turning point' }] })} />)
    expect(box.querySelectorAll('[data-tick="x"]')).toHaveLength(10)
    expect(box.querySelectorAll('[data-tick="y"]')).toHaveLength(10)
  })

  test('the label of a graph that ends just under the x axis, at the right side, is moved off the numbers', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'line', m: 0, c: -1, label: 'y = −1' }] })} />)
    const label = box.querySelector('[data-graph-label]')!
    for (const n of numbersOf(box)) expect(hit(labelBox(label), numberBox(n)), `over ${n.textContent}`).toBe(false)
  })

  test('a label next to the numbers of the y axis is moved off them too', () => {
    const box = html(<CoordinatePlane {...plane({ points: [{ x: -1, y: 2, label: 'a long point name' }] })} />)
    const label = box.querySelector('[data-point-label]')!
    for (const n of numbersOf(box)) expect(hit(labelBox(label), numberBox(n)), `over ${n.textContent}`).toBe(false)
  })

  test('two labels meet: the second is moved, and they cover nothing of each other', () => {
    const box = html(
      <CoordinatePlane
        {...plane({ points: [{ x: 2, y: 3, label: 'first' }, { x: 2, y: 3, label: 'second' }] })}
      />,
    )
    const [a, b] = labelsOf(box)
    expect(hit(labelBox(a!), labelBox(b!))).toBe(false)
  })

  test('a label that is clear is where it always was (above the point, to the right of it)', () => {
    const box = html(<CoordinatePlane {...plane({ points: [{ x: 2, y: 3, label: 'A' }] })} />)
    const label = box.querySelector('[data-point-label]')!
    const dot = box.querySelector('circle[data-point]')!
    expect(num(label, 'x')).toBeCloseTo(num(dot, 'cx') + 8, 5)
    expect(num(label, 'y')).toBeCloseTo(num(dot, 'cy') - 8, 5)
    expect(label.getAttribute('text-anchor')).toBe('start')
  })

  test('a label that is wider than the whole drawing is still put where it covers no number', () => {
    const wide = 'a label of words that is much too long for any place in this grid'
    const box = html(<CoordinatePlane {...plane({ points: [{ x: 0, y: -1, label: wide }] })} />)
    const label = box.querySelector('[data-point-label]')!
    expect(label.textContent).toBe(wide)
    for (const n of numbersOf(box)) expect(hit(labelBox(label), numberBox(n)), `over ${n.textContent}`).toBe(false)
  })
})
