import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyGeneral } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P180: every solution of a trig equation, typed in a frame for each family. react-dom only: no server, no browser.

const general: Question = tidyGeneral({
  prompt: 'Find the general solution of sin θ = 0,5.',
  render: 'text',
  steps: ['sin 30° = 0,5', 'θ = 30° or θ = 150°'],
  answer: '30; 360; 150; 360',
  answerKind: 'list',
  general: { letter: 'θ' },
  difficulty: 3,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('typing every solution', () => {
  it('the frame is sent, never the solutions', () => {
    const sent = stripQuestion(general, at)
    expect(sent.general).toEqual({ letter: 'θ' })
    expect(JSON.stringify(sent)).not.toContain('150')
    expect(answerShape(sent).kind).toBe('general')
  })

  it('one frame first; Add another solution opens the next; the families go up once each frame is filled', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(general, at)} busy={false} onAnswer={onAnswer} />)
    expect(document.querySelector('[data-family="1"]')!.textContent).toContain('θ =')
    expect(screen.getByText('k is any integer: k ∈ ℤ')).toBeTruthy()
    type('Solution 1: the angle, in degrees', '30')
    type('Solution 1: how often it comes back, in degrees', '360')
    expect(screen.getByText('Add another solution if there is one.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add another solution' }))
    expect(document.querySelector('[data-family="2"]')!.textContent).toContain('or θ =')
    type('Solution 2: the angle, in degrees', '150')
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    type('Solution 2: how often it comes back, in degrees', '360')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('30; 360; 150; 360', expect.any(Number))
  })

  it('the period box takes numbers only; the angle box may be negative', () => {
    render(<QuestionScreen q={stripQuestion(general, at)} busy={false} onAnswer={vi.fn()} />)
    type('Solution 1: the angle, in degrees', '-30')
    type('Solution 1: how often it comes back, in degrees', '36a0')
    expect((screen.getByLabelText('Solution 1: the angle, in degrees') as HTMLInputElement).value).toBe('-30')
    expect((screen.getByLabelText('Solution 1: how often it comes back, in degrees') as HTMLInputElement).value).toBe('360')
  })
})

describe('on paper and in the results', () => {
  it('paper asks for the angle and the period of each family', () => {
    expect(writeLine(answerShape(stripQuestion(general, at)))).toBe('For each family of solutions write its angle and how often it comes back, in degrees, with a semicolon between them: θ = 12° + k · 360° is 12; 360.')
  })

  it('the results say both answers as families: the one that was missed is in the right answer', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: general, answer: '30; 360', correct: false, difficulty: 3, seconds: 60 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'θ = 30° + k · 360°', right: 'θ = 30° + k · 360° or θ = 150° + k · 360°' })
  })
})
