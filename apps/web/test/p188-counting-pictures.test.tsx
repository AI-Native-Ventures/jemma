import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'

// P188: the pictures of the "Counting and place value" board, drawn in a question and in the results. While a question is answered the words a screen reader says
// never count what may be the answer. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} />)
  return document.querySelector('svg[role="img"]')!
}

describe('objects to count', () => {
  const apples: SeniorDiagramSpec = { kind: 'objects', thing: 'apple', groups: [5, 5, 3] }
  it('says what is drawn while the question is answered, and how many after', () => {
    expect(draw(apples).getAttribute('aria-label')).toBe('A picture of apples in 3 rows.')
    expect(draw(apples, 'card').getAttribute('aria-label')).toBe('13 apples in 3 rows: 5, 5 and 3.')
  })
  it('equal groups each have a ring of their own', () => {
    const svg = draw({ kind: 'objects', thing: 'star', groups: [4, 4, 4], layout: 'groups' }, 'card')
    expect(svg.querySelectorAll('[data-group]')).toHaveLength(3)
    expect(svg.getAttribute('aria-label')).toBe('12 stars in 3 groups of 4.')
  })
  it('every kind of thing is drawn', () => {
    for (const thing of ['apple', 'star', 'ball', 'flower', 'fish', 'car', 'cookie', 'heart'] as const) {
      expect(draw({ kind: 'objects', thing, groups: [2] }).getAttribute('aria-label')).toContain('A picture of')
    }
  })
})

describe('a ten-frame and a number bond', () => {
  it('draws the counters and the bond with a blank, and never counts them while answering', () => {
    const svg = draw({ kind: 'ten_frame', filled: 7, bond: { whole: 10, part: 7 } })
    expect(svg.querySelectorAll('[data-counter]')).toHaveLength(7)
    expect(svg.querySelector('[data-bond]')!.textContent).toBe('107?')
    expect(svg.getAttribute('aria-label')).toBe('A ten-frame with counters in some boxes. A number bond: a whole at the top, one part and a blank below.')
    expect(draw({ kind: 'ten_frame', filled: 7, bond: { whole: 10, part: 7 } }, 'card').getAttribute('aria-label')).toBe(
      'A ten-frame with 7 counters and 3 empty boxes. A number bond: 10 at the top, 7 and a blank below.',
    )
  })
  it('two frames for twenty', () => {
    const svg = draw({ kind: 'ten_frame', frames: 2, filled: 14 })
    expect(svg.querySelectorAll('[data-frame]')).toHaveLength(2)
    expect(svg.querySelectorAll('[data-counter]')).toHaveLength(14)
  })
})

describe('base-ten blocks, a hundred chart, a dot array and two numbers to compare', () => {
  it('blocks have no words on them, and are only counted after', () => {
    const svg = draw({ kind: 'base_ten', tens: 3, ones: 4 })
    expect(svg.textContent).toBe('')
    expect(svg.getAttribute('aria-label')).toBe('Place value blocks: rods of ten and single ones.')
    expect(draw({ kind: 'base_ten', hundreds: 1, tens: 3, ones: 4 }, 'card').getAttribute('aria-label')).toBe('Place value blocks: 1 flat of a hundred, 3 rods of ten and 4 single ones.')
  })
  it('the hundred chart shows its numbers, leaves the blanks empty and the gold box has a question mark', () => {
    const svg = draw({ kind: 'hundred_chart', from: 41, rows: 3, blanks: [47, 58, 63], gold: 47 })
    expect(svg.textContent).toContain('46')
    expect(svg.textContent).toContain('48')
    expect(svg.textContent).not.toContain('47')
    expect(svg.textContent).not.toContain('58')
    expect(svg.querySelector('[data-gold]')!.textContent).toBe('?')
    expect(svg.getAttribute('aria-label')).toBe('Part of a hundred chart from 41 to 70, with 3 empty boxes. One empty box is gold.')
    expect(draw({ kind: 'hundred_chart', from: 41, rows: 3, blanks: [47, 58, 63], gold: 47 }, 'card').getAttribute('aria-label')).toContain('The gold box is 47.')
  })
  it('the dots are all there, and only counted after', () => {
    const svg = draw({ kind: 'dot_array', rows: 4, cols: 6 })
    expect(svg.querySelectorAll('[data-dot]')).toHaveLength(24)
    expect(svg.getAttribute('aria-label')).toBe('Dots in rows and columns.')
    expect(draw({ kind: 'dot_array', rows: 4, cols: 6 }, 'card').getAttribute('aria-label')).toBe('24 dots in 4 rows of 6.')
  })
  it('two numbers with a blank sign between them', () => {
    const svg = draw({ kind: 'compare', left: '47', right: '52' })
    expect(svg.textContent).toBe('47?52')
    expect(svg.getAttribute('aria-label')).toBe('47, a blank sign, 52.')
  })
  it('a picture that makes no sense is a missing picture, never a broken page', () => {
    document.body.innerHTML = ''
    render(<DiagramView spec={{ kind: 'objects', thing: 'apple', groups: [40] }} variant="question" />)
    expect(document.body.textContent).toContain('Picture missing')
  })
})
