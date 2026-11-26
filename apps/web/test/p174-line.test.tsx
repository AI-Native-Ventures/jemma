import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyLine } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P174: a straight line drawn through two tapped points (tapping is tried in a real browser). react-dom only: no server, no browser.

const draw: Question = tidyLine({
  prompt: 'Draw the graph of y = 2x − 1. Tap two points on the line.',
  render: 'text',
  steps: ['x = 0: y = −1', 'x = 2: y = 3'],
  answer: '0; -1; 2; 3',
  answerKind: 'list',
  line: { xMin: -6, xMax: 6, yMin: -4, yMax: 4 },
  difficulty: 2,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }

describe('drawing a line', () => {
  it('the grid is sent, never the line', () => {
    const sent = stripQuestion(draw, at)
    expect(sent.line).toEqual(draw.line)
    expect(JSON.stringify(sent)).not.toContain('0; -1; 2; 3')
    expect(answerShape(sent).kind).toBe('line')
  })

  it('starts by asking for the first point; two points can be typed instead', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(draw, at)} busy={false} onAnswer={onAnswer} />)
    expect(screen.getByText('Tap the first point of your line.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Or type two points instead' }))
    for (const [label, v] of [['First x', '1'], ['First y', '1'], ['Second x', '3'], ['Second y', '5']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('1; 1; 3; 5', expect.any(Number))
  })

  it('paper asks for two points; the results draw the right line and the learner’s other line dashed', () => {
    expect(writeLine(answerShape(stripQuestion(draw, at)))).toBe('Write two points your line goes through: x1; y1; x2; y2.')
    const item: StoredItem = { phase: 'try', position: 1, question: draw, answer: '0; 1; 1; 3', correct: false, difficulty: 2, seconds: 30 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: '(0; 1) and (1; 3)', right: '(0; -1) and (2; 3)' })
    render(<Results firstName="Zanele" missed={[m!]} />)
    expect(document.querySelectorAll('[data-line="right"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-line="yours"]')).toHaveLength(1)
  })
})
