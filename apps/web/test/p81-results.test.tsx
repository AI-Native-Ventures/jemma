import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Results } from '../app/k/session/_parts/Results'
import type { MissedQuestion } from '../app/k/session/[sessionId]/logic'

// The results screen: the question, what the child wrote and the right answer all show a fraction as a fraction.

const missed = (over: Partial<MissedQuestion>): MissedQuestion => ({
  n: 2,
  prompt: 'Complete: 3/5 = ?/15',
  render: 'text',
  wrote: '5/15',
  right: '9/15',
  why: 'you changed only the top.',
  rightWay: '3/5 is the same as 9/15.',
  ...over,
})

const row = (label: string) => screen.getByText(label).parentElement as HTMLElement
/** What is drawn in an element: its text without the words kept for a screen reader. */
const drawn = (el: HTMLElement) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove())
  return copy.textContent ?? ''
}

describe('the question in the heading', () => {
  it('draws its fractions stacked and the missing part as an empty box', () => {
    render(<Results firstName="Amina" missed={[missed({})]} />)
    const article = screen.getByRole('article')
    const heading = article.querySelector('[data-question]') as HTMLElement
    expect(drawn(heading)).toBe('Complete: 35 = 15')
    expect(heading.querySelectorAll('[data-blank]')).toHaveLength(1)
    // a screen reader still gets the words as they were written
    expect(heading.querySelector('.sr-only')!.textContent).toBe('Complete: 3/5 = ?/15')
  })

  it('a fraction sum keeps its two stacked terms', () => {
    render(<Results firstName="Amina" missed={[missed({ prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], wrote: '2/6', right: '3/4' })]} />)
    const heading = screen.getByRole('article').querySelector('[data-question]') as HTMLElement
    expect(drawn(heading)).toBe('12+14')
  })

  it('a question without a fraction is plain words', () => {
    render(<Results firstName="Amina" missed={[missed({ prompt: 'What is half of 10?', wrote: '4', right: '5' })]} />)
    expect(screen.getByRole('article').querySelector('[data-question]')!.textContent).toBe('What is half of 10?')
  })
})

describe('"You wrote" and "Right answer"', () => {
  it('both are stacked fractions', () => {
    render(<Results firstName="Amina" missed={[missed({})]} />)
    const wrote = row('You wrote')
    const right = row('Right answer')
    expect(wrote.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(wrote.textContent).toBe('You wrote515')
    expect(right.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(right.textContent).toBe('Right answer915')
  })

  it('a mixed number is its whole number and a stacked fraction', () => {
    render(<Results firstName="Amina" missed={[missed({ prompt: 'Change 7/3 into a mixed number.', wrote: '2 1/2', right: '2 1/3' })]} />)
    const wrote = row('You wrote')
    expect(wrote.querySelectorAll('span.inline-flex')).toHaveLength(1)
    expect(wrote.textContent).toBe('You wrote212')
    expect(row('Right answer').textContent).toBe('Right answer213')
  })

  it('a number or an amount of money stays as written', () => {
    render(<Results firstName="Amina" missed={[missed({ prompt: 'A quarter of R20', wrote: 'R4', right: 'R5' })]} />)
    expect(row('You wrote').textContent).toBe('You wroteR4')
    expect(row('Right answer').textContent).toBe('Right answerR5')
  })
})

describe('the words of the lesson', () => {
  it('are the same words, with their fractions drawn stacked', () => {
    render(<Results firstName="Amina" missed={[missed({})]} />)
    const article = screen.getByRole('article')
    expect(within(article).getByText('3/5 is the same as 9/15.')).toBeTruthy()
    expect(within(article).getByText(/you changed only the top\./)).toBeTruthy()
  })
})
