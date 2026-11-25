import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P169: a number built with place value blocks. A tap on "+ ten" or "+ one" puts a block on the mat, a tap on a block on the mat takes it off, and the line
// under the mat says what is on it. The results draw the learner's blocks. react-dom only: no server, no browser.

const base = { render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const make: Question = { ...base, prompt: 'Make 34 with tens and ones.', answer: '34', answerKind: 'whole', blocks: { places: ['tens', 'ones'] } }
const big: Question = { ...base, prompt: 'Make 205 with blocks.', answer: '205', answerKind: 'whole', blocks: { places: ['hundreds', 'tens', 'ones'] } }
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

const show = (q: Question) => {
  const onAnswer = vi.fn()
  render(<QuestionScreen q={stripQuestion(q, at)} busy={false} onAnswer={onAnswer} />)
  return onAnswer
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const add = (name: string, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByRole('button', { name: `+ ${name}` }))
}

describe('building a number with blocks', () => {
  it('starts with an empty mat; each tap adds a block and the line says what is on the mat', () => {
    const onAnswer = show(make)
    expect(answerShape(stripQuestion(make, at)).kind).toBe('blocks')
    expect(screen.getByRole('group', { name: 'The mat is empty.' })).toBeTruthy()
    expect(next().disabled).toBe(true)
    add('ten', 3)
    add('one', 4)
    expect(screen.getByText('3 tens and 4 ones')).toBeTruthy()
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('34', expect.any(Number))
  })

  it('a tap on a block on the mat takes it off, and an empty mat is no answer', () => {
    show(make)
    add('ten')
    add('one', 2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Take a one off the mat' })[0]!)
    expect(screen.getByText('1 ten and 1 one')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Take a ten off the mat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take a one off the mat' }))
    expect(next().disabled).toBe(true)
  })

  it('at most 9 of each block', () => {
    show(make)
    add('one', 9)
    expect((screen.getByRole('button', { name: '+ one' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('hundreds too, and a place with none is said as 0', () => {
    const onAnswer = show(big)
    add('hundred', 2)
    add('one', 5)
    expect(screen.getByText('2 hundreds, 0 tens and 5 ones')).toBeTruthy()
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('205', expect.any(Number))
  })
})

describe('on paper and in the results', () => {
  it('paper asks for the blocks to be drawn and the number written', () => {
    expect(writeLine(answerShape(stripQuestion(make, at)))).toBe('Draw the blocks, then write the number they make.')
  })

  it('the results draw the blocks the learner built', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: make, answer: '43', correct: false, difficulty: 1, seconds: 20 }
    render(<Results firstName="Naledi" missed={reviewOf([item])} />)
    expect(screen.getByRole('group', { name: 'Your blocks: 4 tens and 3 ones.' })).toBeTruthy()
  })
})
