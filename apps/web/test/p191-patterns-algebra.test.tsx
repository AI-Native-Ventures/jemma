import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import type { Notation } from '@jemma/profiling/logic'
import { DiagramView } from '../components/diagrams'

// P191: the pictures of the "Patterns, algebra and graphs" board, drawn in a question and in the results. While a question is answered the words a screen reader
// says never give the answer away. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question', notation: Notation = 'za') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} notation={notation} />)
  return document.querySelector('svg[role="img"]')!
}

describe('a growing pattern of tiles', () => {
  it('draws each pattern with its tiles and its name', () => {
    const svg = draw({ kind: 'tile_pattern', shape: 'L', show: 3 })
    expect(svg.querySelectorAll('[data-pattern]')).toHaveLength(3)
    expect(svg.querySelectorAll('[data-pattern="3"] [data-tile]')).toHaveLength(7)
    expect(svg.textContent).toBe('Pattern 1Pattern 2Pattern 3')
    expect(svg.getAttribute('aria-label')).toBe('A growing pattern of tiles: pattern 1 has 3 tiles, pattern 2 has 5 and pattern 3 has 7, in the shape of an L.')
  })
})

describe('a flow diagram', () => {
  const flow: SeniorDiagramSpec = { kind: 'flow_diagram', rule: [{ op: 'multiply', by: 4 }, { op: 'add', by: 1 }], inputs: [3, 5, 7], blanks: [2, 3] }
  it('the steps in green boxes, and the blanks as gold question marks', () => {
    const svg = draw(flow)
    expect(svg.querySelectorAll('[data-step]')).toHaveLength(2)
    expect(svg.querySelectorAll('[data-blank]')).toHaveLength(2)
    expect(svg.textContent).toContain('× 4')
    expect(svg.textContent).toContain('13')
    expect(svg.textContent).not.toContain('21')
    expect(svg.getAttribute('aria-label')).toBe('A flow diagram: the inputs 3, 5 and 7 go through times 4, then plus 1, to the outputs 13, a blank and a blank.')
    expect(draw(flow, 'card').getAttribute('aria-label')).toBe('A flow diagram: the inputs 3, 5 and 7 go through times 4, then plus 1, to the outputs 13, 21 and 29.')
  })
})

describe('a balance scale', () => {
  it('holds the bags and the weights, and only says what a bag weighs after', () => {
    const scale: SeniorDiagramSpec = { kind: 'balance', left: { x: 2, n: 3 }, right: { x: 0, n: 11 } }
    const svg = draw(scale)
    expect(svg.querySelectorAll('[data-bag]')).toHaveLength(2)
    expect(svg.querySelectorAll('[data-weight="1"]')).toHaveLength(3)
    expect(svg.querySelectorAll('[data-weight="11"]')).toHaveLength(1)
    expect(svg.getAttribute('aria-label')).toBe('A balance scale. The left pan has two bags of x and 3 small weights of 1. The right pan has a weight of 11. The scale balances.')
    expect(draw(scale, 'card').getAttribute('aria-label')).toContain('Each bag is 4.')
  })
})

describe('a graph of a trip', () => {
  const trip: SeniorDiagramSpec = {
    kind: 'travel_graph',
    points: [
      { t: 0, d: 0 },
      { t: 10, d: 1.5 },
      { t: 20, d: 1.5 },
      { t: 30, d: 3 },
    ],
    tMax: 30,
    dMax: 3,
    tStep: 5,
    dStep: 0.5,
    tUnit: 'min',
    dUnit: 'km',
  }
  it('numbers its grid in the notation of the space, and only walks the line after', () => {
    expect(draw(trip).textContent).toContain('1,5')
    expect(draw(trip, 'question', 'us').textContent).toContain('1.5')
    expect(draw(trip).querySelector('[data-trip]')!.getAttribute('points')!.split(' ')).toHaveLength(4)
    expect(draw(trip).getAttribute('aria-label')).toBe('A distance and time graph of a trip, with time in minutes up to 30 and distance in km up to 3.')
    expect(draw(trip, 'card').getAttribute('aria-label')).toBe(
      'A distance and time graph of a trip, with time in minutes up to 30 and distance in km up to 3. The line goes from 0 km at 0 min to 1,5 km at 10 min, 1,5 km at 20 min, then 3 km at 30 min.',
    )
  })
})
