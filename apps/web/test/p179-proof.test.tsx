import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyProof } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'
import { fakeMathlive } from './fake-mathlive'

// P179: an identity proved line by line, each line its own maths editor (stood in for by a fake, see fake-mathlive.ts). Several lines start the editor in the
// same moment, so the stand-in is built at once. react-dom only: no server, no browser, no database.
vi.mock('mathlive', () => fakeMathlive())

const KEY = 'sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x); 1 + cos x'
const prove: Question = tidyProof({
  prompt: 'Prove that sin²x/(1 − cos x) = 1 + cos x.',
  render: 'text',
  steps: ['sin²x = 1 − cos²x', '1 − cos²x = (1 − cos x)(1 + cos x)'],
  answer: KEY,
  answerKind: 'list',
  proof: { left: 'sin^2 x/(1 - cos x)', right: '1 + cos x' },
  difficulty: 3,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const fields = () => Array.from(document.querySelectorAll('math-field')) as unknown as (HTMLElement & { setValue: (latex: string) => void })[]
const ready = async (n: number) => waitFor(() => expect(fields().filter((f) => f.getAttribute('data-ready') === 'true')).toHaveLength(n))
const write = (n: number, latex: string) => act(() => fields()[n - 1]!.setValue(latex))

describe('proving an identity line by line', () => {
  it('the two sides are sent, never the proof', () => {
    const sent = stripQuestion(prove, at)
    expect(sent.proof).toEqual(prove.proof)
    expect(JSON.stringify(sent)).not.toContain('(1 - cos^2 x)/(1 - cos x)')
    expect(answerShape(sent).kind).toBe('proof')
  })

  it('one line is open; New line opens the next; the lines go up once 3 hold something', async () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(prove, at)} busy={false} onAnswer={onAnswer} />)
    await ready(1)
    expect(screen.getByText('Write one line at a time, from the left side to the right side: at least 3 lines.')).toBeTruthy()
    expect(document.querySelector('[data-proof-line="1"]')!.textContent).toContain('LHS =')
    write(1, '\\frac{\\sin^2x}{1-\\cos x}')
    fireEvent.click(screen.getByRole('button', { name: 'New line' }))
    await ready(2)
    write(2, '\\frac{1-\\cos^2x}{1-\\cos x}')
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'New line' }))
    await ready(3)
    write(3, '1+\\cos x')
    expect(screen.getByText('Tap a line to change it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('sin^2(x)/(1 - cos(x)); (1 - cos^2(x))/(1 - cos(x)); 1 + cos(x)', expect.any(Number))
  })
})

describe('on paper and in the results', () => {
  it('paper asks for one line at a time', () => {
    expect(writeLine(answerShape(stripQuestion(prove, at)))).toBe('Write your proof one line at a time, from the left side to the right side: at least 3 lines. Start each line on a new row.')
  })

  it('the red pen marks the line that does not follow, with the line it should have been under it', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: prove, answer: 'sin^2 x/(1 - cos x); (1 + cos^2 x)/(1 - cos x); 1 + cos x', correct: false, difficulty: 3, seconds: 90 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'Line 2', right: '(1 - cos^2 x)/(1 - cos x)', proofWrong: 1 })
    render(<Results firstName="Neo" missed={[m!]} />)
    expect(document.querySelectorAll('[data-proof-result="wrong"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-proof-result="fixed"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-proof-result="done"]')).toHaveLength(2)
  })

  it('a proof that stops before the right side says so; a right one says how many lines it took', () => {
    const stops = reviewOf([{ phase: 'try', position: 1, question: prove, answer: 'sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x)', correct: false, difficulty: 3, seconds: 90 }])[0]!
    expect(stops).toMatchObject({ wrote: 'It stops before the right side', right: '1 + cos x', proofWrong: null })
    const right = reviewOf([{ phase: 'try', position: 1, question: prove, answer: KEY, correct: true, difficulty: 3, seconds: 90 }])[0]!
    expect(right.wrote).toBe('4 lines, from the left side to the right side')
  })
})
