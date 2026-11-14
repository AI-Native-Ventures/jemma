import { renderToStaticMarkup } from 'react-dom/server'
import type { CoordinatePlaneSpec, SeniorDiagramSpec, TriangleSpec } from '@jemma/profiling/schemas'
import { describe, expect, test } from 'vitest'
import { CoordinatePlane, DiagramView, Triangle } from '@/components/diagrams'

// P87, decision 1: the two new pictures, drawn by code from a few numbers. react-dom/server only: no browser.

const html = (node: React.ReactElement) => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(node)
  return box
}
const plane = (over: Partial<CoordinatePlaneSpec> = {}): CoordinatePlaneSpec => ({ kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, ...over })
const triangle = (over: Partial<TriangleSpec> = {}): TriangleSpec => ({ kind: 'triangle', vertices: ['A', 'B', 'C'], ...over })
const label = (box: HTMLElement) => box.querySelector('svg')!.getAttribute('aria-label')!
const texts = (box: HTMLElement, selector: string) => Array.from(box.querySelectorAll(selector)).map((t) => t.textContent)
const MINUS = '−'

describe('CoordinatePlane: the frame', () => {
  test('one image with a spoken description, a light grid, the axes and x and y named at the ends', () => {
    const box = html(<CoordinatePlane {...plane()} />)
    expect(box.querySelectorAll('svg[role="img"]')).toHaveLength(1)
    expect(label(box)).toBe('A grid from -5 to 5')
    expect(texts(box, '[data-axis]').sort()).toEqual(['x', 'y'])
    expect(box.querySelectorAll('line[data-grid]').length).toBeGreaterThanOrEqual(18)
    expect(box.querySelectorAll('[data-axis-line]')).toHaveLength(2)
  })

  test('numbers every step along each axis, with a true minus sign, and 0 once', () => {
    const box = html(<CoordinatePlane {...plane()} />)
    expect(texts(box, '[data-tick="x"]').sort()).toEqual(['1', '2', '3', '4', '5', `${MINUS}1`, `${MINUS}2`, `${MINUS}3`, `${MINUS}4`, `${MINUS}5`].sort())
    expect(texts(box, '[data-tick="y"]')).toHaveLength(10)
    expect(texts(box, '[data-zero]')).toEqual(['0'])
  })

  test('at most 10 numbers an axis, whatever the frame; a step the model gave is used', () => {
    const wide = html(<CoordinatePlane {...plane({ xMin: -100, xMax: 100, yMin: -3, yMax: 8 })} />)
    expect(texts(wide, '[data-tick="x"]').length).toBeLessThanOrEqual(10)
    expect(texts(wide, '[data-tick="y"]').length).toBeLessThanOrEqual(10)
    const given = html(<CoordinatePlane {...plane({ step: 2.5 })} />)
    expect(texts(given, '[data-tick="x"]').sort()).toEqual(['2,5', '5', `${MINUS}2,5`, `${MINUS}5`].sort())
  })

  test('the axes meet at the origin, or at the edge of the frame when the origin is not in it', () => {
    const centred = html(<CoordinatePlane {...plane()} />)
    expect(centred.querySelector('[data-axis-line="y"]')!.getAttribute('x1')).toBe(centred.querySelector('[data-axis-line="y"]')!.getAttribute('x2'))
    const away = html(<CoordinatePlane {...plane({ xMin: 10, xMax: 20, yMin: 100, yMax: 150 })} />)
    expect(label(away)).toBe('A grid from 10 to 20 across and from 100 to 150 up')
    expect(texts(away, '[data-zero]')).toEqual([])
    expect(texts(away, '[data-tick="x"]').length).toBeGreaterThan(0)
  })
})

describe('CoordinatePlane: graphs', () => {
  const pieces = (box: HTMLElement, i = 0) => box.querySelectorAll(`path[data-graph="${i}"]`)

  test('a line is one piece, with a description that says which line (on a card)', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'line', m: 2, c: 1 }] })} />)
    expect(pieces(box)).toHaveLength(1)
    expect(label(box)).toBe('A grid from -5 to 5 with the line y = 2x + 1')
  })

  test('a parabola is one piece', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'parabola', a: 1, q: -2 }] })} />)
    expect(pieces(box)).toHaveLength(1)
    expect(label(box)).toBe('A grid from -5 to 5 with the curve y = x^2 - 2')
  })

  test('a hyperbola is broken at its asymptote: two pieces', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'hyperbola', a: 1 }] })} />)
    expect(pieces(box)).toHaveLength(2)
    // no piece crosses the vertical axis (x = 0 is at 160 + 0.5 * plot width: the two pieces are on its two sides)
    const mid = Number(box.querySelector('[data-axis-line="y"]')!.getAttribute('x1'))
    const xsOf = (el: Element) => Array.from(el.getAttribute('d')!.matchAll(/[ML]([\d.]+) /g)).map((m) => Number(m[1]))
    const [left, right] = Array.from(pieces(box))
    expect(Math.max(...xsOf(left!))).toBeLessThan(mid)
    expect(Math.min(...xsOf(right!))).toBeGreaterThan(mid)
  })

  test('an exponential is one piece, and one that leaves the frame stops at its edge', () => {
    const box = html(<CoordinatePlane {...plane({ xMin: -3, xMax: 5, yMin: -1, yMax: 10, graphs: [{ type: 'exponential', a: 1, b: 2 }] })} />)
    expect(pieces(box)).toHaveLength(1)
    expect(label(box)).toBe('A grid from -3 to 5 across and from -1 to 10 up with the curve y = 2^x')
  })

  test('sin and tan are drawn in degrees: sin from -360 to 360 is one piece, tan from -180 to 180 is three', () => {
    const sin = html(<CoordinatePlane {...plane({ xMin: -360, xMax: 360, yMin: -2, yMax: 2, graphs: [{ type: 'trig', fn: 'sin' }] })} />)
    expect(pieces(sin)).toHaveLength(1)
    const tan = html(<CoordinatePlane {...plane({ xMin: -180, xMax: 180, yMin: -5, yMax: 5, graphs: [{ type: 'trig', fn: 'tan' }] })} />)
    expect(pieces(tan)).toHaveLength(3)
    expect(label(tan)).toContain('y = tan x')
  })

  test('up to three graphs, each its own colour, each described', () => {
    const box = html(
      <CoordinatePlane {...plane({ graphs: [{ type: 'line', m: 1, c: 0, label: 'f' }, { type: 'line', m: -1, c: 2 }, { type: 'parabola', a: 0.5 }] })} />,
    )
    const stroke = (i: number) => pieces(box, i)[0]!.getAttribute('stroke')
    expect(new Set([stroke(0), stroke(1), stroke(2)]).size).toBe(3)
    expect(label(box)).toBe('A grid from -5 to 5 with the line y = x (f), the line y = -x + 2 and the curve y = 0,5x^2')
    expect(texts(box, '[data-graph-label]')).toEqual(['f'])
  })

  test('a graph that is entirely outside the frame draws nothing and breaks nothing', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'line', m: 0, c: 40 }] })} />)
    expect(pieces(box)).toHaveLength(0)
    expect(box.querySelector('svg')).not.toBeNull()
  })
})

describe('CoordinatePlane: points', () => {
  test('a dot for each point inside the frame, with its label; a point outside is not drawn', () => {
    const box = html(<CoordinatePlane {...plane({ points: [{ x: 1, y: 2, label: 'A' }, { x: -3, y: 4 }, { x: 9, y: 9, label: 'Z' }] })} />)
    expect(box.querySelectorAll('circle[data-point]')).toHaveLength(2)
    expect(texts(box, '[data-point-label]')).toEqual(['A'])
    expect(label(box)).toBe('A grid from -5 to 5. Points: A (1; 2), (-3; 4), Z (9; 9).')
  })
})

describe('the description of a picture in a question does not give the answer away', () => {
  test('no equation, no coordinates: what can be seen, and the labels', () => {
    const spec = plane({ points: [{ x: 1, y: 2, label: 'A' }, { x: 2, y: 2 }], graphs: [{ type: 'line', m: 2, c: 1, label: 'f' }, { type: 'parabola', a: 1 }] })
    const box = html(<CoordinatePlane {...spec} variant="question" />)
    expect(label(box)).toBe('A grid from -5 to 5 with a straight line labelled f and a curve. Points: A and 1 more.')
    expect(label(box)).not.toMatch(/y =|\(1; 2\)|2x/)
  })

  test('the frame alone has no graphs and no points to say', () => {
    expect(label(html(<CoordinatePlane {...plane()} variant="question" />))).toBe('A grid from -5 to 5')
  })
})

describe('Triangle', () => {
  const right = triangle({ angles: [90, 60, 30], sides: ['5 cm', '', 'x'], angleLabels: ['', '60°', 'y'] })

  test('90, 60, 30: a right-angle mark, the names, the side and angle labels, one image', () => {
    const box = html(<Triangle {...right} />)
    expect(box.querySelectorAll('svg[role="img"]')).toHaveLength(1)
    expect(box.querySelectorAll('path[data-mark="right"]')).toHaveLength(1)
    expect(texts(box, '[data-vertex]')).toEqual(['A', 'B', 'C'])
    expect(texts(box, '[data-side]')).toEqual(['5 cm', 'x'])
    expect(texts(box, '[data-angle]')).toEqual(['60°', 'y'])
    expect(box.querySelectorAll('polygon, path[data-shape]')).toHaveLength(1)
  })

  test('the right-angle mark is at the corner that has it', () => {
    for (const [at, vertices] of [[0, ['P', 'Q', 'R']], [1, ['P', 'Q', 'R']], [2, ['P', 'Q', 'R']]] as const) {
      const angles = [60, 60, 60]
      angles[at] = 90
      angles[(at + 1) % 3] = 55
      angles[(at + 2) % 3] = 35
      const box = html(<Triangle {...triangle({ vertices: [...vertices], angles, rightAngleAt: at })} />)
      expect(box.querySelectorAll('path[data-mark="right"]')).toHaveLength(1)
      expect(box.querySelector('path[data-mark="right"]')!.getAttribute('data-corner')).toBe(String(at))
    }
  })

  test('an angle of 90 in the angles shows the mark even when rightAngleAt is not given; no 90, no mark', () => {
    expect(html(<Triangle {...triangle({ angles: [90, 45, 45] })} />).querySelectorAll('path[data-mark="right"]')).toHaveLength(1)
    expect(html(<Triangle {...triangle({ angles: [50, 60, 70] })} />).querySelectorAll('path[data-mark="right"]')).toHaveLength(0)
    expect(html(<Triangle {...triangle()} />).querySelectorAll('path[data-mark="right"]')).toHaveLength(0)
  })

  test('the angles are never written unless the model gave a label for them', () => {
    const box = html(<Triangle {...triangle({ angles: [90, 60, 30] })} />)
    expect(texts(box, '[data-angle]')).toEqual([])
    expect(box.textContent).not.toMatch(/90|60|30/)
  })

  test('the spoken description is what can be seen: names, the right angle, the labels', () => {
    expect(label(html(<Triangle {...right} />))).toBe('Triangle ABC. Right angle at A. Angle B is 60°. Angle C is y. Side AB is 5 cm. Side CA is x.')
    expect(label(html(<Triangle {...triangle()} />))).toBe('Triangle ABC.')
  })

  test('it never throws on a triangle that makes no sense: three names are still drawn', () => {
    expect(() => html(<Triangle {...triangle({ angles: [90, 90, 90] })} />)).not.toThrow()
    expect(texts(html(<Triangle {...triangle({ angles: [10, 10, 10] })} />), '[data-vertex]')).toEqual(['A', 'B', 'C'])
  })
})

describe('DiagramView draws the two new kinds, and shows "Picture missing" for one that makes no sense', () => {
  test('a coordinate plane and a triangle', () => {
    const a = html(<DiagramView spec={plane({ graphs: [{ type: 'line', m: 1, c: 0 }] })} />)
    expect(label(a)).toContain('with the line y = x')
    expect(a.querySelectorAll('path[data-graph]')).toHaveLength(1)
    const b = html(<DiagramView spec={triangle({ angles: [90, 60, 30] })} />)
    expect(b.querySelectorAll('path[data-mark="right"]')).toHaveLength(1)
  })

  test('the variant "question" gives the plain description', () => {
    const spec: SeniorDiagramSpec = plane({ graphs: [{ type: 'line', m: 2, c: 1 }] })
    expect(label(html(<DiagramView spec={spec} variant="question" />))).toBe('A grid from -5 to 5 with a straight line')
    expect(label(html(<DiagramView spec={spec} variant="learn" />))).toBe('A grid from -5 to 5 with the line y = 2x + 1')
  })

  test.each([
    ['a frame upside down', plane({ xMin: 5, xMax: -5 })],
    ['four graphs', plane({ graphs: Array.from({ length: 4 }, () => ({ type: 'line' as const, m: 1, c: 0 })) })],
    ['a triangle of angles that add up to 190', triangle({ angles: [90, 60, 40] })],
    ['a triangle with two names', triangle({ vertices: ['A', 'B'] })],
  ])('%s', (_name, spec) => {
    const box = html(<DiagramView spec={spec} />)
    expect(box.textContent).toContain('Picture missing')
  })

  test('the old kinds are drawn as before', () => {
    const box = html(<DiagramView spec={{ kind: 'area_model', rows: 3, cols: 4, shaded: 12 }} />)
    expect(box.textContent).toContain('3 × 4 = 12')
  })
})
