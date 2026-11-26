import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P199: a table of outcomes ("A coin is tossed and a die is rolled. Fill in the table."): its empty cells take outcomes like H4, typed with the keyboard, and the
// results mark each cell. react-dom only: no server, no browser.

const OUTCOMES: Question = {
  prompt: 'A coin is tossed and a die is rolled. Fill in the table.',
  render: 'text',
  answer: 'T1; T2; H3; T3',
  answerKind: 'table',
  table: { columns: ['Die', 'H', 'T'], rows: [['1', 'H1', null], ['2', 'H2', null], ['3', null, null]] },
  difficulty: 2,
  why: 'Each outcome is a side of the coin and a number of the die.',
  rightWay: 'Write the letter of the column and the number of the row: T1, T2, H3.',
}
const at = { position: 2, phase: 'try' as const, index: 2, of: 15, young: true }

describe('a table of outcomes', () => {
  it('the browser gets the table and that its blanks take outcomes, never the outcomes', () => {
    const sent = stripQuestion(OUTCOMES, at)
    expect(sent.table).toEqual({ ...OUTCOMES.table, plain: false, outcomes: true })
    expect(JSON.stringify(sent)).not.toContain('T3')
    expect(answerShape(sent).kind).toBe('table')
  })

  it('the empty cells are boxes with the keyboard, and the line under them says what to write', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(OUTCOMES, at)} busy={false} onAnswer={onAnswer} />)
    const boxes = document.querySelectorAll<HTMLInputElement>('input[data-value-box]')
    expect(boxes).toHaveLength(4)
    expect(boxes[0]!.getAttribute('inputmode')).toBe('text')
    expect(screen.getByText('Write the outcome in each empty box: its column and its row together.')).toBeTruthy()
    fireEvent.change(boxes[0]!, { target: { value: 'T1' } })
    expect(boxes[0]!.value).toBe('T1')
  })

  it('the paper line asks for the outcomes', () => {
    expect(writeLine(answerShape(stripQuestion(OUTCOMES, at)))).toBe('Write the missing outcomes one after the other, with a semicolon between them.')
  })

  it('the results mark each cell', () => {
    const item: StoredItem = { phase: 'try', position: 2, question: OUTCOMES, answer: 'T1; T2; T3; T3', correct: false, difficulty: 2, seconds: 50 }
    const [m] = reviewOf([item])
    render(<Results firstName="Lerato" missed={[m!]} />)
    expect(document.body.textContent).toContain('H3')
    expect(document.body.textContent).toContain('T3')
  })
})
