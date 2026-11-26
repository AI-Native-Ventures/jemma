import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P175: a pin dragged along a number line (dragging is tried in a real browser; here the arrow keys). react-dom only: no server, no browser.

const put: Question = { prompt: 'Put 3/4 on the number line.', render: 'text', answer: '3/4', answerKind: 'fraction', pin: { min: 0, max: 1, parts: 4 }, difficulty: 1, why: 'w', rightWay: 'r' }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

describe('a pin on a number line', () => {
  it('the line is sent, never where the pin goes', () => {
    const sent = stripQuestion(put, at)
    expect(sent.pin).toEqual(put.pin)
    const shape = answerShape(sent)
    expect(shape.kind === 'pin' && shape.as).toBe('fraction')
    expect(shape.kind === 'pin' && shape.typed.kind).toBe('fraction')
  })

  it('the pin waits at 0; the arrow keys move it a mark at a time; the answer is sent as a fraction', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(put, at)} busy={false} onAnswer={onAnswer} />)
    expect(screen.getByText('Drag the pin along the line.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    for (let i = 0; i < 3; i++) fireEvent.keyDown(screen.getByRole('slider', { name: 'The pin' }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('3/4', expect.any(Number))
  })

  it('the fraction can be typed instead', () => {
    render(<QuestionScreen q={stripQuestion(put, at)} busy={false} onAnswer={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Or type the fraction instead' }))
    expect(screen.getByRole('button', { name: 'Or put the pin on the line instead' })).toBeTruthy()
  })

  it('paper and the results', () => {
    expect(writeLine(answerShape(stripQuestion(put, at)))).toContain('Mark the number on your paper, then write it.')
    const item: StoredItem = { phase: 'try', position: 1, question: put, answer: '1/2', correct: false, difficulty: 1, seconds: 15 }
    render(<Results firstName="Lerato" missed={reviewOf([item])} />)
    expect(document.querySelectorAll('[data-right]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-yours]')).toHaveLength(1)
  })
})
