import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Choice, Question, SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stripLessonQuestion, type StrippedQuestion } from '../lib/teaching'

// P149b: the "Your turn" block of a teaching lesson (P144) after P149. A lesson question may now have picture choices, be true or false, or ask for a reason:
// string choices work as before (now up to E), a picture choice is drawn as a card and written as "Picture B", and the answer sent is the letter, the word
// or the reason. The server action is a double: no database, no browser, no model.

const actions = vi.hoisted(() => ({ answerLessonQuestion: vi.fn() }))
vi.mock('../app/k/learn/actions', () => actions)

import { TryBlock } from '../app/k/learn/_parts/TryBlock'

const LINE: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 1, c: 0 }] }
const PARABOLA: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'parabola', a: 1, q: -4 }] }

const block = (question: StrippedQuestion) =>
  render(<TryBlock index={0} question={question} hint="A hint." topicLessonId="lesson-1" topic="Graphs" typeset="algebra" pictureFirst={false} open onOpen={() => undefined} />)
const ask = (over: Partial<StrippedQuestion>): StrippedQuestion => ({ prompt: 'Which graph is y = x² − 4?', render: 'text', answerKind: 'choice', ...over })
const check = () => screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement

afterEach(() => {
  cleanup()
  actions.answerLessonQuestion.mockReset()
})

describe('a try block with choices', () => {
  it('string choices are the buttons they were, up to a fifth that is E', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: true, answer: '5', rightWay: 'Count.', why: '' })
    block(ask({ choices: ['1', '2', '3', '4', '5'] }))
    expect(check().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(check())
    await waitFor(() => expect(actions.answerLessonQuestion).toHaveBeenCalledWith('lesson-1', { kind: 'try', block: 0 }, 'E'))
  })

  it('picture choices are cards, the letter is sent, and a missed one is shown as "Picture B" beside the right one', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: false, answer: 'Picture A', rightWay: 'Shift it down four.', why: '' })
    const choices: Choice[] = [{ diagram: PARABOLA }, { diagram: LINE }, { diagram: LINE, text: 'the line' }]
    block(ask({ choices }))
    const cards = within(screen.getByRole('group', { name: 'Choices' })).getAllByRole('button')
    expect(cards).toHaveLength(3)
    fireEvent.click(cards[1]!)
    fireEvent.click(check())
    await waitFor(() => expect(actions.answerLessonQuestion).toHaveBeenCalledWith('lesson-1', { kind: 'try', block: 0 }, 'B'))
    await waitFor(() => expect(document.querySelector('[data-result="wrong"]')).toBeTruthy())
    const status = document.querySelector('[data-result="wrong"]')!
    expect(status.textContent).toContain('You wrote:')
    expect(status.textContent).toContain('Picture B')
    expect(status.textContent).toContain('Picture A')
  })

  it('a picture choice with words is written as its words', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: false, answer: 'Picture A', rightWay: 'Look again.', why: '' })
    block(ask({ choices: [{ diagram: PARABOLA }, { diagram: LINE, text: 'the line' }] }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Choices' })).getAllByRole('button')[1]!)
    fireEvent.click(check())
    await waitFor(() => expect(document.querySelector('[data-result="wrong"]')?.textContent).toContain('the line'))
  })
})

describe('a try block that is true or false, or asks for a reason', () => {
  it('true or false: two buttons, and the word is sent', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: true, answer: 'True', rightWay: 'Yes.', why: '' })
    block(ask({ prompt: 'The line y = 2x + 1 crosses the y-axis at 1.', answerKind: 'truefalse' }))
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'True' }))
    fireEvent.click(check())
    await waitFor(() => expect(actions.answerLessonQuestion).toHaveBeenCalledWith('lesson-1', { kind: 'try', block: 0 }, 'True'))
  })

  it('a reason: the list, and the reason is sent', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: true, answer: 'Pythagoras', rightWay: 'Yes.', why: '' })
    block(ask({ prompt: 'Why is AC² = AB² + BC²?', answerKind: 'reason' }))
    expect(check().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Pythagoras' }))
    fireEvent.click(check())
    await waitFor(() => expect(actions.answerLessonQuestion).toHaveBeenCalledWith('lesson-1', { kind: 'try', block: 0 }, 'Pythagoras'))
  })

  it('a reason with a value needs the number and the reason, and sends them together', async () => {
    actions.answerLessonQuestion.mockResolvedValue({ correct: true, answer: '5; Pythagoras', rightWay: 'Yes.', why: '' })
    block(ask({ prompt: 'Find AC, and say why.', answerKind: 'reason', withValue: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Pythagoras' }))
    expect(check().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('1. The value'), { target: { value: '5' } })
    fireEvent.click(check())
    await waitFor(() => expect(actions.answerLessonQuestion).toHaveBeenCalledWith('lesson-1', { kind: 'try', block: 0 }, '5; Pythagoras'))
  })
})

describe('a stripped lesson question still holds no answer, no steps, no why and no right way, for every kind', () => {
  const full = (over: Partial<Question>): Question => ({
    prompt: 'A question',
    render: 'text',
    answer: 'KEY-SECRET',
    answerKind: 'whole',
    steps: ['STEP-SECRET-A', 'STEP-SECRET-B'],
    difficulty: 1,
    why: 'WHY-SECRET',
    rightWay: 'WAY-SECRET',
    ...over,
  })

  it.each([
    ['true or false', full({ answerKind: 'truefalse', answer: 'true', choices: ['True', 'False'] })],
    ['a reason', full({ answerKind: 'reason', answer: 'KEY-SECRET; Pythagoras' })],
    ['a reason with no value', full({ answerKind: 'reason', answer: 'Pythagoras' })],
    ['picture choices', full({ answerKind: 'choice', answer: 'B', choices: [{ diagram: LINE }, { diagram: PARABOLA }] })],
    ['string choices', full({ answerKind: 'choice', answer: 'B', choices: ['1', '2'] })],
  ])('%s', (_name, question) => {
    const sent = JSON.stringify(stripLessonQuestion(question))
    for (const secret of ['KEY-SECRET', 'STEP-SECRET', 'WHY-SECRET', 'WAY-SECRET']) expect(sent, secret).not.toContain(secret)
    const keys = Object.keys(stripLessonQuestion(question))
    for (const field of ['answer', 'steps', 'why', 'rightWay', 'difficulty']) expect(keys, field).not.toContain(field)
    // True or false sends no choices; a reason sends only whether it has a value box, never the value or the reason.
    expect(sent).not.toContain('Pythagoras')
  })

  it('a reason with a value says so, and a true or false question sends no choices', () => {
    expect(stripLessonQuestion(full({ answerKind: 'reason', answer: '5; Pythagoras' })).withValue).toBe(true)
    expect(stripLessonQuestion(full({ answerKind: 'reason', answer: 'Pythagoras' })).withValue).toBeUndefined()
    expect(stripLessonQuestion(full({ answerKind: 'truefalse', answer: 'true', choices: ['True', 'False'] })).choices).toBeUndefined()
  })
})
