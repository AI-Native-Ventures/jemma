import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyGraphMatch } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P184: graphs matched to their equations, drawn small on the left of the match board. react-dom only: no server, no browser.

const match: Question = tidyGraphMatch({
  prompt: 'Match each graph to its equation.',
  render: 'text',
  steps: ['a', 'b'],
  answer: '3; 1; 2',
  answerKind: 'list',
  graphMatch: {
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 5,
    graphs: [{ type: 'parabola', a: 1, q: -4 }, { type: 'line', m: 2, c: 1 }, { type: 'hyperbola', a: 2, q: 1 }],
    equations: ['y = 2x + 1', 'y = 2/x + 1', 'y = x^2 - 4'],
  },
  difficulty: 2,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const live = () => document.querySelector('p[aria-live]')!.textContent

describe('matching graphs to their equations', () => {
  it('the graphs and the equations are sent, never which goes with which', () => {
    const sent = stripQuestion(match, at)
    expect(sent.graphMatch).toEqual(match.graphMatch)
    expect(JSON.stringify(sent)).not.toContain('3; 1; 2')
    const shape = answerShape(sent)
    expect(shape.kind === 'match' && shape.match).toEqual({ left: ['Graph 1', 'Graph 2', 'Graph 3'], right: ['y = 2x + 1', 'y = 2/x + 1', 'y = x² − 4'] })
  })

  it('each graph is drawn small; a graph and its equation are joined by two taps', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(match, at)} busy={false} onAnswer={onAnswer} />)
    expect(document.querySelectorAll('[data-mini-graph]')).toHaveLength(3)
    expect(live()).toBe('Tap a graph, then tap its equation.')
    fireEvent.click(screen.getByRole('button', { name: 'Graph 1' }))
    expect(live()).toBe('The graph you picked is waiting for its equation.')
    fireEvent.click(screen.getByRole('button', { name: 'y = x² − 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Graph 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'y = 2x + 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Graph 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'y = 2/x + 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('3; 1; 2', expect.any(Number))
  })

  it('the results draw the graphs with the learner’s lines, and say the pairs', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: match, answer: '3; 2; 1', correct: false, difficulty: 2, seconds: 40 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'Graph 1 with y = x² − 4, Graph 2 with y = 2/x + 1 and Graph 3 with y = 2x + 1', right: 'Graph 1 with y = x² − 4, Graph 2 with y = 2x + 1 and Graph 3 with y = 2/x + 1' })
    render(<Results firstName="Sarah" missed={[m!]} />)
    expect(document.querySelectorAll('[data-mini-graph]')).toHaveLength(3)
    expect(document.querySelectorAll('[data-line][data-ok="true"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-line][data-ok="false"]')).toHaveLength(2)
  })
})
