import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import type { Notation } from '@jemma/profiling/logic'
import { DiagramView } from '../components/diagrams'
import { graphEquation, graphValue } from '../components/diagrams/plane-math'

// P195: a cubic, a log graph, a dashed line, circles, a shape of points and the angle of a line on a coordinate plane, and a point with its angle. While a question
// is answered the words a screen reader says never give an equation or a coordinate that may be the answer. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question', notation: Notation = 'za') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} notation={notation} />)
  return document.querySelector('svg[role="img"]')!
}

const plane = (over: object): SeniorDiagramSpec => ({ kind: 'coordinate_plane', xMin: -5, xMax: 6, yMin: -5, yMax: 6, ...over }) as SeniorDiagramSpec

describe('graphs on a grid', () => {
  it('a cubic and a log graph are sampled and said on a card', () => {
    expect(graphValue({ type: 'cubic', a: 1, b: -3, c: -1, d: 3 }, 2)).toBe(-3)
    expect(graphEquation({ type: 'cubic', a: 1, b: -3, c: -1, d: 3 })).toBe('y = x^3 - 3x^2 - x + 3')
    expect(graphEquation({ type: 'log', base: 2 })).toBe('y = log_2 x')
    const svg = draw(plane({ graphs: [{ type: 'cubic', a: 1, b: -3, c: -1, d: 3 }] }))
    expect(svg.querySelectorAll('[data-graph]').length).toBeGreaterThan(0)
    expect(svg.getAttribute('aria-label')).toContain('with a curve')
    expect(draw(plane({ graphs: [{ type: 'cubic', a: 1, b: -3, c: -1, d: 3 }] }), 'card').getAttribute('aria-label')).toContain('y = x^3 - 3x^2 - x + 3')
  })

  it('a dashed line is dashed', () => {
    const svg = draw(plane({ graphs: [{ type: 'line', m: 1, c: 0, dashed: true }] }))
    expect(svg.querySelector('[data-graph="0"]')!.getAttribute('stroke-dasharray')).toBe('7 5')
  })

  it('a circle, a shape and the angle of a line, said only after where a coordinate may be the answer', () => {
    const circle = plane({ circles: [{ a: 1, b: -1, r: 3 }] })
    expect(draw(circle).querySelector('[data-circle="0"]')).not.toBeNull()
    expect(draw(circle).getAttribute('aria-label')).toBe('A grid from -5 to 6 with a circle')
    expect(draw(circle, 'card').getAttribute('aria-label')).toContain('a circle with centre (1; -1) and radius 3')
    expect(draw(circle, 'card', 'us').getAttribute('aria-label')).toContain('a circle with centre (1, -1) and radius 3')
    const shape = plane({ polygon: true, points: [{ x: -3, y: -1, label: 'A' }, { x: 1, y: -2, label: 'B' }, { x: 3, y: 2, label: 'C' }] })
    expect(draw(shape).querySelector('[data-polygon]')).not.toBeNull()
    expect(draw(shape).getAttribute('aria-label')).toContain('The points are joined in order into a shape')
    const tilt = plane({ graphs: [{ type: 'line', m: 1.732, c: 1 }], inclination: { label: 'θ' } })
    expect(draw(tilt).querySelector('[data-inclination]')!.textContent).toBe('θ')
    expect(draw(tilt).getAttribute('aria-label')).toContain('The angle θ between the line and the x-axis is marked.')
  })
})

describe('a point and its angle', () => {
  it('joins the point to the origin, marks θ and drops a dashed line, in the notation of the space', () => {
    const svg = draw({ kind: 'point_angle', x: -3, y: 4 })
    expect(svg.querySelector('[data-angle]')).not.toBeNull()
    expect(svg.querySelector('[data-drop]')).not.toBeNull()
    expect(svg.textContent).toContain('P(−3; 4)')
    expect(draw({ kind: 'point_angle', x: -3, y: 4 }, 'question', 'us').textContent).toContain('P(−3, 4)')
    expect(draw({ kind: 'point_angle', x: -3, y: 4 }, 'card').getAttribute('aria-label')).toContain('P is 5 from the origin.')
  })
})
