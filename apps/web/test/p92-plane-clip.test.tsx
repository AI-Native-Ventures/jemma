import { renderToStaticMarkup } from 'react-dom/server'
import type { CoordinatePlaneSpec } from '@jemma/profiling/schemas'
import { describe, expect, test } from 'vitest'
import { CoordinatePlane } from '@/components/diagrams'

// P92: a graph's line stays inside its grid. Every curve and every point marker is drawn inside a group that is clipped to the plot rectangle
// (an SVG clipPath, one id for each drawing); the axis numbers, the axis names and the labels are not clipped. react-dom/server only: no browser.

const html = (node: React.ReactElement) => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(node)
  return box
}
const plane = (over: Partial<CoordinatePlaneSpec> = {}): CoordinatePlaneSpec => ({ kind: 'coordinate_plane', xMin: -2, xMax: 5, yMin: -1, yMax: 8, ...over })
/** The plot area of the drawing: the white rectangle that frames the grid. */
const plot = (box: HTMLElement) => box.querySelector('svg > rect')!
const num = (el: Element, name: string) => Number(el.getAttribute(name))
/** The id a `clip-path="url(#...)"` points at. */
const refOf = (el: Element) => /^url\(#(.+)\)$/.exec(el.getAttribute('clip-path') ?? '')?.[1] ?? null
const clipped = (box: HTMLElement) => [...box.querySelectorAll('[clip-path]')]

describe('CoordinatePlane: the graph stays in its grid', () => {
  const line = plane({ graphs: [{ type: 'line', m: 2, c: 3, label: 'f' }], points: [{ x: 1, y: 5, label: 'A' }, { x: -2, y: -1 }] })

  test('a line is drawn inside a clip-path that points at a clipPath of the plot rectangle', () => {
    const box = html(<CoordinatePlane {...line} />)
    const path = box.querySelector('path[data-graph="0"]')!
    const group = path.closest('[clip-path]')!
    expect(group, 'the line has a clipped group around it').not.toBeNull()
    const id = refOf(group)!
    expect(id).toBeTruthy()
    const clip = box.querySelector(`clipPath[id="${id}"]`)!
    expect(clip, 'the clip-path points at a clipPath that exists').not.toBeNull()
    const rect = clip.querySelector('rect')!
    const frame = plot(box)
    for (const attr of ['x', 'y', 'width', 'height']) expect(num(rect, attr), `clip ${attr}`).toBe(num(frame, attr))
  })

  test('every point marker is inside the clipped group too', () => {
    const box = html(<CoordinatePlane {...line} />)
    const dots = box.querySelectorAll('circle[data-point]')
    expect(dots).toHaveLength(2)
    for (const dot of dots) expect(dot.closest('[clip-path]'), 'a marker outside the clip').not.toBeNull()
  })

  test('the axis numbers, the axis names, the zero and the labels are outside every clipped group', () => {
    const box = html(<CoordinatePlane {...line} />)
    const outside = box.querySelectorAll('[data-tick], [data-zero], [data-axis], [data-graph-label], [data-point-label]')
    expect(outside.length).toBeGreaterThan(8)
    for (const el of outside) expect(el.closest('[clip-path]'), `${el.getAttribute('data-tick') ?? el.textContent} is clipped`).toBeNull()
    expect(box.querySelectorAll('[data-graph-label]')).toHaveLength(1)
    expect(box.querySelectorAll('[data-point-label]')).toHaveLength(1)
  })

  test('the clipped groups hold only graphs and markers, nothing else', () => {
    const box = html(<CoordinatePlane {...line} />)
    for (const group of clipped(box)) {
      const inner = [...group.querySelectorAll('*')].filter((el) => el.tagName !== 'g')
      expect(inner.length).toBeGreaterThan(0)
      for (const el of inner) expect(el.matches('path[data-graph], circle[data-point]'), el.outerHTML).toBe(true)
    }
  })

  test('two planes on one page have different clipPath ids, and each group points at its own', () => {
    const both = html(
      <>
        <CoordinatePlane {...line} />
        <CoordinatePlane {...line} />
      </>,
    )
    const ids = [...both.querySelectorAll('clipPath')].map((c) => c.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    const svgs = both.querySelectorAll('svg')
    svgs.forEach((svg, i) => {
      const refs = new Set([...svg.querySelectorAll('[clip-path]')].map(refOf))
      expect([...refs]).toEqual([ids[i]])
    })
  })

  test('a plane with no graph and no point still draws and breaks nothing', () => {
    const box = html(<CoordinatePlane {...plane()} />)
    expect(box.querySelector('svg')).not.toBeNull()
    for (const group of clipped(box)) expect(refOf(group)).toBeTruthy()
  })
})

describe('CoordinatePlane: a graph label sits inside the grid', () => {
  const inside = (box: HTMLElement, el: Element) => {
    const frame = plot(box)
    const left = num(frame, 'x')
    const right = left + num(frame, 'width')
    const top = num(frame, 'y')
    const bottom = top + num(frame, 'height')
    const x = num(el, 'x')
    const y = num(el, 'y')
    // A rough width of the words (14 px bold, about 8.7 px a letter) lets us check the far end of the text too.
    const width = (el.textContent ?? '').length * 8.7
    const anchor = el.getAttribute('text-anchor')
    const from = anchor === 'end' ? x - width : x
    const to = anchor === 'end' ? x : x + width
    expect(from, `${el.textContent} starts inside`).toBeGreaterThanOrEqual(left)
    expect(to, `${el.textContent} ends inside`).toBeLessThanOrEqual(right)
    expect(y, `${el.textContent} is below the top`).toBeGreaterThanOrEqual(top)
    expect(y, `${el.textContent} is above the bottom`).toBeLessThanOrEqual(bottom)
  }

  test('a short label on a line that ends at the right edge, at the top, at the bottom', () => {
    for (const g of [
      { type: 'line', m: 2, c: 3, label: 'f' },
      { type: 'line', m: -2, c: 3, label: 'g' },
      { type: 'line', m: 0, c: 8, label: 'h' },
      { type: 'line', m: 0, c: -1, label: 'k' },
    ] as const) {
      const box = html(<CoordinatePlane {...plane({ graphs: [g] })} />)
      inside(box, box.querySelector('[data-graph-label]')!)
    }
  })

  test('a long label (an equation) is moved to stay inside the grid', () => {
    for (const label of ['y = 2x + 3', 'the line y = x + 1']) {
      // A shallow line ends at the right edge; a steep one ends at the top, a little left of the 70 percent mark (where the label used to start rightwards).
      for (const [m, c] of [[0.4, -1], [0.4, 0], [0.4, 4], [3, 0], [-3, 0]] as const) {
        const box = html(<CoordinatePlane {...plane({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m, c, label }] })} />)
        inside(box, box.querySelector('[data-graph-label]')!)
      }
    }
  })
})
