import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { GEOMETRY_REASONS } from '@jemma/profiling/logic'
import { afterEach, describe, expect, it } from 'vitest'
import { FractionText } from '../app/k/session/_parts/Frac'
import { PaperSheet } from '../app/k/session/_parts/Paper'
import { Results } from '../app/k/session/_parts/Results'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { SignText, hasSign } from '../app/k/session/_parts/answers/Signs'
import type { MissedQuestion, QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P149c: the page font has no parallel sign (Outfit is Latin only) and a phone draws the fallback as a thin "ı". Every geometry sign in a line of words is drawn
// by KaTeX, in the reason list, the chosen reason, the paper sheet, the question words and the results. react-dom only: no browser (so the fonts themselves were not seen).

afterEach(cleanup)

const PARALLEL = '∥'
const signsIn = (el: Element | Document) => [...el.querySelectorAll('[data-sign]')].map((s) => s.getAttribute('data-sign'))

describe('SignText', () => {
  it('draws the parallel sign with KaTeX and leaves the words as words', () => {
    const { container } = render(<p><SignText text={`alternate angles, AB ${PARALLEL} CD`} /></p>)
    const sign = container.querySelector('[data-sign]')!
    expect(sign.getAttribute('data-sign')).toBe(PARALLEL)
    expect(sign.classList.contains('jemma-math')).toBe(true)
    expect(sign.querySelector('.katex')).toBeTruthy()
    // The line still reads the same: the sign is in the KaTeX text, and the words around it are the words.
    expect(container.textContent).toBe(`alternate angles, AB ${PARALLEL} CD`)
  })

  it.each([
    ['∥', 'parallel'],
    ['⊥', 'perpendicular'],
    ['∠', 'angle'],
    ['△', 'triangle'],
    ['≅', 'congruent'],
    ['∼', 'similar'],
  ])('%s (%s) is drawn by KaTeX', (sign) => {
    const { container } = render(<p><SignText text={`a ${sign} b`} /></p>)
    expect(signsIn(container)).toEqual([sign])
    expect(container.querySelector('[data-sign] .katex')).toBeTruthy()
    expect(container.textContent).toContain(sign)
  })

  it('every sign of a line is drawn, in order', () => {
    const { container } = render(<p><SignText text={`${'∠'}A = ${'∠'}B and AB ${PARALLEL} CD, radius ${'⊥'} tangent`} /></p>)
    expect(signsIn(container)).toEqual(['∠', '∠', PARALLEL, '⊥'])
  })

  it('a line with no sign is the same text, with nothing added', () => {
    const { container } = render(<p><SignText text="angles on a straight line" /></p>)
    expect(container.innerHTML).toBe('<p>angles on a straight line</p>')
    expect(hasSign('angles on a straight line')).toBe(false)
    expect(hasSign('x ∥ y')).toBe(true)
  })
})

describe('the reason picker', () => {
  const reason: QuestionForChild = { position: 3, phase: 'try', index: 1, of: 5, prompt: 'Why?', render: 'text', answerKind: 'reason' }
  const show = () => render(<QuestionScreen q={reason} busy={false} onAnswer={() => {}} />)

  it('draws the sign in exactly the reasons that have one, and the labels still read as the list', () => {
    show()
    const items = within(screen.getByRole('list', { name: 'Reasons' })).getAllByRole('button')
    expect(items.map((b) => b.textContent)).toEqual([...GEOMETRY_REASONS])
    const withSign = items.filter((b) => b.querySelector('[data-sign]')).map((b) => b.textContent)
    expect(withSign).toEqual(GEOMETRY_REASONS.filter((r) => r.includes(PARALLEL) || r.includes('⊥')))
    expect(withSign.length).toBeGreaterThanOrEqual(5)
    for (const button of items.filter((b) => b.textContent!.includes(PARALLEL))) expect(signsIn(button)).toEqual([PARALLEL])
  })

  it('the chosen reason, in its chip, has the sign drawn too, and Next sends the plain text', () => {
    const sent: string[] = []
    render(<QuestionScreen q={reason} busy={false} onAnswer={(v) => sent.push(v)} />)
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === `alternate angles, AB ${PARALLEL} CD`)!)
    const chip = document.querySelector('[data-reason-chip="true"]')!
    expect(chip.textContent).toContain(`alternate angles, AB ${PARALLEL} CD`)
    expect(signsIn(chip)).toEqual([PARALLEL])
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(sent).toEqual([`alternate angles, AB ${PARALLEL} CD`])
  })
})

describe('the paper sheet', () => {
  it('the list of reasons under a reason question has the sign drawn', () => {
    const q: QuestionForChild = { position: 1, phase: 'try', index: 1, of: 5, prompt: 'Why?', render: 'text', answerKind: 'reason' }
    render(<PaperSheet questions={[q]} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
    const list = document.querySelector('details')!
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([...GEOMETRY_REASONS])
    expect(signsIn(list).filter((s) => s === PARALLEL)).toHaveLength(GEOMETRY_REASONS.filter((r) => r.includes(PARALLEL)).length)
  })
})

describe('words with a sign in them, anywhere a line of words is drawn', () => {
  it('FractionText draws the sign in a plain line and in a line with maths in it', () => {
    const plain = render(<p><FractionText text={`Given AB ${PARALLEL} CD`} size={20} rule={2} gap={3} side={3} /></p>)
    expect(signsIn(plain.container)).toEqual([PARALLEL])
    plain.unmount()
    const withMaths = render(<p><FractionText text={`Given AB ${PARALLEL} CD, find x when 3x + 1 = 10`} size={20} rule={2} gap={3} side={3} typeset="all" /></p>)
    expect(signsIn(withMaths.container)).toEqual([PARALLEL])
  })

  it('a line with no sign is drawn exactly as it was', () => {
    const { container } = render(<p><FractionText text="Add 3/5 and 1/5" size={20} rule={2} gap={3} side={3} /></p>)
    expect(signsIn(container)).toEqual([])
  })

  it('the results screen draws the sign in what was written and in the right answer', () => {
    const missed: MissedQuestion = {
      n: 1,
      correct: false,
      prompt: 'Why is the angle equal?',
      render: 'text',
      wrote: `corresponding angles, AB ${PARALLEL} CD`,
      right: `alternate angles, AB ${PARALLEL} CD`,
      why: 'why',
      rightWay: 'right way',
    }
    const { container } = render(<Results firstName="Sam" missed={[missed]} />)
    expect(signsIn(container).filter((s) => s === PARALLEL).length).toBeGreaterThanOrEqual(2)
  })
})
