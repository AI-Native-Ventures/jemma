import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'
import { QuestionPicture } from '../app/k/session/_parts/QuestionPicture'

// P196: angles in a circle, the CAST quadrants, an angle of elevation, a box cut from a card and the sizes of a 3D object, drawn in a question and in the results,
// and the formula sheet of a 3D object with its sizes. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} />)
  return document.querySelector('svg[role="img"]')!
}

describe('the pictures', () => {
  it('angles in a circle: the asked angle is x, and only said after', () => {
    const svg = draw({ kind: 'circle_angles', centre: 110, ask: 'circle' })
    expect(svg.querySelector('[data-centre-angle]')!.textContent).toBe('110°')
    expect(svg.querySelector('[data-circle-angle]')!.textContent).toBe('x')
    expect(svg.getAttribute('aria-label')).not.toContain('x is')
    expect(draw({ kind: 'circle_angles', centre: 110, ask: 'circle' }, 'card').getAttribute('aria-label')).toContain('x is 55°.')
  })

  it('CAST: the quadrant letters and the angle, its quadrant only after', () => {
    const svg = draw({ kind: 'cast', degrees: 150 })
    expect(svg.textContent).toBe('SATC150°')
    expect(svg.getAttribute('aria-label')).not.toContain('second quadrant')
    expect(draw({ kind: 'cast', degrees: 150 }, 'card').getAttribute('aria-label')).toContain('Its arm is in the second quadrant, S.')
  })

  it('a tower, a card and a cone with their labels', () => {
    expect(draw({ kind: 'elevation', ground: '80 m', angle: '30°', height: 'h' }).textContent).toBe('30°80 mhABC')
    expect(draw({ kind: 'cut_box', side: '30 cm' }).querySelectorAll('[data-cut]')).toHaveLength(4)
    const cone = draw({ kind: 'solid', shape: 'cone', sizes: { radius: '3 cm', height: '4 cm', slant: '5 cm' } })
    expect([...cone.querySelectorAll('[data-size]')].map((t) => t.textContent)).toEqual(['4 cm', '3 cm', '5 cm'])
    expect(cone.getAttribute('aria-label')).toBe('A 3D object. The hidden part of its edge is dashed. Its sizes: radius 3 cm, height 4 cm and slant height 5 cm.')
  })
})

describe('the formula sheet', () => {
  it('opens and closes on a 3D object with its sizes, while the question is answered', () => {
    document.body.innerHTML = ''
    render(<QuestionPicture spec={{ kind: 'solid', shape: 'cone', sizes: { radius: '3 cm' } }} />)
    const button = screen.getByRole('button', { name: 'Formula sheet' })
    fireEvent.click(button)
    expect(document.body.textContent).toContain('A = πr² + πrs')
    fireEvent.click(screen.getByRole('button', { name: 'Close the formula sheet' }))
    expect(document.body.textContent).not.toContain('A = πr² + πrs')
  })

  it('is not there without sizes, nor in the results', () => {
    document.body.innerHTML = ''
    render(<QuestionPicture spec={{ kind: 'solid', shape: 'cone' }} />)
    expect(document.querySelector('[data-formula-sheet]')).toBeNull()
    document.body.innerHTML = ''
    render(<QuestionPicture spec={{ kind: 'solid', shape: 'cone', sizes: { radius: '3 cm' } }} variant="card" />)
    expect(document.querySelector('[data-formula-sheet]')).toBeNull()
  })
})
