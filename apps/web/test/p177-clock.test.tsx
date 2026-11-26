import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { clockHint } from '../app/k/session/_parts/answers/ClockFace'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P177: a clock the learner sets by dragging its hands. Dragging is tried in a real browser (a test page has no layout); here: what is sent, the arrow keys,
// the line under the clock, the time typed instead, paper and the results. react-dom only: no server, no browser.

const show: Question = {
  prompt: 'Show half past 4 on the clock.',
  render: 'text',
  answer: '4:30',
  answerKind: 'time',
  clock: { step: 30 },
  difficulty: 1,
  why: 'w',
  rightWay: 'r',
}
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }

describe('setting a clock', () => {
  it('the clock is sent, never the time', () => {
    const sent = stripQuestion(show, at)
    expect(sent.clock).toEqual({ step: 30 })
    expect(JSON.stringify(sent)).not.toContain('4:30')
    const shape = answerShape(sent)
    expect(shape.kind).toBe('clock')
    expect(shape.kind === 'clock' && shape.typed).toMatchObject({ kind: 'time', style: 'clock24' })
  })

  it('the line under the clock says which hand is next, never the time', () => {
    const t = { hour: 4, minute: 30 }
    expect(clockHint({ hour: false, minute: false }, t)).toBe('Drag the long hand first, then the short hand.')
    expect(clockHint({ hour: false, minute: true }, t)).toBe('Now drag the short hand.')
    expect(clockHint({ hour: true, minute: false }, t)).toBe('Now drag the long hand.')
    expect(clockHint({ hour: true, minute: true }, t)).toBe('The short hand sits between the numbers by itself.')
    expect(clockHint({ hour: true, minute: true }, { hour: 7, minute: 0 })).toBe('Drag a hand again to move it.')
  })

  it('the hands move with the arrow keys, one stop at a time, and the clock gives its time', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(show, at)} busy={false} onAnswer={onAnswer} />)
    expect(screen.getByText('Drag the long hand first, then the short hand.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    const long = screen.getByRole('slider', { name: 'The long hand' })
    expect(long.getAttribute('aria-valuetext')).toBe('on the 12')
    fireEvent.keyDown(long, { key: 'ArrowRight' })
    expect(screen.getByRole('slider', { name: 'The long hand' }).getAttribute('aria-valuetext')).toBe('on the 6')
    expect(screen.getByText('Now drag the short hand.')).toBeTruthy()
    for (let k = 0; k < 4; k++) fireEvent.keyDown(screen.getByRole('slider', { name: 'The short hand' }), { key: 'ArrowRight' })
    expect(screen.getByRole('slider', { name: 'The short hand' }).getAttribute('aria-valuetext')).toBe('between the 4 and the 5')
    expect(screen.getByText('The short hand sits between the numbers by itself.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('4:30', expect.any(Number))
  })

  it('the time can be typed instead', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(show, at)} busy={false} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Or type the time instead' }))
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('4:30', expect.any(Number))
  })
})

describe('on paper and in the results', () => {
  it('paper asks for the hands to be drawn and the time written', () => {
    expect(writeLine(answerShape(stripQuestion(show, at)))).toMatch(/^Draw the hands on the clock on your paper\. Then write the time\. /)
  })

  it('the results say both times the way they are said, and draw the learner’s clock beside the right one', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: show, answer: '5:30', correct: false, difficulty: 1, seconds: 20 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'half past 5', right: 'half past 4', clockWrote: { hour: 5, minute: 30 }, clockRight: { hour: 4, minute: 30 } })
    render(<Results firstName="Amina" missed={[m!]} />)
    expect(document.querySelectorAll('[data-clock-result="yours"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-clock-result="right"]')).toHaveLength(1)
    expect(document.querySelector('[data-clock-result="right"]')!.textContent).toMatch(/12Right answer$/)
    expect(document.querySelector('[data-clock-result="yours"]')!.textContent).toMatch(/12Yours$/)
  })

  it('a right clock is drawn once, in green; a typed answer that is no time stays as typed', () => {
    const right = reviewOf([{ phase: 'try', position: 1, question: show, answer: '16:30', correct: true, difficulty: 1, seconds: 20 }])[0]!
    expect(right.wrote).toBe('half past 4')
    render(<Results firstName="Amina" missed={[right]} />)
    expect(document.querySelectorAll('[data-clock-result]')).toHaveLength(1)
    const odd = reviewOf([{ phase: 'try', position: 1, question: show, answer: 'half four', correct: false, difficulty: 1, seconds: 20 }])[0]!
    expect(odd.clockWrote).toBeNull()
    expect(odd.wrote).toBe('half four')
  })
})
