import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyTap } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P173: shapes picked by tapping. react-dom only: no server, no browser.

const tap: Question = tidyTap({
  prompt: 'Tap all the triangles.',
  render: 'text',
  answer: '1; 3; 6',
  answerKind: 'list',
  tap: { shapes: [{ shape: 'triangle' }, { shape: 'square' }, { shape: 'triangle', turn: 180 }, { shape: 'circle' }, { shape: 'rectangle' }, { shape: 'right_triangle' }] },
  difficulty: 1,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

describe('tapping shapes', () => {
  it('the shapes are sent, never which ones fit', () => {
    const sent = stripQuestion(tap, at)
    expect(sent.tap).toEqual(tap.tap)
    expect(JSON.stringify(sent)).not.toContain('1; 3; 6')
    expect(answerShape(sent).kind).toBe('tap')
  })

  it('a tap picks a shape, a second tap takes it off, and the line counts the picks', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(tap, at)} busy={false} onAnswer={onAnswer} />)
    for (const n of [1, 2, 3, 6]) fireEvent.click(screen.getByRole('button', { name: `Shape ${n}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Shape 2' }))
    expect(screen.getByRole('group', { name: '6 shapes, 3 picked.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('1; 3; 6', expect.any(Number))
  })

  it('a keyboard picks a shape too', () => {
    render(<QuestionScreen q={stripQuestion(tap, at)} busy={false} onAnswer={() => {}} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Shape 4' }), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Shape 4' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('paper asks for the numbers; the results circle a shape that was missed', () => {
    expect(writeLine(answerShape(stripQuestion(tap, at)))).toBe('Write the numbers of the shapes that fit, with a semicolon between them.')
    const item: StoredItem = { phase: 'try', position: 1, question: tap, answer: '1; 6', correct: false, difficulty: 1, seconds: 12 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: '2 shapes', right: '3 shapes' })
    render(<Results firstName="Thabo" missed={[m!]} />)
    expect(document.querySelectorAll('[data-pen]')).toHaveLength(1)
  })
})
