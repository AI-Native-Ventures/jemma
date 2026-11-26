import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyFirstPrinciples } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerMaxLength, answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'
import { fakeMathlive } from './fake-mathlive'

// P185: a derivative from first principles, line by line: the first line is given, each line after it is its own maths editor (stood in for by a fake, see
// fake-mathlive.ts), and "lim h→0" stands in front of a line while h is in it. react-dom only: no server, no browser, no database.
vi.mock('mathlive', () => fakeMathlive())

const KEY = '(2(x + h)^2 - 3(x + h) - (2x^2 - 3x))/h; (4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x - 3'
const limit: Question = tidyFirstPrinciples({
  prompt: 'Determine f′(x) from first principles if f(x) = 2x² − 3x.',
  render: 'text',
  steps: ['f(x + h) − f(x) = 4xh + 2h² − 3h', 'divide by h, then let h go to 0'],
  answer: KEY,
  answerKind: 'list',
  firstPrinciples: { f: '2x^2 - 3x' },
  difficulty: 3,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const fields = () => Array.from(document.querySelectorAll('math-field')) as unknown as (HTMLElement & { setValue: (latex: string) => void })[]
const ready = async (n: number) => waitFor(() => expect(fields().filter((f) => f.getAttribute('data-ready') === 'true')).toHaveLength(n))
const write = (n: number, latex: string) => act(() => fields()[n - 1]!.setValue(latex))
const leadOf = (n: number) => document.querySelector(`[data-limit-line="${n}"] [data-lead]`)!.getAttribute('data-lead')

describe('a derivative from first principles, line by line', () => {
  it('the function is sent, never the lines', () => {
    const sent = stripQuestion(limit, at)
    expect(sent.firstPrinciples).toEqual({ f: '2x^2 - 3x' })
    expect(JSON.stringify(sent)).not.toContain('(4xh + 2h^2 - 3h)/h')
    expect(answerShape(sent).kind).toBe('firstPrinciples')
  })

  it('the first line is given; lim stands in front of a line while h is in it; the lines go up once 3 hold something', async () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(limit, at)} busy={false} onAnswer={onAnswer} />)
    await ready(1)
    expect(document.querySelector('[data-first-principles="start"]')!.textContent).toContain('f′(x) is the limit, as h goes to 0, of f(x + h) minus f(x), all over h.')
    expect(screen.getByText('Write one line at a time, down to f′(x): at least 3 lines. Jemma puts lim in front while there is an h.')).toBeTruthy()
    expect(leadOf(1)).toBe('limit')
    write(1, '\\frac{2\\left(x+h\\right)^2-3\\left(x+h\\right)-\\left(2x^2-3x\\right)}{h}')
    fireEvent.click(screen.getByRole('button', { name: 'New line' }))
    await ready(2)
    // An empty line after a line with h is still under the limit.
    expect(leadOf(2)).toBe('limit')
    write(2, '4x+2h-3')
    fireEvent.click(screen.getByRole('button', { name: 'New line' }))
    await ready(3)
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    write(3, '4x-3')
    // h is gone: the limit is taken, and only = stands in front.
    expect(leadOf(3)).toBe('equals')
    expect(leadOf(2)).toBe('limit')
    expect(screen.getByText('Tap a line to change it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('(2(x + h)^2 - 3(x + h) - (2x^2 - 3x))/h; 4x + 2h - 3; 4x - 3', expect.any(Number))
  })

  it('the lines of a proof or of first principles may be longer than a list', () => {
    expect(answerMaxLength(limit)).toBe(720)
    expect(answerMaxLength({ answerKind: 'list', proof: { left: 'a', right: 'b' } })).toBe(720)
    expect(answerMaxLength({ answerKind: 'list' })).toBe(240)
    expect(answerMaxLength({ answerKind: 'expression' })).toBe(60)
  })
})

describe('on paper and in the results', () => {
  it('paper asks for the lines after the first one, one at a time', () => {
    expect(writeLine(answerShape(stripQuestion(limit, at)))).toBe('Start with f′(x) = lim h→0 (f(x + h) − f(x))/h. Write each line after it on a new row, down to f′(x): at least 3 lines.')
  })

  it('the red pen marks the line that takes the limit too soon, says why, and gives the line it should have been', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: limit, answer: '(4xh + 2h^2 - 3h)/h; 4x - 3; -3 + 4x', correct: false, difficulty: 3, seconds: 120 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'Line 2', right: '(4xh + 2h^2 - 3h)/h' })
    expect(m!.firstPrinciples).toMatchObject({ wrong: 1, why: 'soon', under: [true, false, false], rightUnder: true })
    render(<Results firstName="Thabo" missed={[m!]} />)
    expect(document.querySelectorAll('[data-limit-result="wrong"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-limit-result="fixed"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-limit-result="done"]')).toHaveLength(2)
    expect(document.querySelector('[data-limit-note]')!.textContent).toBe('h cannot be 0 yet. Cancel the h first.')
  })

  it('lines that stop before the limit, or end on a line that can be simpler, say so; right lines say how many there were', () => {
    const review = (answer: string, correct = false) => reviewOf([{ phase: 'try', position: 1, question: limit, answer, correct, difficulty: 3, seconds: 90 }])[0]!
    expect(review('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; h(4x + 2h - 3)/h')).toMatchObject({ wrote: 'It stops before the limit is taken', right: '4x - 3' })
    expect(review('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x + 2(0) - 3')).toMatchObject({ wrote: 'The last line can be simpler', right: '4x - 3' })
    expect(review(KEY, true).wrote).toBe('4 lines, from the limit to the derivative')
  })
})
