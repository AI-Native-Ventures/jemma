import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { PaperSheet } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P183: a clock face to read in a Grade 1 to 6 time question. react-dom only: no server, no browser.

const read: Question = {
  prompt: 'What time does the clock show?',
  render: 'text',
  answer: '4:30',
  answerKind: 'time',
  clockFace: { time: '4:30' },
  difficulty: 1,
  why: 'w',
  rightWay: 'r',
}
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }

describe('reading a clock face', () => {
  it('the face is sent with the question (it is its picture), and the answer is a time', () => {
    const sent = stripQuestion(read, at)
    expect(sent.clockFace).toEqual({ time: '4:30' })
    expect(answerShape(sent)).toMatchObject({ kind: 'time', style: 'clock24' })
  })

  it('the question shows the clock with no handles, said by where its hands point, never by the time', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(read, at)} busy={false} onAnswer={onAnswer} />)
    const clock = document.querySelector('[data-picture="clock"] svg')!
    expect(clock.getAttribute('data-clock')).toBe('results')
    expect(clock.getAttribute('aria-label')).toBe('A clock. The long hand is on the 6. The short hand is between the 4 and the 5.')
    expect(clock.getAttribute('aria-label')).not.toContain('4:30')
    expect(document.querySelectorAll('[data-hand][role="slider"]')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('4:30', expect.any(Number))
  })

  it('paper and the results card show the clock too', () => {
    render(<PaperSheet questions={[stripQuestion(read, at)]} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
    expect(document.querySelectorAll('[data-picture="clock"]').length).toBeGreaterThan(0)
    const item: StoredItem = { phase: 'try', position: 1, question: read, answer: '5:30', correct: false, difficulty: 1, seconds: 20 }
    const [m] = reviewOf([item])
    expect(m!.clockFace).toEqual({ time: '4:30' })
    document.body.innerHTML = ''
    render(<Results firstName="Amina" missed={[m!]} />)
    expect(document.querySelectorAll('[data-picture="clock"]')).toHaveLength(1)
  })
})
