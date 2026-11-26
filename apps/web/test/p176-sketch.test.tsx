import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyPlot } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { PlotGrid, sketchHint } from '../app/k/session/_parts/answers/PlotGrid'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P176: a sketch of a parabola: the learner taps its key points and Jemma joins them into the curve. Tapping is tried in a real browser (a test page has no
// layout); here: what is sent, the line under the grid, the curve, the points typed instead, paper and the results. react-dom only: no server, no browser.

const sketch: Question = tidyPlot({
  prompt: 'Sketch y = x² − 4. Tap where it cuts the x-axis, and its turning point.',
  render: 'text',
  steps: ['y = 0: x = 2 or x = −2', 'x = 0: y = −4'],
  answer: '-2; 0; 2; 0; 0; -4',
  answerKind: 'list',
  plot: { xMin: -4, xMax: 4, yMin: -5, yMax: 5, place: ['x-intercept', 'x-intercept', 'turning point'], curve: 'parabola' },
  difficulty: 2,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const text = (node: React.ReactNode) => render(<p>{node}</p>).container.textContent

describe('sketching a graph', () => {
  it('the grid is sent, never the key points', () => {
    const sent = stripQuestion(sketch, at)
    expect(sent.plot).toEqual(sketch.plot)
    expect(JSON.stringify(sent)).not.toContain('2; 0; 0; -4')
    const shape = answerShape(sent)
    expect(shape.kind).toBe('plot')
    expect(shape.kind === 'plot' && shape.typed).toMatchObject({ kind: 'list', count: 6, labels: ['First x', 'First y', 'Second x', 'Second y', 'Third x', 'Third y'] })
  })

  it('the line under the grid says where the points are and how many are left, never whether they are right', () => {
    expect(text(sketchHint([null, null, null]))).toBe('Tap the grid to place a point.')
    expect(text(sketchHint([{ x: -2, y: 0 }, null, null]))).toBe('You placed (−2 ; 0). Two more points to go.')
    expect(text(sketchHint([{ x: -2, y: 0 }, { x: 2, y: 0 }, null]))).toBe('You placed (−2 ; 0) and (2 ; 0). One more point to go.')
    expect(text(sketchHint([{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 4 }]))).toBe('Jemma joined your 3 points into a graph. Tap a point to move it.')
    expect(text(sketchHint([{ x: -2, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }]))).toBe('Jemma cannot join these 3 points into a parabola. Tap a point to move it.')
  })

  it('three points are joined into the curve, and only the last one keeps its words', () => {
    const plot = sketch.plot!
    const { container } = render(<PlotGrid plot={plot} mode="answer" points={[{ x: -2, y: 0 }, { x: 2, y: 0 }, null]} last={1} />)
    expect(container.querySelectorAll('[data-curve]')).toHaveLength(0)
    expect(container.textContent).toContain('(−2 ; 0)')
    expect(container.textContent).toContain('(2 ; 0)')
    const joined = render(<PlotGrid plot={plot} mode="answer" points={[{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: -4 }]} last={2} />).container
    expect(joined.querySelectorAll('[data-curve="drawn"]')).toHaveLength(1)
    expect(joined.textContent).toContain('(0 ; −4)')
    expect(joined.textContent).not.toContain('(2 ; 0)')
    expect(joined.querySelector('svg')!.getAttribute('aria-label')).toContain('Joined into a graph that turns at (0 ; −4).')
  })

  it('starts with the Point tool; Undo waits for a point; three points can be typed instead', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(sketch, at)} busy={false} onAnswer={onAnswer} />)
    expect(screen.getByText('Tap the grid to place a point.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Or type the points instead' }))
    for (const [label, v] of [['First x', '1'], ['First y', '-3'], ['Second x', '-1'], ['Second y', '-3'], ['Third x', '2'], ['Third y', '0']] as const)
      fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('1; -3; -1; -3; 2; 0', expect.any(Number))
  })
})

describe('on paper and in the results', () => {
  it('paper asks for a sketch and three points of it', () => {
    expect(writeLine(answerShape(stripQuestion(sketch, at)))).toBe('Sketch the graph on your paper. Then write the x and the y of 3 points on it, with a semicolon between them.')
  })

  it('the results say where each graph turns, and draw the right graph in green and the learner’s dashed', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: sketch, answer: '-2; 0; 2; 0; 0; 4', correct: false, difficulty: 2, seconds: 40 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: 'turns at (0 ; 4)', right: 'turns at (0 ; −4)' })
    render(<Results firstName="Neo" missed={[m!]} />)
    expect(document.querySelectorAll('[data-curve="right"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-curve="yours"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-right]')).toHaveLength(1)
  })

  it('points that make no parabola are said as they are', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: sketch, answer: '-2; 0; 0; 0; 2; 0', correct: false, difficulty: 2, seconds: 40 }
    const [m] = reviewOf([item])
    expect(m!.wrote).toBe('(−2 ; 0), (0 ; 0) and (2 ; 0)')
    const same = reviewOf([{ ...item, answer: '1; -3; -1; -3; 2; 0', correct: true }])[0]!
    expect(same.wrote).toBe('turns at (0 ; −4)')
  })
})
