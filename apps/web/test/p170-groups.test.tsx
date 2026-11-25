import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyGroups } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P170: things sorted into groups: tap a card and then its group (dragging is tried in a real browser), move a card again, and the results show the groups
// with a card in the wrong group circled. react-dom only: no server, no browser.

const base = { render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const sort: Question = tidyGroups({ ...base, prompt: 'Drag each number into its group.', answer: '2; 1; 1; 2', answerKind: 'list', groups: { names: ['Odd', 'Even'], items: ['12', '7', '15', '20'] } })
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

const show = () => {
  const onAnswer = vi.fn()
  render(<QuestionScreen q={stripQuestion(sort, at)} busy={false} onAnswer={onAnswer} />)
  return onAnswer
}
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
const move = (item: string, group: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${item}`) }))
  fireEvent.click(screen.getByRole('button', { name: `Put ${item} in ${group}` }))
}

describe('sorting into groups', () => {
  it('the groups and the things are sent, never which goes where', () => {
    const sent = stripQuestion(sort, at)
    expect(sent.groups).toEqual(sort.groups)
    expect(JSON.stringify(sent)).not.toContain('2; 1; 1; 2')
    expect(answerShape(sent).kind).toBe('groups')
  })

  it('tap a card, then its group; the line counts what is left; Next waits for every card', () => {
    const onAnswer = show()
    expect(screen.getByText('Drag each one into its group, or tap it and then tap its group.')).toBeTruthy()
    move('7', 'Odd')
    move('12', 'Even')
    expect(screen.getByText(/in groups,/)).toBeTruthy()
    expect(next().disabled).toBe(true)
    move('15', 'Odd')
    move('20', 'Even')
    expect(screen.getByText(/are in a group/)).toBeTruthy()
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2; 1; 1; 2', expect.any(Number))
  })

  it('a card in a group can be moved to the other group', () => {
    const onAnswer = show()
    move('7', 'Even')
    move('7', 'Odd')
    move('12', 'Even')
    move('15', 'Odd')
    move('20', 'Even')
    fireEvent.click(next())
    expect(onAnswer).toHaveBeenCalledWith('2; 1; 1; 2', expect.any(Number))
  })
})

describe('on paper and in the results', () => {
  it('paper lists the things and says how to write the groups', () => {
    expect(writeLine(answerShape(stripQuestion(sort, at)))).toBe('Write the group of each one, in order: 1 for Odd, 2 for Even. Put a semicolon between them.')
  })

  it('the results say the groups in words and circle a card in the wrong group', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: sort, answer: '2; 1; 2; 2', correct: false, difficulty: 1, seconds: 20 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'Odd: 7. Even: 12, 15 and 20.', right: 'Odd: 7 and 15. Even: 12 and 20.' })
    expect(m!.cells).toBeUndefined()
    render(<Results firstName="Musa" missed={[m!]} />)
    expect(document.querySelectorAll('[data-placed="wrong"]')).toHaveLength(1)
    expect(screen.getByText('to Odd')).toBeTruthy()
  })
})
