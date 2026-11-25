import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P172: parts of a shape shaded by tapping. A tap shades a part, a second tap clears it, and the line counts them. react-dom only: no server, no browser.

const shade: Question = { prompt: 'Shade 3/8 of the circle.', render: 'text', answer: '3', answerKind: 'whole', shade: { shape: 'circle', parts: 8 }, difficulty: 1, why: 'w', rightWay: 'r' }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

describe('shading parts', () => {
  it('a tap shades a part, a second tap clears it, and the line counts them', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(shade, at)} busy={false} onAnswer={onAnswer} />)
    expect(answerShape(stripQuestion(shade, at)).kind).toBe('shade')
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    const parts = document.querySelectorAll('[data-part]')
    expect(parts).toHaveLength(8)
    for (const k of [0, 1, 2, 3]) fireEvent.pointerDown(parts[k]!, { pointerId: 1 })
    fireEvent.pointerDown(parts[3]!, { pointerId: 1 })
    expect(screen.getByRole('group', { name: '3 of 8 parts shaded.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('3', expect.any(Number))
  })

  it('a keyboard can shade the parts too', () => {
    render(<QuestionScreen q={stripQuestion(shade, at)} busy={false} onAnswer={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Part 1' }))
    expect(screen.getByRole('group', { name: '1 of 8 parts shaded.' })).toBeTruthy()
  })

  it('paper asks for the shading and the count; the results draw the shape as shaded', () => {
    expect(writeLine(answerShape(stripQuestion(shade, at)))).toBe('Shade the parts on your paper, then write how many you shaded.')
    const item: StoredItem = { phase: 'try', position: 1, question: shade, answer: '3', correct: true, difficulty: 1, seconds: 12 }
    render(<Results firstName="Kagiso" missed={reviewOf([item])} />)
    expect(screen.getByRole('group', { name: 'Your shape: 3 of 8 parts shaded.' })).toBeTruthy()
  })
})
