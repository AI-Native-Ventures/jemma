import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'

// P192: the pictures of the "Shapes and position" board, drawn in a question and in the results. While a question is answered the words a screen reader says never
// give the answer away. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} />)
  return document.querySelector('svg[role="img"]')!
}

describe('a map on a grid', () => {
  const map: SeniorDiagramSpec = {
    kind: 'map_grid',
    cols: 6,
    rows: 5,
    places: [
      { name: 'Home', col: 0, row: 0, house: true },
      { name: 'School', col: 3, row: 2 },
      { name: 'Shop', col: 5, row: 1 },
      { name: 'Park', col: 4, row: 4 },
    ],
  }
  it('marks each place and names it under the map, the house drawn as a house', () => {
    const svg = draw(map)
    expect(svg.querySelectorAll('[data-place]')).toHaveLength(4)
    expect(svg.querySelectorAll('[data-house]')).toHaveLength(1)
    expect(svg.textContent).toBe('ScShPSc school   Sh shop   P park')
    expect(svg.getAttribute('aria-label')).toBe('A map on a grid of 6 by 5 squares, with the house, the school, the shop and the park on it.')
    expect(draw(map, 'card').getAttribute('aria-label')).toBe(
      'A map on a grid of 6 by 5 squares. The house is in column 1 and row 1, the school is in column 4 and row 3, the shop is in column 6 and row 2 and the park is in column 5 and row 5, counted from the bottom left.',
    )
  })
})

describe('a 3D object and a shape of cubes', () => {
  it('dashes the hidden edges and only names the object after', () => {
    const svg = draw({ kind: 'solid', shape: 'square_pyramid' })
    expect(svg.querySelectorAll('[data-hidden]')).toHaveLength(3)
    expect(svg.getAttribute('aria-label')).toBe('A 3D object. Its hidden edges are dashed.')
    expect(draw({ kind: 'solid', shape: 'square_pyramid' }, 'card').getAttribute('aria-label')).toBe('A square-based pyramid. Its hidden edges are dashed. It has 5 faces, 8 edges and 5 corners.')
    for (const shape of ['cube', 'cuboid', 'triangular_pyramid', 'triangular_prism', 'cylinder', 'cone', 'sphere'] as const) expect(draw({ kind: 'solid', shape }).querySelector('[data-hidden]')).not.toBeNull()
  })
  it('draws every cube of a shape of cubes', () => {
    const svg = draw({ kind: 'cube_stack', heights: [[1, 2, 0], [3, 1, 1]] })
    expect(svg.querySelectorAll('[data-cube]')).toHaveLength(8)
    expect(svg.getAttribute('aria-label')).toBe('A shape built from cubes, drawn in 3D.')
    expect(draw({ kind: 'cube_stack', heights: [[1, 2, 0], [3, 1, 1]] }, 'card').getAttribute('aria-label')).toBe('A shape built from 8 cubes, drawn in 3D.')
  })
})

describe('lines across a shape', () => {
  it('names the lines A to D and only says which is a line of symmetry after', () => {
    const heart: SeniorDiagramSpec = { kind: 'symmetry_lines', shape: 'heart', lines: ['vertical', 'horizontal', 'diagonal'] }
    const svg = draw(heart)
    expect([...svg.querySelectorAll('[data-line]')].map((g) => g.getAttribute('data-line'))).toEqual(['A', 'B', 'C'])
    expect(svg.textContent).toBe('ABC')
    expect(svg.getAttribute('aria-label')).toBe('A heart with three dashed lines across it: A goes straight down the middle, B goes straight across the middle and C slants down from the top left.')
    expect(draw(heart, 'card').getAttribute('aria-label')).toContain('Line A is a line of symmetry.')
    expect(draw({ kind: 'symmetry_lines', shape: 'square', lines: ['vertical', 'diagonal'] }, 'card').getAttribute('aria-label')).toContain('Lines A and B are lines of symmetry.')
  })
})
