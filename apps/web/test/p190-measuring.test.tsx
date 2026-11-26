import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import type { Notation } from '@jemma/profiling/logic'
import { DiagramView } from '../components/diagrams'

// P190: the pictures of the "Measuring" board, drawn in a question and in the results, in the notation of the space. While a question is answered the words a
// screen reader says never give the reading. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question', notation: Notation = 'za') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} notation={notation} />)
  return document.querySelector('svg[role="img"]')!
}

describe('a ruler', () => {
  it('numbers each centimetre and only says where the pencil ends after', () => {
    const svg = draw({ kind: 'ruler', to: 10, length: 9 })
    expect(svg.textContent).toBe('012345678910cm')
    expect(svg.getAttribute('aria-label')).toBe('A pencil above a ruler in centimetres, from 0 to 10.')
    expect(draw({ kind: 'ruler', to: 15, from: 2, length: 6.5, thing: 'crayon' }, 'card').getAttribute('aria-label')).toBe(
      'A crayon above a ruler. It starts at 2 and ends at 8,5 centimetres, so it is 6,5 cm long.',
    )
  })
  it('in inches, with quarter marks', () => {
    const svg = draw({ kind: 'ruler', unit: 'in', to: 6, from: 1, length: 2.75, thing: 'ribbon' }, 'card', 'us')
    expect(svg.querySelectorAll('line').length).toBeGreaterThanOrEqual(25)
    expect(svg.getAttribute('aria-label')).toBe('A ribbon above a ruler. It starts at 1 and ends at 3.75 inches, so it is 2.75 in long.')
  })
})

describe('a kitchen scale and a jug', () => {
  it('a dial in 20 steps with a number every 4, in the notation of the space', () => {
    const svg = draw({ kind: 'scale_dial', max: 2, value: 1.5, unit: 'kg' }, 'question', 'us')
    expect(svg.textContent).toBe('00.40.81.21.62kilograms')
    expect(svg.querySelector('[data-needle]')).not.toBeNull()
    expect(svg.getAttribute('aria-label')).toBe('A kitchen scale. The dial goes from 0 to 2 kilograms.')
    expect(draw({ kind: 'scale_dial', max: 1000, value: 650, unit: 'g' }, 'card').getAttribute('aria-label')).toBe('A kitchen scale. The dial goes from 0 to 1000 grams. The needle points to 650 g.')
  })
  it('a jug marked in 10 steps with water up to the reading', () => {
    const svg = draw({ kind: 'jug', max: 1000, value: 700, unit: 'ml' })
    expect(svg.textContent).toBe('2004006008001000ml')
    expect(svg.querySelector('[data-water]')).not.toBeNull()
    expect(svg.getAttribute('aria-label')).toBe('A measuring jug marked in millilitres up to 1000.')
    expect(draw({ kind: 'jug', max: 2, value: 1.4, unit: 'l' }, 'card').getAttribute('aria-label')).toBe('A measuring jug marked in litres up to 2. The water is at 1,4 l.')
  })
})

describe('a thermometer', () => {
  it('numbers every 10, below zero too, and says minus for a screen reader', () => {
    const svg = draw({ kind: 'thermometer', min: -20, max: 10, value: -7 }, 'card')
    expect(svg.textContent).toBe('−20−10010°C')
    expect(svg.getAttribute('aria-label')).toBe('A thermometer from minus 20 to 10 degrees Celsius. The red line is at minus 7 degrees.')
    expect(draw({ kind: 'thermometer', min: 0, max: 100, value: 70, unit: 'F' }).getAttribute('aria-label')).toBe('A thermometer from 0 to 100 degrees Fahrenheit.')
  })
})

describe('a box of cubes and the net of a box', () => {
  it('the cubes are drawn in 3D and only counted after', () => {
    const svg = draw({ kind: 'cubes', long: 4, wide: 3, high: 2 })
    expect(svg.querySelectorAll('[data-face]')).toHaveLength(3)
    expect(svg.getAttribute('aria-label')).toBe('A box built from cubes, drawn in 3D.')
    expect(draw({ kind: 'cubes', long: 4, wide: 3, high: 2 }, 'card').getAttribute('aria-label')).toBe('A box built from cubes: 4 long, 3 wide and 2 high, 24 cubes in all.')
  })
  it('the net has six faces and its three sizes', () => {
    const svg = draw({ kind: 'box_net', long: 5, wide: 3, high: 2 })
    expect(svg.querySelectorAll('[data-face]')).toHaveLength(6)
    expect(svg.textContent).toBe('5 cm3 cm2 cm')
    expect(svg.getAttribute('aria-label')).toBe('The net of a box: six rectangles drawn to scale. The box is 5 cm long, 3 cm wide and 2 cm high.')
  })
  it('a picture that makes no sense is a missing picture, never a broken page', () => {
    document.body.innerHTML = ''
    render(<DiagramView spec={{ kind: 'jug', max: 3, value: 1, unit: 'l' }} variant="question" />)
    expect(document.body.textContent).toContain('Picture missing')
  })
})
