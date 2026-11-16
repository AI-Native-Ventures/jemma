import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import type { QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P132: if the maths editor cannot start (no network for its chunk, an old browser), the child still gets a box to write in: a plain one, with the old
// "It reads:" line under it. The editor is made to fail here.
vi.mock('mathlive', () => {
  throw new Error('the editor did not start')
})

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })

describe('when the maths editor cannot start', () => {
  it('a plain text box takes its place, with its label, its help line and the answer as the child types it', async () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={ask({ prompt: 'Simplify x + x + 3', answerKind: 'expression' })} busy={false} onAnswer={onAnswer} />)
    await waitFor(() => expect(document.querySelector('[data-fallback]')).toBeTruthy())
    const box = screen.getByLabelText('Your answer') as HTMLInputElement
    expect(box.tagName).toBe('INPUT')
    expect(document.querySelector('math-field')).toBeNull()
    expect(screen.getByText('Type an expression, like 2x + 3.')).toBeTruthy()
    expect(document.querySelector('[data-fallback]')).toBeTruthy()
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    fireEvent.change(box, { target: { value: '2x^2 + 7x' } })
    expect(next.disabled).toBe(false)
    expect(document.querySelector('[data-reads] .msupsub')!.textContent).toBe('2')
    fireEvent.click(next)
    expect(onAnswer).toHaveBeenCalledWith('2x^2 + 7x', expect.any(Number))
  })

  it('a number answer too, and nothing past the longest answer the server takes', async () => {
    render(<QuestionScreen q={ask({ prompt: 'What is 3 - 6?', answerKind: 'number' })} busy={false} onAnswer={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-fallback]')).toBeTruthy())
    const box = screen.getByLabelText('Your answer') as HTMLInputElement
    expect(box.maxLength).toBe(60)
    fireEvent.change(box, { target: { value: '9'.repeat(80) } })
    expect(box.value).toHaveLength(60)
  })
})
