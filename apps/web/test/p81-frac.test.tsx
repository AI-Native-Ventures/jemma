import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Frac, FractionText, isFraction, withFractions } from '../app/k/session/_parts/Frac'

// A fraction is always drawn as a fraction: number, line, number. An unknown part is an empty box, never a "?" beside a slash.

const calls = (text: string) => {
  const seen: [string | null, string | null][] = []
  const out = withFractions(text, (n, d, k) => {
    seen.push([n, d])
    return `[${k}]`
  })
  return { seen, out }
}

describe('withFractions', () => {
  it('digits over digits are a fraction, as before', () => {
    const { seen, out } = calls('What is 1/2 plus 1/4?')
    expect(seen).toEqual([['1', '2'], ['1', '4']])
    expect(out).toEqual(['What is ', '[0]', ' plus ', '[1]', '?'])
  })

  it('an unknown part is handed over as null, on the same fraction', () => {
    const { seen, out } = calls('Complete: 3/5 = ?/15')
    expect(seen).toEqual([['3', '5'], [null, '15']])
    expect(out).toEqual(['Complete: ', '[0]', ' = ', '[1]'])
  })

  it('every way of writing the unknown part, with or without spaces around the slash', () => {
    for (const text of ['?/15', '? / 15', '?/ 15', '__/15', '_/15', '□/15', '.../15', '…/15']) {
      expect(calls(text).seen, text).toEqual([[null, '15']])
    }
    for (const text of ['3/?', '3 / ?', '3/ ?', '3/__', '3/□', '3/...']) {
      expect(calls(text).seen, text).toEqual([['3', null]])
    }
  })

  it('km/h, a date and a plain slash stay text', () => {
    for (const text of ['60 km/h', 'On 12/11/2026 we went', '2026/11/14', 'and/or', 'Work out 12 / 4']) {
      const { seen, out } = calls(text)
      expect(seen, text).toEqual([])
      expect(out, text).toEqual([text])
    }
  })

  it('isFraction is still digits over digits only', () => {
    expect(isFraction('9/15')).toBe(true)
    expect(isFraction('?/15')).toBe(false)
  })
})

describe('Frac', () => {
  const props = { size: 40, rule: 3, gap: 4, side: 5 }

  it('a number over a number, with the line between', () => {
    const { container } = render(<Frac top="9" bottom="15" {...props} />)
    expect(container.textContent).toBe('915')
    expect(container.querySelectorAll('[data-blank]')).toHaveLength(0)
  })

  it('an unknown top is an empty box the height of a number, under no question mark', () => {
    const { container } = render(<Frac top={null} bottom="15" {...props} />)
    const blank = container.querySelector<HTMLElement>('[data-blank]')!
    expect(blank).toBeTruthy()
    expect(blank.getAttribute('aria-hidden')).toBe('true')
    expect(blank.style.height).toBe('40px')
    expect(blank.textContent).toBe('')
    expect(container.textContent).toBe('15')
    expect(container.textContent).not.toMatch(/[?/]/)
  })

  it('an unknown bottom is the same box under the known top', () => {
    const { container } = render(<Frac top="2" bottom={null} {...props} />)
    expect(container.querySelectorAll('[data-blank]')).toHaveLength(1)
    expect(container.textContent).toBe('2')
  })

  it('anything can sit in a part, for the box the child types in', () => {
    const html = renderToStaticMarkup(<Frac top={<input aria-label="Missing number" />} bottom="15" {...props} />)
    expect(html).toContain('<input aria-label="Missing number"')
    expect(html).not.toContain('data-blank')
  })
})

describe('FractionText', () => {
  const props = { size: 24, rule: 2.5, gap: 3, side: 3 }

  it('draws every fraction stacked, and keeps the plain words for a screen reader', () => {
    const { container } = render(<FractionText text="Complete: 3/5 = ?/15" {...props} />)
    const drawn = container.querySelector('[aria-hidden="true"]')!
    expect(drawn.textContent).toBe('Complete: 35 = 15')
    expect(drawn.textContent).not.toMatch(/[?/]/)
    expect(drawn.querySelectorAll('[data-blank]')).toHaveLength(1)
    expect(container.querySelector('.sr-only')!.textContent).toBe('Complete: 3/5 = ?/15')
  })

  it('text without a fraction is just the text', () => {
    const { container } = render(<FractionText text="Why not?" {...props} />)
    expect(container.innerHTML).toBe('Why not?')
  })
})
