import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { PaperSheet, writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P168: a sum worked in columns. The learner writes the answer digit by digit from the ones with the keypad under the sum (or a keyboard), may write a carry
// in a small box, and the results show their digits with a wrong one circled in red pen. react-dom only: no server, no browser.

const base = { render: 'text' as const, difficulty: 2 as const, why: 'w', rightWay: 'r' }
const add: Question = { ...base, prompt: 'Work out 347 + 285 in columns.', answer: '632', answerKind: 'whole', columns: { op: '+', numbers: ['347', '285'] } }
const take: Question = { ...base, prompt: 'Work out 503 - 286 in columns.', answer: '217', answerKind: 'whole', columns: { op: '-', numbers: ['503', '286'] } }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

const show = (q: Question) => {
  const onAnswer = vi.fn()
  render(<QuestionScreen q={stripQuestion(q, at)} busy={false} onAnswer={onAnswer} />)
  return onAnswer
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const key = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const box = (place: string) => screen.getByRole('button', { name: new RegExp(`^Answer, ${place}`) })

describe('what the browser is given', () => {
  it('the sum, and never the answer', () => {
    const sent = stripQuestion(add, at)
    expect(sent.columns).toEqual(add.columns)
    expect(JSON.stringify(sent)).not.toContain('632')
    expect(answerShape(sent).kind).toBe('columns')
  })
})

describe('working a sum in columns', () => {
  it('starts in the ones box; each digit opens the next box to the left; Next waits for the answer', () => {
    const onAnswer = show(add)
    expect(screen.getByText('Start with the ones. The next box opens by itself.')).toBeTruthy()
    expect(box('ones').getAttribute('aria-pressed')).toBe('true')
    expect(next().disabled).toBe(true)
    key('2')
    expect(box('tens').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Tap a small box to carry a digit.')).toBeTruthy()
    key('3')
    key('6')
    // The box open now is the thousands, still empty: the learner may carry into it. On a box with a digit the line says how to change it.
    expect(box('thousands').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(box('hundreds, 6'))
    expect(screen.getByText('Tap a box to change its digit.')).toBeTruthy()
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('632', expect.any(Number))
  })

  it('a carry goes in a small box, and the learner goes on in the column it went to; a carry is not part of the answer', () => {
    const onAnswer = show(add)
    key('2')
    fireEvent.click(screen.getByRole('button', { name: 'Small box over the tens' }))
    key('1')
    expect(screen.getByRole('button', { name: 'Small box over the tens, 1' })).toBeTruthy()
    expect(box('tens').getAttribute('aria-pressed')).toBe('true')
    key('3')
    key('6')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('632', expect.any(Number))
  })

  it('Delete clears a box, a tap chooses one to change, and a gap in the answer means it is not ready', () => {
    show(add)
    key('2')
    key('3')
    key('6')
    fireEvent.click(box('tens, 3'))
    key('Delete')
    expect(next().disabled).toBe(true)
    key('3')
    expect(next().disabled).toBe(false)
  })

  it('a keyboard works too', () => {
    const onAnswer = show(take)
    fireEvent.keyDown(box('ones'), { key: '7' })
    fireEvent.keyDown(box('tens'), { key: '1' })
    fireEvent.keyDown(box('hundreds'), { key: '2' })
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('217', expect.any(Number))
  })

  it('a take away has no extra box and says how to use the small boxes', () => {
    show(take)
    expect(screen.queryByRole('button', { name: /^Answer, thousands/ })).toBeNull()
    key('7')
    expect(screen.getByText('Tap a small box to write your working.')).toBeTruthy()
    expect(screen.getByRole('group', { name: '503 take away 286, written in columns.' })).toBeTruthy()
  })
})

describe('on paper and in the results', () => {
  it('paper shows the sum with empty boxes', () => {
    expect(writeLine(answerShape(stripQuestion(add, at)))).toBe('Work it in columns and write the answer under the line.')
    render(<PaperSheet questions={[stripQuestion(add, at)]} busy={false} error={null} onPhoto={() => {}} onScreen={() => {}} />)
    expect(document.querySelectorAll('[data-columns="+"]')).toHaveLength(1)
  })

  it('a wrong digit is circled in red pen with the right one beside it', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: add, answer: '532', correct: false, difficulty: 2, seconds: 30 }
    const [m] = reviewOf([item])
    expect(m!.columnsPlaces!.map((p) => p.ok)).toEqual([true, false, true, true])
    render(<Results firstName="Thabo" missed={[m!]} />)
    expect(document.querySelectorAll('[data-place="wrong"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-place="ok"]')).toHaveLength(3)
  })
})
