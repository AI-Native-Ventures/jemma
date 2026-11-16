import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Results } from '../app/k/session/_parts/Results'
import { reviewOf, stripQuestion, type MissedQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// P126b: a result card whose question has worked `steps` shows them under "How to get there", one line each, above the explanation, on a right card and
// on a missed card alike. A card without steps is as it was. The lines are drawn by the shared maths text. react-dom/server only: no server, no database.

const html = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const page = (list: MissedQuestion[]) => html(<Results firstName="Amina" missed={list} />)

const right = (n: number, over: Partial<MissedQuestion> = {}): MissedQuestion => ({
  n,
  prompt: `What is ${n} + 4?`,
  render: 'text',
  wrote: `${n + 4}`,
  right: `${n + 4}`,
  why: `the usual mistake ${n}.`,
  rightWay: `Add the ones: ${n} + 4 = ${n + 4}.`,
  correct: true,
  ...over,
})
const wrong = (n: number, over: Partial<MissedQuestion> = {}): MissedQuestion => ({
  n,
  prompt: 'Subtract one third from one half.',
  render: 'text',
  wrote: '1/99',
  right: '1/6',
  why: 'Learners may subtract the bottom numbers separately.',
  rightWay: 'One half is three sixths and one third is two sixths.',
  correct: false,
  ...over,
})

const STEPS = ['x/2 + 6 = 10', 'x/2 = 4', 'x = 8']
const heading = (card: Element) => [...card.querySelectorAll('span')].find((x) => x.textContent === 'How to get there')
/** The plain words of each step, as a screen reader gets them. */
const plain = (card: Element) => [...card.querySelectorAll('[data-steps] li')].map((li) => [...li.querySelectorAll('.sr-only')].map((x) => x.textContent).join(' '))

describe('results: worked steps, "How to get there"', () => {
  it('a right card with steps shows the heading and each line, between the confirmation and "Why it works"', () => {
    const card = page([right(1, { steps: STEPS })]).querySelector('article')!
    expect(heading(card)).toBeDefined()
    expect(card.querySelectorAll('[data-steps] li')).toHaveLength(3)
    expect(plain(card)).toEqual(['x/2 + 6 = 10', 'x/2 = 4', 'x = 8'])
    const all = text(card)
    expect(all.indexOf('How to get there')).toBeGreaterThan(all.indexOf("Yes, you're right."))
    expect(all.indexOf('How to get there')).toBeGreaterThan(all.indexOf('You wrote'))
    expect(all.indexOf('How to get there')).toBeLessThan(all.indexOf('Why it works:'))
    expect(all).toContain('Add the ones: 1 + 4 = 5.')
  })

  it('a missed card with steps shows them after the usual mistake and above the right way', () => {
    const card = page([wrong(2, { steps: STEPS })]).querySelector('article')!
    expect(heading(card)).toBeDefined()
    expect(plain(card)).toEqual(['x/2 + 6 = 10', 'x/2 = 4', 'x = 8'])
    const all = text(card)
    expect(all.indexOf('Why: Learners')).toBeLessThan(all.indexOf('How to get there'))
    expect(all.indexOf('How to get there')).toBeLessThan(all.indexOf('The right way'))
    expect(all).toContain('One half is three sixths and one third is two sixths.')
    expect(all).toContain('Not yet.')
    expect(all).toContain('Right answer')
  })

  it('every card of a practice shows its own steps, in order', () => {
    const list = [1, 2, 3, 4, 5].map((n) => (n === 2 ? wrong(n, { steps: ['a = 1', 'a + a = 2'] }) : right(n, { steps: ['b = 3', 'b + 1 = 4', 'b + 1 + 1 = 5'] })))
    const el = page(list)
    expect(el.querySelectorAll('article')).toHaveLength(5)
    expect(el.querySelectorAll('[data-steps]')).toHaveLength(5)
    expect(el.querySelectorAll('[data-steps] li')).toHaveLength(4 * 3 + 2)
    expect(plain(el.querySelectorAll('article')[1]!)).toEqual(['a = 1', 'a + a = 2'])
  })

  it('a card without steps (primary and older lessons) is as it was: no heading, the right way as today', () => {
    const el = page([right(1), wrong(2), right(3)])
    expect(el.querySelectorAll('[data-steps]')).toHaveLength(0)
    expect(text(el)).not.toContain('How to get there')
    expect(text(el)).toContain('Why it works:')
    expect(text(el)).toContain('The right way')
    // an empty list of steps is the same as none
    const empty = page([right(1, { steps: [] }), wrong(2, { steps: [] })])
    expect(empty.querySelectorAll('[data-steps]')).toHaveLength(0)
    expect(text(empty)).not.toContain('How to get there')
  })

  it('the lines go through the shared maths text: a power is raised, a fraction is stacked, the plain words stay for a screen reader', () => {
    const steps = page([right(1, { steps: ['x^2 + 4x + 4', '1/2 = 3/6'] })]).querySelector('[data-steps]')!
    const [power, fraction] = [...steps.querySelectorAll('li')]
    expect(power!.querySelector('sup')?.textContent).toBe('2')
    expect(power!.querySelector('.sr-only')?.textContent).toContain('x^2')
    expect(fraction!.querySelectorAll('span.inline-flex.flex-col')).toHaveLength(2)
  })

  it('a long line of terms is never cut between a sign and its number', () => {
    const steps = page([wrong(2, { steps: ['3x + 12 + 0 = 3x + 12'] })]).querySelector('[data-steps]')!
    const kept = [...steps.querySelectorAll('.whitespace-nowrap')].map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
    expect(kept.some((k) => k.includes('+ 12'))).toBe(true)
    expect(kept.some((k) => k.includes('+ 0'))).toBe(true)
  })

  it('the answers keep their boxes: You wrote and Right answer are still drawn, with steps or not', () => {
    for (const steps of [undefined, STEPS]) {
      const el = page([right(1, { steps }), wrong(2, { steps })])
      expect(text(el.querySelector('[data-verdict="right"]'))).toContain('You wrote5')
      const missed = text(el.querySelector('[data-verdict="missed"]'))
      expect(missed).toContain('You wrote')
      expect(missed).toContain('Right answer')
    }
  })
})

describe('reviewOf carries the steps of the stored question into the card', () => {
  const stored = (position: number, extra: Record<string, unknown>): StoredItem => ({
    phase: 'try',
    position,
    question: { prompt: 'Solve', render: 'text', answerKind: 'whole', answer: '8', why: 'w', rightWay: 'r', difficulty: 2, ...extra } as StoredItem['question'],
    answer: '8',
    correct: true,
    difficulty: 2,
    seconds: 5,
  })

  it('a question with steps gives them to its card, in order', () => {
    expect(reviewOf([stored(1, { steps: STEPS })])[0]!.steps).toEqual(STEPS)
  })

  it('a question without steps, or with none left, has no key', () => {
    const [none, empty, blanks] = reviewOf([stored(1, {}), stored(2, { steps: [] }), stored(3, { steps: ['', '   '] })])
    for (const card of [none, empty, blanks]) expect(card).not.toHaveProperty('steps')
  })

  it('the lines that are not words are dropped, and a field that is not a list is ignored', () => {
    expect(reviewOf([stored(1, { steps: ['ok', 3, '', null, 'fine'] })])[0]!.steps).toEqual(['ok', 'fine'])
    expect(reviewOf([stored(1, { steps: 'x = 8' })])[0]).not.toHaveProperty('steps')
  })

  it('a stored lesson read back with steps gets them all the way to the page', () => {
    const el = page(reviewOf([stored(1, { steps: STEPS })]))
    expect(plain(el.querySelector('article')!)).toEqual(['x/2 + 6 = 10', 'x/2 = 4', 'x = 8'])
  })

  it('the question the learner sees while answering never carries the steps', () => {
    const asked = stripQuestion(stored(1, { steps: STEPS }).question, { position: 3, phase: 'try', index: 1, of: 5 })
    expect(asked).not.toHaveProperty('steps')
    expect(JSON.stringify(asked)).not.toContain('x/2 = 4')
  })
})
