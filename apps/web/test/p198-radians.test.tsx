import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyGeneral, tidyPlot } from '@jemma/profiling/logic'
import type { PlotSpec, Question } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'
import { writeLine } from '../app/k/session/_parts/Paper'
import { PlotGrid, sketchHint } from '../app/k/session/_parts/answers/PlotGrid'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P198: radians for a class in the US: a trig grid marked in π, every solution typed in radians with a π key, and a picture of a trig graph marked in π.
// react-dom only: no server, no browser.

const grid: PlotSpec = { xMin: 0, xMax: 360, yMin: -2, yMax: 2, xStep: 45, place: ['0', 'π/2', 'π', '3π/2', '2π'], curve: 'trig', radians: true }
const sketch: Question = tidyPlot({
  prompt: 'Sketch y = sin x for 0 ≤ x ≤ 2π. Tap its 5 key points.',
  render: 'text',
  steps: ['a', 'b'],
  answer: '0; 0; 90; 1; 180; 0; 270; -1; 360; 0',
  answerKind: 'list',
  plot: grid,
  difficulty: 2,
  why: 'w',
  rightWay: 'r',
})
const general: Question = tidyGeneral({
  prompt: 'Find all solutions of sin x = 1/2.',
  render: 'text',
  steps: ['sin(π/6) = 1/2', 'x = π/6 or x = 5π/6'],
  answer: 'π/6; 2π; 5π/6; 2π',
  answerKind: 'list',
  general: { letter: 'x', radians: true },
  difficulty: 3,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }
const text = (node: React.ReactNode) => render(<p>{node}</p>).container.textContent

describe('a trig grid marked in π', () => {
  it('says its angles in π every quarter turn, and its points in π', () => {
    const { container } = render(<PlotGrid plot={grid} mode="paper" />)
    expect(Array.from(container.querySelectorAll('[data-tick="x"]')).map((t) => t.textContent)).toEqual(['π/2', 'π', '3π/2', '2π'])
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('A grid from 0 to 2π across')
    expect(text(sketchHint([{ x: 90, y: 1 }, null, null, null, null], grid))).toBe('You placed (π/2 ; 1). 4 more points to go.')
  })

  it('a grid in degrees is as it was', () => {
    const { container } = render(<PlotGrid plot={{ ...grid, radians: undefined }} mode="paper" />)
    expect(Array.from(container.querySelectorAll('[data-tick="x"]')).map((t) => t.textContent)).toEqual(['90°', '180°', '270°', '360°'])
  })

  it('the results say the key points in π', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: sketch, answer: '0; 0; 90; -1; 180; 0; 270; 1; 360; 0', correct: false, difficulty: 2, seconds: 40 }
    const [m] = reviewOf([item])
    expect(m!.right).toBe('goes through (0 ; 0), (π/2 ; 1), (π ; 0), (3π/2 ; −1) and (2π ; 0)')
    expect(m!.wrote).toContain('(π/2 ; −1)')
  })
})

describe('every solution in radians', () => {
  it('the frame has no degree sign, and the π key types into the box used last', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(general, at)} busy={false} onAnswer={onAnswer} />)
    expect(answerShape(stripQuestion(general, at)).kind).toBe('general')
    const frame = document.querySelector('[data-answer="general"]')!
    expect(frame.getAttribute('data-radians')).toBe('true')
    expect(frame.textContent).not.toContain('°')
    expect(frame.textContent).toContain('x =')
    const angle = screen.getByLabelText('Solution 1: the angle, in radians') as HTMLInputElement
    const period = screen.getByLabelText('Solution 1: how often it comes back, in radians') as HTMLInputElement
    fireEvent.focus(angle)
    fireEvent.click(screen.getByRole('button', { name: 'Type pi' }))
    expect(angle.value).toBe('π')
    fireEvent.change(angle, { target: { value: 'π/6' } })
    fireEvent.focus(period)
    fireEvent.change(period, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Type pi' }))
    expect(period.value).toBe('2π')
    // The period box takes π: it is not the number pad.
    expect(period.getAttribute('inputmode')).toBe('text')
  })

  it('a frame in degrees has no π keys', () => {
    render(<QuestionScreen q={stripQuestion({ ...general, general: { letter: 'θ' }, answer: '30; 360; 150; 360' }, at)} busy={false} onAnswer={vi.fn()} />)
    expect(document.querySelector('[data-pi-keys]')).toBeNull()
  })

  it('the results and the paper line say radians', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: general, answer: 'π/6; 2π', correct: false, difficulty: 3, seconds: 60 }
    const [m] = reviewOf([item])
    expect(m!.right).toBe('x = π/6 + 2kπ or x = 5π/6 + 2kπ')
    expect(m!.wrote).toBe('x = π/6 + 2kπ')
    expect(writeLine(answerShape(stripQuestion(general, at)))).toContain('in radians')
  })
})

describe('a picture of a trig graph marked in π', () => {
  it('writes x in π and says it in π', () => {
    document.body.innerHTML = ''
    render(<DiagramView spec={{ kind: 'coordinate_plane', xMin: 0, xMax: 360, yMin: -2, yMax: 2, step: 90, graphs: [{ type: 'trig', fn: 'sin' }], radians: true }} variant="question" />)
    const svg = document.querySelector('svg[role="img"]')!
    expect(Array.from(svg.querySelectorAll('[data-tick="x"]')).map((t) => t.textContent)).toEqual(['π/2', 'π', '3π/2', '2π'])
    expect(svg.getAttribute('aria-label')).toContain('A grid from 0 to 2π across')
  })
})
