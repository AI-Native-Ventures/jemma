import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'

// P193: the pictures of the "Angles and transformations" board, drawn in a question and in the results. While a question is answered the words a screen reader says
// never give the size, the kind or the factor that is the answer. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} />)
  return document.querySelector('svg[role="img"]')!
}

describe('an angle and a protractor', () => {
  it('an arc for an angle, a square for a right angle, and only its size after', () => {
    expect(draw({ kind: 'angle', degrees: 130 }).querySelector('[data-arc]')).not.toBeNull()
    expect(draw({ kind: 'angle', degrees: 90 }).querySelector('[data-right]')).not.toBeNull()
    expect(draw({ kind: 'angle', degrees: 130 }).getAttribute('aria-label')).toBe('An angle between two arms, with an arc on the side it is measured.')
    expect(draw({ kind: 'angle', degrees: 130 }, 'card').getAttribute('aria-label')).toBe('An angle of 130°, an obtuse angle.')
    expect(draw({ kind: 'angle', degrees: 250, label: 'y' }).textContent).toBe('y')
  })
  it('a protractor numbers every 30 degrees and only says the reading after', () => {
    const svg = draw({ kind: 'protractor', degrees: 125 })
    expect(svg.textContent).toBe('0306090120150180')
    expect(svg.getAttribute('aria-label')).toBe('A protractor over an angle. One arm is on 0.')
    expect(draw({ kind: 'protractor', degrees: 125 }, 'card').getAttribute('aria-label')).toContain('crosses the scale at 125.')
  })
})

describe('parallel lines', () => {
  const lines: SeniorDiagramSpec = {
    kind: 'parallel_lines',
    acute: 65,
    marks: [
      { line: 'AB', corner: 'above_right', label: '65°' },
      { line: 'CD', corner: 'above_right', label: 'x' },
    ],
  }
  it('marks each corner with an arc and its label, and only says what x is after', () => {
    const svg = draw(lines)
    expect([...svg.querySelectorAll('[data-mark]')].map((g) => g.getAttribute('data-mark'))).toEqual(['65°', 'x'])
    expect(svg.textContent).toBe('65°xABCD')
    expect(svg.getAttribute('aria-label')).toBe(
      'Two parallel lines AB and CD cut by a slanted line. 65° is above the line and to the right of the crossing at AB and x is above the line and to the right of the crossing at CD.',
    )
    expect(draw(lines, 'card').getAttribute('aria-label')).toContain('x is 65°.')
  })
})

describe('an enlargement', () => {
  it('the small shape and the big one on a grid, and only the factor after', () => {
    const spec: SeniorDiagramSpec = { kind: 'enlargement', shape: 'rectangle', w: 2, h: 1, factor: 3, sizes: true }
    const svg = draw(spec)
    expect(svg.querySelectorAll('[data-shape]')).toHaveLength(2)
    expect(svg.textContent).toBe('2 by 16 by 3')
    expect(svg.getAttribute('aria-label')).toBe('A small rectangle and a big rectangle on a grid of squares: the small one is 2 by 1 squares and the big one 6 by 3.')
    expect(draw(spec, 'card').getAttribute('aria-label')).toContain('3 times as big.')
    expect(draw({ ...spec, sizes: false } as SeniorDiagramSpec).getAttribute('aria-label')).toBe('A small rectangle and a big rectangle on a grid of squares.')
  })
})
