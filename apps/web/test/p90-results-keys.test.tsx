import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QuestionScreen, keyColumns } from '../app/k/session/_parts/QuestionScreen'
import { Results, termUnits } from '../app/k/session/_parts/Results'
import type { MissedQuestion, QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P90 add-on: on a phone an algebra answer on the results screen never breaks in the middle of a term, and the maths keys sit in even rows.
// react-dom/server only: no server, no browser.

const html = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}
const missed = (over: Partial<MissedQuestion>): MissedQuestion => ({
  n: 2,
  prompt: 'Simplify 3(x + 4)',
  render: 'text',
  wrote: '3x + 12 + 0',
  right: '3x + 12',
  why: 'you added a zero.',
  rightWay: 'Multiply each term by 3.',
  ...over,
})
const page = (over: Partial<MissedQuestion>) => html(<Results firstName="Amina" missed={[missed(over)]} />)
/** The two boxes and the grid that holds them. */
const boxes = (el: Element) => {
  const wrote = [...el.querySelectorAll('span')].find((s) => s.textContent === 'You wrote')!.parentElement!
  const right = [...el.querySelectorAll('span')].find((s) => s.textContent === 'Right answer')!.parentElement!
  return { wrote, right, grid: wrote.parentElement! }
}
/** The pieces of an answer that cannot be cut: what the child reads, one string for each. */
const pieces = (box: Element) => [...box.querySelectorAll('.whitespace-nowrap')].map((p) => (p.textContent ?? '').trim())

describe('results: an algebra answer keeps its terms whole', () => {
  it('the two boxes stack when an answer is longer than a short number', () => {
    const { grid, wrote, right } = boxes(page({}))
    expect(grid.classList.contains('grid-cols-1')).toBe(true)
    expect(grid.classList.contains('grid-cols-2')).toBe(false)
    // each box is a whole row, and its label does not shrink
    for (const box of [wrote, right]) {
      expect(box.classList.contains('col-span-2')).toBe(false)
      expect(box.firstElementChild!.classList.contains('flex-none')).toBe(true)
    }
  })

  it('one long answer is enough: a short wrong answer beside a long right one stacks too', () => {
    expect(boxes(page({ wrote: '4', right: '3x + 12' })).grid.classList.contains('grid-cols-1')).toBe(true)
    expect(boxes(page({ wrote: '3x + 12 + 0', right: '4' })).grid.classList.contains('grid-cols-1')).toBe(true)
  })

  it('"3x + 12 + 0" and "3x + 12" wrap only between terms: a sign stays with its number', () => {
    const { wrote, right } = boxes(page({}))
    expect(pieces(wrote)).toEqual(['3x', '+ 12', '+ 0'])
    expect(pieces(right)).toEqual(['3x', '+ 12'])
    // the words are the answer as it was written
    expect(wrote.textContent).toBe('You wrote3x + 12 + 0')
    expect(right.textContent).toBe('Right answer3x + 12')
  })

  it('a power keeps its raised number inside its term', () => {
    const { wrote } = boxes(page({ wrote: 'x^2 + 4x + 4', right: 'x² + 4x + 4' }))
    expect(pieces(wrote)).toHaveLength(3)
    expect(wrote.querySelectorAll('.whitespace-nowrap')[0]!.querySelector('sup')!.textContent).toBe('2')
    expect(pieces(boxes(page({ wrote: 'x^2 + 4x + 4' })).right)).toHaveLength(2)
  })

  it('an equation with "or" breaks between its two answers, not inside one', () => {
    const { wrote } = boxes(page({ wrote: 'x = 3 or x = -1', right: 'x = 3' }))
    expect(pieces(wrote)).toEqual(['x = 3', 'or', 'x = -1'])
  })

  it('a bracket is never cut open', () => {
    const { wrote } = boxes(page({ wrote: '(x + 2)(x - 2)', right: '(x + 2)(x - 2)' }))
    expect(pieces(wrote)).toEqual(['(x + 2)(x - 2)'])
  })

  it('no piece is a sign alone, and the pieces put back are the answer as written', () => {
    for (const answer of ['3x + 12 + 0', '3x - 12', 'x = 3 or x = -1', '2x + 3 = 7', 'a × b + c', '5 − x', '(x + 2)(x - 2)']) {
      const units = termUnits(answer)!
      expect(units.join(' '), answer).toBe(answer)
      for (const u of units) expect(u, `${answer}: ${u}`).not.toMatch(/^[+\-−×÷*=]$/)
    }
  })
})

describe('termUnits', () => {
  it('splits a line of terms at the spaces between terms', () => {
    expect(termUnits('3x + 12 + 0')).toEqual(['3x', '+ 12', '+ 0'])
    expect(termUnits('3x - 12')).toEqual(['3x', '- 12'])
    expect(termUnits('x = 3 or x = -1')).toEqual(['x = 3', 'or', 'x = -1'])
    expect(termUnits('2x + 3 = 7')).toEqual(['2x', '+ 3 = 7'])
    expect(termUnits('x² + 4x + 4')).toEqual(['x²', '+ 4x', '+ 4'])
  })

  it('keeps a bracket in one piece', () => {
    expect(termUnits('(x + 2)(x - 2)')).toEqual(['(x + 2)(x - 2)'])
    expect(termUnits('(x + 2)(x - 2) = 0')).toEqual(['(x + 2)(x - 2) = 0'])
    expect(termUnits('(x + 2)(x - 2) + 1')).toEqual(['(x + 2)(x - 2)', '+ 1'])
  })

  it('says null for what is not a line of terms: numbers, money, mixed numbers, fractions, a minus in front of a number', () => {
    for (const answer of ['4', '0,75', 'R4,50', 'R1 234,50', '3 1/4', '5/15', '-3', '', 'x²']) expect(termUnits(answer), answer).toBeNull()
  })
})

describe('results: short answers keep today\'s side by side look', () => {
  it('fractions, mixed numbers, decimals and money of 6 characters or fewer stay in two columns', () => {
    for (const [wrote, right] of [['5/15', '9/15'], ['3 1/4', '3 1/2'], ['0,3', '0,75'], ['R4,50', 'R5,00'], ['2/6', '3/4']] as const) {
      const { grid, wrote: w, right: r } = boxes(page({ wrote, right }))
      expect(grid.classList.contains('grid-cols-2'), `${wrote} / ${right}`).toBe(true)
      expect(grid.classList.contains('grid-cols-1')).toBe(false)
      expect(w.firstElementChild!.classList.contains('flex-none')).toBe(false)
      expect(r.firstElementChild!.classList.contains('flex-none')).toBe(false)
    }
  })

  it('a paper answer that could not be read keeps its own full-width row', () => {
    const { grid, wrote } = boxes(page({ wrote: '', right: '9/15', unread: true }))
    expect(grid.classList.contains('grid-cols-2')).toBe(true)
    expect(wrote.classList.contains('col-span-2')).toBe(true)
  })

  it('a long answer of an old kind stacks too, and its fraction is still drawn stacked', () => {
    const { grid, right } = boxes(page({ wrote: '12 5/12', right: '12 7/12' }))
    expect(grid.classList.contains('grid-cols-1')).toBe(true)
    expect(right.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(right.querySelector('.whitespace-nowrap')).toBeNull()
  })
})

describe('the maths keys sit in even rows', () => {
  const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
  const keys = (q: QuestionForChild) => {
    const row = html(<QuestionScreen q={q} busy={false} onAnswer={() => undefined} />).querySelector('[data-keys]')!
    return { row, buttons: [...row.querySelectorAll('button')] }
  }
  /** The width of one key in a row of `count` columns on a phone `phone` px wide: the screen leaves 20 px at each side, the row has 8 px between keys. */
  const keyWidth = (phone: number, count: number) => (Math.min(360, phone - 40) - 8 * (count - 1)) / count

  it('an expression has 8 keys in a grid of 4 columns: 4 + 4', () => {
    const { row, buttons } = keys(ask({ answerKind: 'expression' }))
    expect(buttons).toHaveLength(8)
    expect(row.classList.contains('grid')).toBe(true)
    expect(row.classList.contains('grid-cols-4')).toBe(true)
    expect(row.classList.contains('flex-wrap')).toBe(false)
  })

  it('an equation has 5 keys in one row of 5 columns', () => {
    const { row, buttons } = keys(ask({ answerKind: 'equation' }))
    expect(buttons).toHaveLength(5)
    expect(row.classList.contains('grid-cols-5')).toBe(true)
  })

  it('every key is at least 48 px wide and tall, and has no fixed height', () => {
    for (const kind of ['expression', 'equation'] as const) {
      const { buttons } = keys(ask({ answerKind: kind }))
      for (const b of buttons) {
        expect(b.classList.contains('min-h-12'), `${kind}: ${b.textContent}`).toBe(true)
        expect(b.classList.contains('min-w-12')).toBe(true)
        expect([...b.classList].filter((c) => /^h-/.test(c))).toEqual([])
      }
    }
  })

  it('on a 360 px phone (and a 320 px one) each key is at least 48 px wide in both rows', () => {
    for (const phone of [390, 360, 320]) {
      expect(keyWidth(phone, 4), `8 keys at ${phone}`).toBeGreaterThanOrEqual(48)
      expect(keyWidth(phone, 5), `5 keys at ${phone}`).toBeGreaterThanOrEqual(48)
    }
  })

  it('the row is as wide as the answer box and no wider', () => {
    const { row } = keys(ask({ answerKind: 'expression' }))
    expect(row.classList.contains('w-full')).toBe(true)
    expect(row.classList.contains('max-w-[360px]')).toBe(true)
  })

  it('keyColumns: one row up to 5 keys, else two even rows', () => {
    expect([1, 2, 3, 4, 5].map(keyColumns)).toEqual(['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'])
    expect([6, 8, 10].map(keyColumns)).toEqual(['grid-cols-3', 'grid-cols-4', 'grid-cols-5'])
  })
})
