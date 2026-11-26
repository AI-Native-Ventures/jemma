import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyPlot } from '@jemma/profiling/logic'
import type { PlotSpec, Question } from '@jemma/profiling/schemas'
import { PlotGrid, sketchHint } from '../app/k/session/_parts/answers/PlotGrid'
import { Results } from '../app/k/session/_parts/Results'
import { reviewOf, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P182: a sin or cos graph sketched on a grid in degrees. Tapping is tried in a real browser.

const grid: PlotSpec = { xMin: 0, xMax: 360, yMin: -2, yMax: 4, xStep: 30, place: ['0°', '90°', '180°', '270°', '360°'], curve: 'trig' }
const sketch: Question = tidyPlot({
  prompt: 'Sketch y = 2 sin x + 1 for 0° ≤ x ≤ 360°. Tap its 5 key points.',
  render: 'text',
  steps: ['a', 'b'],
  answer: '0; 1; 90; 3; 180; 1; 270; -1; 360; 1',
  answerKind: 'list',
  plot: grid,
  difficulty: 2,
  why: 'w',
  rightWay: 'r',
})
const text = (node: React.ReactNode) => render(<p>{node}</p>).container.textContent
const KEY = [{ x: 0, y: 1 }, { x: 90, y: 3 }, { x: 180, y: 1 }, { x: 270, y: -1 }, { x: 360, y: 1 }]

describe('sketching a trig graph', () => {
  it('the grid says its angles every 90 degrees', () => {
    const { container } = render(<PlotGrid plot={grid} mode="paper" />)
    const words = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    for (const angle of ['90°', '180°', '270°', '360°']) expect(words).toContain(angle)
    expect(words).not.toContain('30°')
  })

  it('the line under the grid writes the angles, and says when two points are above each other', () => {
    expect(text(sketchHint([{ x: 90, y: 3 }, null, null, null, null], grid))).toBe('You placed (90° ; 3). 4 more points to go.')
    expect(text(sketchHint([{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 90, y: 3 }, { x: 180, y: 1 }, { x: 270, y: -1 }], grid))).toBe('Jemma cannot join points that are above each other. Tap a point to move it.')
  })

  it('five key points are joined into one wave', () => {
    const { container } = render(<PlotGrid plot={grid} mode="answer" points={KEY} last={4} />)
    expect(container.querySelectorAll('[data-curve="drawn"]')).toHaveLength(1)
    expect(container.textContent).toContain('(360° ; 1)')
  })

  it('the results mark the right key points in green and say both sets of points', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: sketch, answer: '0; 1; 90; 2; 180; 1; 270; -1; 360; 1', correct: false, difficulty: 2, seconds: 50 }
    const [m] = reviewOf([item])
    expect(m!.right).toBe('goes through (0° ; 1), (90° ; 3), (180° ; 1), (270° ; −1) and (360° ; 1)')
    expect(m!.wrote).toContain('(90° ; 2)')
    render(<Results firstName="Lerato" missed={[m!]} />)
    expect(document.querySelectorAll('[data-right]')).toHaveLength(5)
    expect(document.querySelectorAll('[data-curve="yours"]')).toHaveLength(1)
  })
})
