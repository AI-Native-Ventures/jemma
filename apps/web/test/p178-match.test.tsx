import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyMatch } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P178: things matched in pairs by tapping one, then the one it goes with. react-dom only: no server, no browser (tapping is tried in a real browser too).

const names: Question = tidyMatch({
  prompt: 'Match each number to its name.',
  render: 'text',
  answer: '3; 1; 2',
  answerKind: 'list',
  match: { left: ['7', '12', '20'], right: ['twelve', 'twenty', 'seven'] },
  difficulty: 1,
  why: 'w',
  rightWay: 'r',
})
const shapes: Question = tidyMatch({
  prompt: 'Match each shape to its name.',
  render: 'text',
  answer: '2; 3; 1',
  answerKind: 'list',
  match: { left: ['triangle', 'square', 'circle'], right: ['circle', 'triangle', 'square'], pictures: true },
  difficulty: 1,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const live = () => document.querySelector('p[aria-live]')!.textContent

describe('matching pairs', () => {
  it('the things are sent, never which goes with which', () => {
    const sent = stripQuestion(names, at)
    expect(sent.match).toEqual(names.match)
    expect(JSON.stringify(sent)).not.toContain('3; 1; 2')
    expect(answerShape(sent).kind).toBe('match')
  })

  it('a tap on each side joins a pair; the line under them counts the pairs and never says whether they are right', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(names, at)} busy={false} onAnswer={onAnswer} />)
    expect(live()).toBe('Tap a number, then tap its name.')
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    fireEvent.click(screen.getByRole('button', { name: 'twenty' }))
    expect(live()).toBe('1 pair joined. Tap a number, then tap its name.')
    fireEvent.click(screen.getByRole('button', { name: '12' }))
    expect(live()).toBe('1 pair joined. 12 is waiting for its name.')
    fireEvent.click(screen.getByRole('button', { name: 'twelve' }))
    // Joining 20 to twenty moves the line that went from 7 to twenty.
    fireEvent.click(screen.getByRole('button', { name: 'twenty' }))
    expect(live()).toBe('2 pairs joined. twenty is waiting for its match.')
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    expect(live()).toBe('2 pairs joined. Tap a number, then tap its name.')
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    fireEvent.click(screen.getByRole('button', { name: 'seven' }))
    expect(live()).toBe('All 3 pairs joined. Tap a line to take it off.')
    fireEvent.click(screen.getByRole('button', { name: 'Take off the line from 12 to twelve' }))
    expect(live()).toBe('2 pairs joined. Tap a number, then tap its name.')
    fireEvent.click(screen.getByRole('button', { name: 'twelve' }))
    fireEvent.click(screen.getByRole('button', { name: '12' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('3; 1; 2', expect.any(Number))
  })

  it('a shape is drawn, and said by what it looks like, never by its name', () => {
    render(<QuestionScreen q={stripQuestion(shapes, at)} busy={false} onAnswer={vi.fn()} />)
    expect(live()).toBe('Tap a shape, then tap its name.')
    fireEvent.click(screen.getByRole('button', { name: 'a shape with 3 straight sides' }))
    expect(live()).toBe('The shape you picked is waiting for its name.')
    expect(screen.queryByRole('button', { name: 'triangle' })).not.toBeNull()
    expect(document.querySelectorAll('[data-match="left"] text')).toHaveLength(0)
  })
})

describe('on paper and in the results', () => {
  it('paper numbers the ones on the right and asks for the number of each partner', () => {
    expect(writeLine(answerShape(stripQuestion(names, at)))).toBe('For each one on the left, write the number of the one it goes with, in order, with a semicolon between them. The ones on the right are numbered from 1.')
  })

  it('the results say the pairs in words and draw a right pair in green and a wrong one in red pen', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: names, answer: '3; 2; 1', correct: false, difficulty: 1, seconds: 30 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: '7 with seven, 12 with twenty and 20 with twelve', right: '7 with seven, 12 with twelve and 20 with twenty' })
    render(<Results firstName="Sipho" missed={[m!]} />)
    expect(document.querySelectorAll('[data-line][data-ok="true"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-line][data-ok="false"]')).toHaveLength(2)
  })

  it('a right answer is said as all the pairs', () => {
    const [m] = reviewOf([{ phase: 'try', position: 1, question: names, answer: '3; 1; 2', correct: true, difficulty: 1, seconds: 30 }])
    expect(m!.wrote).toBe('All 3 pairs')
  })
})
