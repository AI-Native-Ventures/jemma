import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import type { QuestionForChild } from '../app/k/session/[sessionId]/logic'

// What a child sees and types for each kind of answer. react-dom only: no server, no browser.

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'Work it out',
  render: 'text',
  answerKind: 'whole',
  ...over,
})

const show = (q: QuestionForChild) => {
  const onAnswer = vi.fn()
  const utils = render(<QuestionScreen q={q} busy={false} onAnswer={onAnswer} />)
  return { onAnswer, ...utils }
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement

describe('a missing number is typed where it is missing', () => {
  const q = ask({ prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' })

  it('the one box is inside the stacked fraction, in the question, with the number keyboard', () => {
    show(q)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    const input = box('Missing number')
    expect(input.getAttribute('inputmode')).toBe('numeric')
    // big enough to tap
    expect(parseInt(input.style.height, 10)).toBeGreaterThanOrEqual(56)
    expect(parseInt(input.style.width, 10)).toBeGreaterThanOrEqual(56)
    // it sits in the fraction of the question, over the line, with 15 under the line
    const frac = input.closest('span.inline-flex')!
    expect(frac.textContent!.replace('Missing number', '')).toBe('15')
    expect(frac.children[0]!.contains(input)).toBe(true)
    expect(screen.getByText('Type the missing number.')).toBeTruthy()
  })

  it('the words keep their fractions stacked: no question mark beside a slash', () => {
    const { container } = show(q)
    // what is drawn: the card without the words kept for a screen reader
    const card = container.querySelector('section[aria-label="Question"]')!.cloneNode(true) as HTMLElement
    card.querySelectorAll('.sr-only').forEach((e) => e.remove())
    expect(card.textContent).toContain('Complete:')
    expect(card.textContent).not.toMatch(/[?/]/)
    expect(container.querySelector('h1[data-prompt]')!.getAttribute('data-prompt')).toBe('Complete: 3/5 = ?/15')
    expect(container.querySelectorAll('h1[data-prompt]')).toHaveLength(1)
  })

  it('Next waits for the number, and sends it put back into the fraction', () => {
    const { onAnswer } = show(q)
    expect(next().disabled).toBe(true)
    type('Missing number', '9')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('9/15', expect.any(Number))
  })

  it('only digits go in the box', () => {
    show(q)
    type('Missing number', '9a/')
    expect(box('Missing number').value).toBe('9')
  })

  it('a missing bottom is typed under the known top', () => {
    const { onAnswer } = show(ask({ prompt: '1/2 = 2/?', answerKind: 'fraction' }))
    type('Missing number', '4')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2/4', expect.any(Number))
  })
})

describe('every other answer says how to write it', () => {
  it('a fraction: a top box over a bottom box, then the line', () => {
    const { onAnswer } = show(ask({ prompt: 'Simplify 6/8', answerKind: 'fraction' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(box('Top number').getAttribute('inputmode')).toBe('numeric')
    expect(box('Bottom number').getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByText('Type the top number and the bottom number.')).toBeTruthy()
    expect(next().disabled).toBe(true)
    type('Top number', '3')
    expect(next().disabled).toBe(true)
    type('Bottom number', '4')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('3/4', expect.any(Number))
  })

  it('a mixed number: a box for the whole number, then the two stacked boxes', () => {
    const { onAnswer } = show(ask({ prompt: 'Change 15/4 into a mixed number.', answerKind: 'mixed' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.getByText('Type the whole number, then the fraction.')).toBeTruthy()
    type('Whole number', '3')
    type('Top number', '3')
    expect(next().disabled).toBe(true)
    type('Bottom number', '4')
    expect(next().disabled).toBe(false)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('3 3/4', expect.any(Number))
  })

  it('a whole number: one box, number keyboard', () => {
    const { onAnswer } = show(ask({ prompt: 'What is half of 10?', answerKind: 'whole' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(box('Your answer').getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByText('Type a whole number.')).toBeTruthy()
    expect(next().disabled).toBe(true)
    type('Your answer', '5')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('5', expect.any(Number))
  })

  it('a decimal: one box, decimal keyboard, and the line says comma', () => {
    const { onAnswer } = show(ask({ prompt: 'One half as a decimal', answerKind: 'decimal' }))
    expect(box('Your answer').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByText('Type a number with a comma, like 0,5.')).toBeTruthy()
    type('Your answer', '0,5')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('0,5', expect.any(Number))
  })

  it('money: one box with an R in front of it', () => {
    const { onAnswer, container } = show(ask({ prompt: 'A quarter of R50', answerKind: 'money' }))
    expect(box('Your answer').getAttribute('inputmode')).toBe('decimal')
    expect(screen.getByText('Type the amount, like 12,50.')).toBeTruthy()
    const r = container.querySelector('[data-currency]')!
    expect(r.textContent).toBe('R')
    expect(r.parentElement!.contains(box('Your answer'))).toBe(true)
    expect(r.compareDocumentPosition(box('Your answer')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    type('Your answer', '12,50')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('R12,50', expect.any(Number))
  })

  it('a choice is unchanged: buttons, no box, no line', () => {
    const { onAnswer } = show(ask({ prompt: 'Which is the same as 1/2?', answerKind: 'choice', choices: ['2/4', '1/4', '2/3', '3/4'] }))
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryByText(/^Type /)).toBeNull()
    expect(next().disabled).toBe(true)
    const buttons = screen.getAllByRole('button', { pressed: false })
    expect(buttons).toHaveLength(4)
    fireEvent.click(buttons[0]!)
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('A', expect.any(Number))
  })

  it('a fraction sum keeps its boxes and sends "top/bottom" as before', () => {
    const { onAnswer, container } = show(ask({ prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], answerKind: 'fraction' }))
    expect(container.querySelector('h1[data-prompt]')!.getAttribute('data-prompt')).toBe('1/2 + 1/4')
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(box('Top number').id).toBe('top')
    expect(box('Bottom number').id).toBe('bottom')
    type('Top number', '3')
    type('Bottom number', '4')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('3/4', expect.any(Number))
  })
})

describe('what the screen never says', () => {
  const kinds: Partial<QuestionForChild>[] = [
    { prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' },
    { prompt: 'Simplify 6/8', answerKind: 'fraction' },
    { prompt: 'Change 15/4', answerKind: 'mixed' },
    { prompt: 'Half of 10', answerKind: 'whole' },
    { prompt: 'Half as a decimal', answerKind: 'decimal' },
    { prompt: 'A quarter of R50', answerKind: 'money' },
    { prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], answerKind: 'fraction' },
  ]

  it('has no word of right or wrong while a quiz runs', () => {
    for (const k of kinds) {
      const text = renderToStaticMarkup(<QuestionScreen q={ask(k)} busy={false} onAnswer={() => {}} />).replace(/<[^>]+>/g, ' ').toLowerCase()
      for (const word of ['right', 'wrong', 'correct', 'score', 'well done']) expect(text, `${k.prompt}: ${word}`).not.toContain(word)
    }
  })
})

describe('the warm-up', () => {
  it('draws its fractions stacked, an unknown part as an empty box, and keeps the choices', () => {
    const q = ask({ phase: 'warmup', prompt: 'Which fills ?/6 so that 1/3 = ?/6', answerKind: 'choice', choices: ['2', '3', '1', '4'] })
    const { container } = show(q)
    expect(container.querySelector('h1[data-prompt]')!.getAttribute('data-prompt')).toBe(q.prompt)
    expect(container.querySelectorAll('[data-blank]').length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(4)
  })

  it('a choice that is a fraction is drawn stacked, in the warm-up and in a try question', () => {
    for (const phase of ['warmup', 'try'] as const) {
      const { container, unmount } = show(ask({ phase, prompt: 'Which is the same as 1/2?', answerKind: 'choice', choices: ['2/4', '1/4', '2/3', '3/4'] }))
      const first = screen.getAllByRole('button', { pressed: false })[0]!
      expect(first.querySelector('span.inline-flex')).toBeTruthy()
      expect(first.textContent).toContain('2/4')
      expect(container.querySelector('button [aria-hidden="true"]')!.textContent).toBe('24')
      unmount()
    }
  })
})

describe('each answer kind, rendered on the server', () => {
  const html = (q: Partial<QuestionForChild>) => renderToStaticMarkup(<QuestionScreen q={ask(q)} busy={false} onAnswer={() => {}} />)
  const labels = (markup: string) => [...markup.matchAll(/<label[^>]*>([^<]*)<\/label>/g)].map((m) => m[1])
  const kinds: [string, Partial<QuestionForChild>, string[], string][] = [
    ['missing', { prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' }, ['Missing number'], 'Type the missing number.'],
    ['fraction', { prompt: 'Simplify 6/8', answerKind: 'fraction' }, ['Top number', 'Bottom number'], 'Type the top number and the bottom number.'],
    ['mixed', { prompt: 'Change 15/4', answerKind: 'mixed' }, ['Whole number', 'Top number', 'Bottom number'], 'Type the whole number, then the fraction.'],
    ['whole', { prompt: 'Half of 10', answerKind: 'whole' }, ['Your answer'], 'Type a whole number.'],
    ['decimal', { prompt: 'Half as a decimal', answerKind: 'decimal' }, ['Your answer'], 'Type a number with a comma, like 0,5.'],
    ['money', { prompt: 'A quarter of R50', answerKind: 'money' }, ['Your answer'], 'Type the amount, like 12,50.'],
  ]
  for (const [name, q, expected, line] of kinds) {
    it(`${name}: its boxes and its line`, () => {
      const markup = html(q)
      expect(labels(markup)).toEqual(expected)
      expect(markup).toContain(line)
      expect(markup.match(/<input /g)).toHaveLength(expected.length)
    })
  }

  it('a choice has buttons and no box', () => {
    const markup = html({ prompt: 'Which?', answerKind: 'choice', choices: ['1/2', '1/4'] })
    expect(markup).not.toContain('<input')
    expect(markup).not.toMatch(/Type /)
  })
})
