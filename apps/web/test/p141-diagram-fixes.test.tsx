import { createHash } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CoordinatePlaneSpec, DiagramSpec } from '@jemma/profiling/schemas'
import { describe, expect, test } from 'vitest'
import { CoordinatePlane, DiagramView, NumberLine } from '@/components/diagrams'
import { readInequality } from '@/components/diagrams/inequality'
import { segments } from '@/app/k/session/_parts/typeset'
import before from './fixtures/p141-before.json'
import { NUMBER_LINES, PLANES } from './fixtures/p141-specs'

// P141: three fixes seen on a live Grade 11 lesson ("Equations and inequalities"): the numbers on a long axis thin out instead of crowding, a lone x in
// a caption is typeset like the equations around it, and an inequality on a number line is the textbook picture (a circle and a shaded ray), not hops.
// The boxes here are measured by the test with its own rough sizes of the letters (not the ones the drawing uses). react-dom/server only: no browser.

const html = (node: React.ReactElement) => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(node)
  return box
}
const num = (el: Element, name: string) => Number(el.getAttribute(name))
const sha = (markup: string) => createHash('sha256').update(markup).digest('hex')

type Box = { l: number; r: number; t: number; b: number }
/** The box of a text: 0.6 of its size for each letter, 0.75 of the size above the baseline (the height of a digit) and 1.5 below. */
function boxOfText(el: Element, size: number): Box {
  const w = (el.textContent ?? '').length * size * 0.6
  const x = num(el, 'x')
  const y = num(el, 'y')
  const anchor = el.getAttribute('text-anchor')
  const l = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2
  return { l, r: l + w, t: y - size * 0.75, b: y + 1.5 }
}
const hit = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
/** Every pair of the boxes that cover some of the same ground, as the texts they belong to. */
function overlaps(texts: Element[], size: number): string[] {
  const out: string[] = []
  texts.forEach((a, i) => {
    texts.slice(i + 1).forEach((b) => {
      if (hit(boxOfText(a, size), boxOfText(b, size))) out.push(`${a.textContent} over ${b.textContent}`)
    })
  })
  return out
}

// ---- The live picture of the 16 Nov check ------------------------------------------------------------------------------------------------

const plane = (over: Partial<CoordinatePlaneSpec> = {}): CoordinatePlaneSpec => ({
  kind: 'coordinate_plane',
  xMin: -6,
  xMax: 6,
  yMin: -8,
  yMax: 16,
  step: 1,
  graphs: [
    { type: 'line', m: 2, c: 3, label: 'y = 2x + 3' },
    { type: 'line', m: 0, c: 11, label: 'y = 11' },
  ],
  points: [{ x: 4, y: 11, label: '(4; 11)' }],
  ...over,
})

describe('CoordinatePlane: the numbers on an axis thin out when they would crowd each other', () => {
  for (const yMax of [16, 12]) {
    test(`y from -8 to ${yMax} in steps of 1: the numbers of the axes clear of each other, one 0, every grid line and tick kept`, () => {
      const box = html(<CoordinatePlane {...plane({ yMax })} />)
      const ys = [...box.querySelectorAll('text[data-tick="y"]')]
      const xs = [...box.querySelectorAll('text[data-tick="x"]')]
      const zeros = [...box.querySelectorAll('text')].filter((t) => t.textContent === '0')
      expect(ys.length, 'the y numbers are fewer than the 24 whole numbers').toBeLessThan(yMax + 8)
      expect(ys.length).toBeGreaterThanOrEqual(3)
      expect(overlaps(ys, 12), 'y numbers over each other').toEqual([])
      expect(overlaps(xs, 12), 'x numbers over each other').toEqual([])
      expect(zeros, 'exactly one 0').toHaveLength(1)
      expect(zeros[0]!.hasAttribute('data-zero')).toBe(true)
      // the 0 at the origin is clear of every number of both axes
      const zero = boxOfText(zeros[0]!, 12)
      for (const t of [...ys, ...xs]) expect(hit(zero, boxOfText(t, 12)), `0 over ${t.textContent}`).toBe(false)
      // and no y number is over an x number
      for (const a of ys) for (const b of xs) expect(hit(boxOfText(a, 12), boxOfText(b, 12)), `y ${a.textContent} over x ${b.textContent}`).toBe(false)
      // the grid keeps a line at every step, the axes keep a tick at every step
      expect(box.querySelectorAll('line[data-grid="y"]')).toHaveLength(yMax + 8 + 1)
      expect(box.querySelectorAll('line[data-grid="x"]')).toHaveLength(13)
      expect(box.querySelectorAll('line[stroke-width="1.4"]')).toHaveLength(yMax + 8 + 12)
      // the numbers that are left are whole steps from 0, so a learner can count on from them
      for (const t of ys) expect(Number.isInteger(Number((t.textContent ?? '').replace('−', '-')))).toBe(true)
    })
  }

  test('the numbers that stay are a step of 1, 2, 5, 10 ... from 0 (a regular count)', () => {
    const box = html(<CoordinatePlane {...plane()} />)
    const values = [...box.querySelectorAll('text[data-tick="y"]')].map((t) => Number((t.textContent ?? '').replace('−', '-')))
    // the 0 of the origin is one of the counts of the axis
    const counts = [...values, 0].sort((a, b) => a - b)
    // every number is a multiple of the same step, and the step is 1, 2, 5, 10 ... : the numbers left are the count of the axis, with its gaps of whole steps
    const stepOf = [1, 2, 5, 10, 20].find((k) => counts.every((v) => v % k === 0) && counts.slice(1).every((v, i) => (v - counts[i]!) % k === 0))
    expect(stepOf, `counts ${counts}`).toBeDefined()
    const biggest = [20, 10, 5, 2, 1].find((k) => counts.every((v) => v % k === 0))!
    expect(counts.length).toBeGreaterThan(3)
    expect(biggest).toBeGreaterThanOrEqual(2)
  })

  test('a plane that is not crowded keeps every number, as it always did', () => {
    const box = html(<CoordinatePlane {...PLANES.small!} />)
    // (the 5 is left out by the label of the point, as it always was)
    expect([...box.querySelectorAll('text[data-tick="y"]')].map((t) => t.textContent)).toEqual(['−5', '−4', '−3', '−2', '−1', '1', '2', '3', '4'])
    expect(box.querySelectorAll('text[data-tick="x"]')).toHaveLength(10)
  })

  test('a wide x axis thins out too: x from -20 to 20 in steps of 1', () => {
    const box = html(<CoordinatePlane {...plane({ xMin: -20, xMax: 20, yMin: -5, yMax: 5, graphs: [], points: [] })} />)
    const xs = [...box.querySelectorAll('text[data-tick="x"]')]
    expect(overlaps(xs, 12)).toEqual([])
    expect(xs.length).toBeLessThan(40)
    // the step of 1 the model gave is kept for the grid
    expect(xs.length).toBeGreaterThanOrEqual(4)
    expect([...box.querySelectorAll('text')].filter((t) => t.textContent === '0')).toHaveLength(1)
    expect(box.querySelectorAll('line[data-grid="x"]')).toHaveLength(41)
  })
})

describe('NumberLine: the numbers of a long line thin out', () => {
  const TICK_ROW = 138
  test('-20 to 20 in steps of 1: the numbers are clear of each other and 0 is one of them', () => {
    const box = html(<NumberLine kind="number_line" min={-20} max={20} step={1} marks={[]} />)
    const row = [...box.querySelectorAll('text')].filter((t) => num(t, 'y') === TICK_ROW)
    expect(row.length).toBeLessThan(41)
    expect(overlaps(row, 13)).toEqual([])
    expect(row.map((t) => t.textContent)).toContain('0')
    // a tick at every step stays
    expect(box.querySelectorAll('line[stroke-width="2"]').length).toBeGreaterThanOrEqual(41)
  })

  test('a short line keeps every number', () => {
    const box = html(<NumberLine kind="number_line" min={0} max={12} step={1} marks={[]} />)
    expect([...box.querySelectorAll('text')].filter((t) => num(t, 'y') === TICK_ROW)).toHaveLength(13)
  })
})

// ---- The inequality on a number line -------------------------------------------------------------------------------------------------

type NumberLineSpec = Extract<DiagramSpec, { kind: 'number_line' }>
const X0 = 30
const X1 = 255
const px = (v: number, min: number, max: number) => X0 + ((v - min) / (max - min)) * (X1 - X0)
const lineWith = (label: string, value: number, min = -3, max = 8): NumberLineSpec => ({ kind: 'number_line', min, max, step: 1, marks: [{ label, value }] })
const first = (box: HTMLElement, selector: string) => box.querySelector(selector)!

describe('NumberLine: an inequality is a circle and a shaded ray, not hops', () => {
  test('x < 4 on -3 to 8 (the lesson card of the live check): no hop, an open circle at 4, a ray with an arrow head towards the start of the line', () => {
    const box = html(<NumberLine {...lineWith('x < 4', 4)} />)
    expect(box.querySelectorAll('path'), 'no hop arcs').toHaveLength(0)
    const open = box.querySelectorAll('circle[data-circle="open"]')
    expect(open).toHaveLength(1)
    expect(box.querySelectorAll('circle[data-circle="filled"]')).toHaveLength(0)
    expect(num(open[0]!, 'cx')).toBeCloseTo(px(4, -3, 8), 0)
    expect(num(open[0]!, 'cy')).toBe(112)
    expect(open[0]!.getAttribute('fill')).toBe('#FFFFFF')
    const ray = first(box, '[data-ray]')
    expect(ray.getAttribute('data-ray')).toBe('left')
    expect(Math.min(num(ray, 'x1'), num(ray, 'x2'))).toBeLessThanOrEqual(X0)
    expect(Math.max(num(ray, 'x1'), num(ray, 'x2'))).toBeCloseTo(num(open[0]!, 'cx'), 0)
    expect(num(ray, 'stroke-width')).toBeGreaterThanOrEqual(5)
    const arrow = first(box, 'polygon[data-arrow]')
    expect(arrow.getAttribute('data-arrow')).toBe('left')
    const xs = (arrow.getAttribute('points') ?? '').split(' ').map((p) => Number(p.split(',')[0]))
    expect(Math.max(...xs)).toBeLessThanOrEqual(X0)
    expect(Math.min(...xs)).toBeLessThan(X0 - 6)
    expect(box.querySelector('[data-segment]')).toBeNull()
  })

  test('its label is above the circle, above the line, and the number 4 stays in the row of the numbers', () => {
    const box = html(<NumberLine {...lineWith('x < 4', 4)} />)
    const label = first(box, '[data-mark-label]')
    expect(label.textContent).toBe('x < 4')
    expect(num(label, 'y')).toBeLessThan(112 - 8)
    expect(Math.abs(num(label, 'x') - px(4, -3, 8))).toBeLessThan(1)
    const row = [...box.querySelectorAll('text')].filter((t) => num(t, 'y') === 138).map((t) => t.textContent)
    expect(row).toEqual(['-3', '-2', '-1', '0', '1', '2', '3', '4', '5', '6', '7', '8'])
  })

  test('x < -3 with a minus sign on -6 to 2: an open circle at -3, the ray to the left', () => {
    const box = html(<NumberLine {...lineWith('x < −3', -3, -6, 2)} />)
    expect(box.querySelectorAll('path')).toHaveLength(0)
    expect(num(first(box, 'circle[data-circle="open"]'), 'cx')).toBeCloseTo(px(-3, -6, 2), 0)
    expect(first(box, '[data-ray]').getAttribute('data-ray')).toBe('left')
  })

  test('x > 4 is an open circle and a ray to the right, with the arrow head at the end of the line', () => {
    const box = html(<NumberLine {...lineWith('x > 4', 4)} />)
    expect(box.querySelectorAll('circle[data-circle="open"]')).toHaveLength(1)
    const ray = first(box, '[data-ray]')
    expect(ray.getAttribute('data-ray')).toBe('right')
    expect(Math.max(num(ray, 'x1'), num(ray, 'x2'))).toBeGreaterThanOrEqual(X1)
    expect(Math.min(num(ray, 'x1'), num(ray, 'x2'))).toBeCloseTo(px(4, -3, 8), 0)
    const xs = (first(box, 'polygon[data-arrow]').getAttribute('points') ?? '').split(' ').map((p) => Number(p.split(',')[0]))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(X1 - 1)
    expect(Math.max(...xs)).toBeGreaterThan(X1 + 6)
  })

  test('x >= -3 (typed with the signs of a keyboard, or with the signs of a book) is a filled circle and a ray towards the end of the line', () => {
    for (const label of ['x ≥ −3', 'x >= -3', 'x≥−3']) {
      const box = html(<NumberLine {...lineWith(label, -3, -6, 2)} />)
      expect(box.querySelectorAll('path'), label).toHaveLength(0)
      expect(box.querySelectorAll('circle[data-circle="filled"]'), label).toHaveLength(1)
      expect(box.querySelectorAll('circle[data-circle="open"]'), label).toHaveLength(0)
      expect(first(box, '[data-ray]').getAttribute('data-ray'), label).toBe('right')
      expect(num(first(box, 'circle[data-circle="filled"]'), 'cx'), label).toBeCloseTo(px(-3, -6, 2), 0)
    }
  })

  test('x <= 4 is a filled circle and a ray to the left', () => {
    const box = html(<NumberLine {...lineWith('x <= 4', 4)} />)
    expect(box.querySelectorAll('circle[data-circle="filled"]')).toHaveLength(1)
    expect(first(box, '[data-ray]').getAttribute('data-ray')).toBe('left')
  })

  test('any letter: n > 2 and t ≤ 1', () => {
    expect(html(<NumberLine {...lineWith('n > 2', 2)} />).querySelectorAll('circle[data-circle="open"]')).toHaveLength(1)
    expect(html(<NumberLine {...lineWith('t ≤ 1', 1)} />).querySelectorAll('circle[data-circle="filled"]')).toHaveLength(1)
  })

  test('-2 < x <= 3 is a shaded segment between two circles: open at -2, filled at 3, no arrow head and no hop', () => {
    const box = html(<NumberLine {...lineWith('−2 < x ≤ 3', 3)} />)
    expect(box.querySelectorAll('path')).toHaveLength(0)
    const seg = first(box, '[data-segment]')
    expect(num(seg, 'x1')).toBeCloseTo(px(-2, -3, 8), 0)
    expect(num(seg, 'x2')).toBeCloseTo(px(3, -3, 8), 0)
    expect(num(seg, 'stroke-width')).toBeGreaterThanOrEqual(5)
    expect(box.querySelector('[data-ray]')).toBeNull()
    expect(box.querySelector('polygon[data-arrow]')).toBeNull()
    const open = box.querySelectorAll('circle[data-circle="open"]')
    const filled = box.querySelectorAll('circle[data-circle="filled"]')
    expect(open).toHaveLength(1)
    expect(filled).toHaveLength(1)
    expect(num(open[0]!, 'cx')).toBeCloseTo(px(-2, -3, 8), 0)
    expect(num(filled[0]!, 'cx')).toBeCloseTo(px(3, -3, 8), 0)
    // the label is above the segment
    const label = first(box, '[data-mark-label]')
    expect(label.textContent).toBe('−2 < x ≤ 3')
    expect(num(label, 'y')).toBeLessThan(112 - 8)
  })

  test('1 < x < 5 has two open circles', () => {
    const box = html(<NumberLine {...lineWith('1 < x < 5', 5, 0, 8)} />)
    expect(box.querySelectorAll('circle[data-circle="open"]')).toHaveLength(2)
    expect(box.querySelector('[data-segment]')).not.toBeNull()
  })

  test('two inequalities on one line (x < -1 or x > 2) give two rays, their labels clear of each other', () => {
    const spec: NumberLineSpec = { kind: 'number_line', min: -4, max: 5, step: 1, marks: [{ label: 'x < −1', value: -1 }, { label: 'x > 2', value: 2 }] }
    const box = html(<NumberLine {...spec} />)
    expect(box.querySelectorAll('[data-ray]')).toHaveLength(2)
    expect(box.querySelectorAll('path')).toHaveLength(0)
    expect(overlaps([...box.querySelectorAll('[data-mark-label]')], 13)).toEqual([])
  })

  test('a mark that is not an inequality keeps the hops (a label that has an equals sign, a word, a sum)', () => {
    for (const label of ['x = 4', '2x + 3', 'A', '4']) {
      const box = html(<NumberLine {...lineWith(label, 4)} />)
      expect(box.querySelectorAll('path').length, label).toBeGreaterThan(0)
      expect(box.querySelector('[data-ray]'), label).toBeNull()
      expect(box.querySelector('circle[data-circle]'), label).toBeNull()
    }
  })

  test('an inequality with its point outside the line is left as it was (hops), never a ray from nowhere', () => {
    const box = html(<NumberLine {...lineWith('x < 40', 40)} />)
    expect(box.querySelector('[data-ray]')).toBeNull()
    const seg = html(<NumberLine {...lineWith('−20 < x < 3', 3)} />)
    expect(seg.querySelector('[data-segment]')).toBeNull()
  })

  test('the picture reaches the screen through DiagramView, with the old kinds drawn as before', () => {
    const box = html(<DiagramView spec={lineWith('x < 4', 4)} variant="learn" />)
    expect(box.querySelector('circle[data-circle="open"]')).not.toBeNull()
  })
})

describe('readInequality', () => {
  test('reads the forms with one letter', () => {
    expect(readInequality('x < 4')).toEqual({ kind: 'ray', dir: 'left', closed: false })
    expect(readInequality('x≤4')).toEqual({ kind: 'ray', dir: 'left', closed: true })
    expect(readInequality('y >= -2')).toEqual({ kind: 'ray', dir: 'right', closed: true })
    expect(readInequality('x > −3')).toEqual({ kind: 'ray', dir: 'right', closed: false })
    expect(readInequality('4 > x')).toEqual({ kind: 'ray', dir: 'left', closed: false })
    expect(readInequality('2,5 ≤ x')).toEqual({ kind: 'ray', dir: 'right', closed: true })
  })

  test('reads a < x < b', () => {
    expect(readInequality('−2 < x ≤ 3')).toEqual({ kind: 'segment', lo: -2, hi: 3, loClosed: false, hiClosed: true })
    expect(readInequality('1 <= m <= 1.5')).toEqual({ kind: 'segment', lo: 1, hi: 1.5, loClosed: true, hiClosed: true })
    expect(readInequality('5 > x > 1')).toEqual({ kind: 'segment', lo: 1, hi: 5, loClosed: false, hiClosed: false })
  })

  test('anything else is not one', () => {
    for (const t of ['x = 4', '2x + 3', 'x < y', '3 < 4', 'x', '4', 'x < 4 cm', 'ab < 3', '5 < x > 1', '3 < x < 1', '']) expect(readInequality(t), t).toBeNull()
  })
})

// ---- Pictures that must not move ---------------------------------------------------------------------------------------------------------

describe('pictures that are not crowded and have no inequality draw exactly as before P141', () => {
  const was = before as Record<string, string>
  for (const [name, spec] of Object.entries(NUMBER_LINES)) {
    test(`number line "${name}" is byte for byte the markup of the code before`, () => {
      expect(sha(renderToStaticMarkup(<NumberLine {...spec} />))).toBe(was[name])
    })
  }
  for (const [name, spec] of Object.entries(PLANES)) {
    test(`plane "${name}" is byte for byte the markup of the code before`, () => {
      expect(sha(renderToStaticMarkup(<CoordinatePlane {...spec} />))).toBe(was[name])
    })
  }
})

// ---- A lone x in a sentence ----------------------------------------------------------------------------------------------------------

const mathOf = (text: string, mode: 'all' | 'algebra' | 'force') => segments(text, mode).filter((s) => s.kind === 'math').map((s) => (s.kind === 'math' ? s.plain : ''))

describe('a lone variable letter in the words of a senior class is typeset as maths', () => {
  const CAPTION = 'The line y = 2x + 3 gives the value of 2x + 3 for every x, so the height of the line is that expression.'

  test('the live caption: the x of "for every x" is maths in a senior line, with the equations around it', () => {
    const parts = segments(CAPTION, 'all')
    expect(parts.filter((s) => s.kind === 'math').map((s) => (s.kind === 'math' ? s.plain : ''))).toEqual(['y = 2x + 3', '2x + 3', 'x'])
    expect(parts.map((s) => (s.kind === 'math' ? s.plain : s.text)).join('')).toBe(CAPTION)
    const x = parts.find((s) => s.kind === 'math' && s.plain === 'x')!
    expect(x.kind === 'math' && x.latex).toContain('x')
  })

  test('the same words in the mode of the primary classes and of plain text keep the x as a letter', () => {
    expect(mathOf(CAPTION, 'algebra')).not.toContain('x')
  })

  test('also in the mode where the line is known to be maths', () => {
    expect(mathOf('for every x, so', 'force')).toEqual(['x'])
    expect(mathOf('Solve for x.', 'all')).toEqual(['x'])
  })

  test('x, y, z and n: each is maths when it stands as its own word, with a space or a sign of punctuation round it', () => {
    expect(mathOf('Find x and y.', 'all')).toEqual(['x', 'y'])
    expect(mathOf('for x, y and z', 'all')).toEqual(['x', 'y', 'z'])
    expect(mathOf('the nth term, where n counts', 'all')).toEqual(['n'])
    expect(mathOf('What is x?', 'all')).toEqual(['x'])
    expect(mathOf('(x) is the unknown', 'all')).toEqual(['(x)'])
    expect(mathOf('x is the unknown', 'all')).toEqual(['x'])
  })

  test('the text around is kept exactly, spaces too', () => {
    const parts = segments('Find x and y.', 'all')
    expect(parts.map((s) => (s.kind === 'math' ? s.plain : s.text)).join('')).toBe('Find x and y.')
    expect(parts[0]).toEqual({ kind: 'text', text: 'Find ' })
  })

  test('the x-axis, the y-axis and the article "a" stay text', () => {
    expect(mathOf('Look at the x-axis and the y-axis.', 'all')).toEqual([])
    expect(mathOf('The graph crosses the x-axis', 'all')).toEqual([])
    expect(mathOf('Pick a number between 1 and 5', 'all')).toEqual([])
    expect(mathOf('a', 'all')).toEqual([])
    expect(mathOf('This is a good idea', 'all')).toEqual([])
  })

  test('other letters stay text: a capital, a letter that is not x y z n, a letter that is part of a word', () => {
    expect(mathOf('Plan X and plan B', 'all')).toEqual([])
    expect(mathOf('Point P and point q', 'all')).toEqual([])
    expect(mathOf('the box and the next one', 'all')).toEqual([])
    expect(mathOf('Step b of c', 'all')).toEqual([])
  })

  test('a times sign between numbers is still a times sign, and an equation is still one piece', () => {
    expect(mathOf('3 x 4 = 12', 'all')).toEqual(['3 x 4 = 12'])
    expect(mathOf('x + 3 = 5', 'all')).toEqual(['x + 3 = 5'])
  })

  test('the words alone: "a number" and "the x-axis" in a lesson line keep the words', () => {
    expect(segments('a number', 'all')).toEqual([{ kind: 'text', text: 'a number' }])
    expect(segments('the x-axis', 'all')).toEqual([{ kind: 'text', text: 'the x-axis' }])
  })
})
