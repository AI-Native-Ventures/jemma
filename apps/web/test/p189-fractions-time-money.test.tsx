import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import type { Notation } from '@jemma/profiling/logic'
import { DiagramView } from '../components/diagrams'

// P189: the pictures of the "Calculating and fractions" and "Percentages, time and money" boards, drawn in a question and in the results, in the notation of the
// space. While a question is answered the words a screen reader says never give away what may be the answer. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question', notation: Notation = 'za') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} notation={notation} />)
  return document.querySelector('svg[role="img"]')!
}

const TREE: SeniorDiagramSpec = { kind: 'factor_tree', root: 60, splits: [{ of: 60, into: [6, 10] }, { of: 6, into: [2, 3] }, { of: 10, into: [2, 5] }], gold: 5 }

describe('a factor tree', () => {
  it('boxes the numbers that split, rings the primes in green and leaves the gold one blank', () => {
    const svg = draw(TREE)
    expect(svg.querySelectorAll('[data-node]')).toHaveLength(7)
    expect(svg.querySelectorAll('[data-prime]')).toHaveLength(4)
    expect(svg.querySelector('[data-gold]')!.textContent).toBe('?')
    expect(svg.textContent).toContain('Green circles are prime numbers.')
    expect(svg.getAttribute('aria-label')).toBe('A factor tree of 60: 60 splits into 6 and 10; 6 into 2 and 3; 10 into 2 and a blank.')
    expect(draw(TREE, 'card').getAttribute('aria-label')).toBe('A factor tree of 60: 60 splits into 6 and 10; 6 into 2 and 3; 10 into 2 and 5. The gold number is 5.')
  })
})

describe('fractions', () => {
  it('a fraction of a set has its gold groups', () => {
    const svg = draw({ kind: 'objects', thing: 'star', groups: [4, 4, 4], layout: 'groups', gold: 1 })
    expect(svg.querySelectorAll('[data-group][data-gold]')).toHaveLength(1)
    expect(svg.getAttribute('aria-label')).toBe('A picture of stars in 3 groups. 1 group is gold.')
  })

  it('fraction circles shade one circle before the next, and are only counted after', () => {
    const svg = draw({ kind: 'fraction_circle', parts: 4, shaded: 7, circles: 2 })
    expect(svg.querySelectorAll('[data-circle]')).toHaveLength(2)
    expect(svg.querySelectorAll('[data-circle="1"] [data-shaded="1"]')).toHaveLength(4)
    expect(svg.querySelectorAll('[data-circle="2"] [data-shaded="1"]')).toHaveLength(3)
    expect(svg.getAttribute('aria-label')).toBe('2 circles, each cut into equal parts. Some parts are gold.')
    expect(draw({ kind: 'fraction_circle', parts: 8, shaded: 3 }, 'card').getAttribute('aria-label')).toBe('A circle cut into 8 equal parts. 3 parts are gold.')
  })
})

describe('a percentage bar', () => {
  const bar: SeniorDiagramSpec = { kind: 'percent_bar', whole: 240, percent: 25, parts: 4, money: true }
  it('has its percents over it, the whole under its end and a question mark under the part', () => {
    const svg = draw(bar)
    expect(svg.textContent).toBe('0%100%25%?R240')
    expect(svg.getAttribute('aria-label')).toBe('A bar from 0% to 100%. 100% is R240. The first 25% is shaded, with a question mark under it.')
    expect(draw(bar, 'card').getAttribute('aria-label')).toBe('A bar from 0% to 100%. 100% is R240, and the first 25%, shaded, is R60.')
  })
  it('writes dollars and a decimal point in the US, and the question mark where the question puts it', () => {
    const svg = draw({ kind: 'percent_bar', whole: 240, percent: 40, money: true, ask: 'whole' }, 'question', 'us')
    expect(svg.textContent).toContain('$96')
    expect(svg.textContent).toContain('?')
    expect(draw({ kind: 'percent_bar', whole: 80, percent: 12.5, ask: 'percent' }, 'card', 'us').getAttribute('aria-label')).toContain('the first 12.5%, shaded, is 10.')
    expect(draw({ kind: 'percent_bar', whole: 80, percent: 12.5, ask: 'percent' }).textContent).toContain('?%')
  })
})

describe('a calendar', () => {
  const month: SeniorDiagramSpec = { kind: 'calendar', year: 2026, month: 11, circled: [6] }
  it('starts its weeks on Monday, or on Sunday in the US, and circles the day', () => {
    const za = draw(month)
    expect(za.querySelectorAll('[data-day]')).toHaveLength(30)
    expect(za.querySelector('[data-circled]')!.getAttribute('data-day')).toBe('6')
    expect(za.textContent!.startsWith('November 2026MTWTFSS')).toBe(true)
    expect(draw(month, 'question', 'us').textContent!.startsWith('November 2026SMTWTFS')).toBe(true)
  })
  it('never says the day of the week of the circled date while the question is answered', () => {
    expect(draw(month).getAttribute('aria-label')).toBe('A calendar of November 2026, with 6 November circled.')
    expect(draw(month, 'card').getAttribute('aria-label')).toBe('A calendar of November 2026. Friday 6 November is circled.')
    expect(draw(month, 'card', 'us').getAttribute('aria-label')).toBe('A calendar of November 2026. Friday, November 6 is circled.')
  })
})

describe('coins and notes', () => {
  it('rand notes and coins in South Africa, and only adds them up after', () => {
    const svg = draw({ kind: 'money', items: [1000, 500, 200, 200, 50] })
    expect(svg.querySelectorAll('[data-note]')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-coin]')).toHaveLength(4)
    expect(svg.textContent).toBe('R10R5R2R250c')
    expect(svg.getAttribute('aria-label')).toBe('Money: an R10 note, an R5 coin, two R2 coins and a 50c coin.')
    expect(draw({ kind: 'money', items: [1000, 500, 200, 200, 50] }, 'card').getAttribute('aria-label')).toBe(
      'Money: an R10 note, an R5 coin, two R2 coins and a 50c coin. R19,50 in all.',
    )
  })
  it('dollar bills and coins in the US', () => {
    const svg = draw({ kind: 'money', items: [100, 25, 25, 10] }, 'card', 'us')
    expect(svg.querySelectorAll('[data-note]')).toHaveLength(1)
    expect(svg.textContent).toBe('$125¢25¢10¢')
    expect(svg.getAttribute('aria-label')).toBe('Money: a $1 bill, two 25¢ coins and a 10¢ coin. $1.60 in all.')
  })
  it('a coin that is not real is a missing picture, never a broken page', () => {
    document.body.innerHTML = ''
    render(<DiagramView spec={{ kind: 'money', items: [300] }} variant="question" />)
    expect(document.body.textContent).toContain('Picture missing')
  })
})
