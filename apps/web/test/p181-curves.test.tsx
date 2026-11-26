import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyPlot } from '@jemma/profiling/logic'
import type { PlotSpec, Question } from '@jemma/profiling/schemas'
import { PlotGrid, sketchHint } from '../app/k/session/_parts/answers/PlotGrid'
import { Results } from '../app/k/session/_parts/Results'
import { reviewOf, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P181: a hyperbola (3 points, its asymptotes drawn) and a cubic graph (4 points) sketched like a parabola (P176). Tapping is tried in a real browser.

const hyp: PlotSpec = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, place: ['x-intercept', 'point', 'point'], curve: 'hyperbola' }
const cub: PlotSpec = { xMin: -2, xMax: 4, yMin: -5, yMax: 5, place: ['x-intercept', 'x-intercept', 'x-intercept', 'y-intercept'], curve: 'cubic' }
const ask = (plot: PlotSpec, prompt: string, answer: string): Question =>
  tidyPlot({ prompt, render: 'text', steps: ['a', 'b'], answer, answerKind: 'list', plot, difficulty: 2, why: 'w', rightWay: 'r' })
const text = (node: React.ReactNode) => render(<p>{node}</p>).container.textContent

describe('sketching a hyperbola and a cubic graph', () => {
  it('the line under the grid counts down from 4, and names the curve it cannot make', () => {
    expect(text(sketchHint([{ x: -1, y: 0 }, null, null, null], cub))).toBe('You placed (−1 ; 0). Three more points to go.')
    expect(text(sketchHint([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], hyp))).toBe('Jemma cannot join these 3 points into a hyperbola. Tap a point to move it.')
    expect(text(sketchHint([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }], cub))).toBe('Jemma cannot join these 4 points into a cubic graph. Tap a point to move it.')
    expect(text(sketchHint([{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }], hyp))).toBe('Jemma joined your 3 points into a graph. Tap a point to move it.')
  })

  it('three points of a hyperbola are joined into its two branches, with its asymptotes dashed', () => {
    const { container } = render(<PlotGrid plot={hyp} mode="answer" points={[{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }]} last={2} />)
    expect(container.querySelectorAll('[data-curve="drawn"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-asymptotes="drawn"] line')).toHaveLength(2)
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('Joined into a graph that has asymptotes x = 0 and y = 1.')
  })

  it('the results say a hyperbola by its asymptotes and draw the right ones in green', () => {
    const q = ask(hyp, 'Sketch y = 2/x + 1.', '-2; 0; 1; 3; 2; 2')
    const item: StoredItem = { phase: 'try', position: 1, question: q, answer: '-2; 0; 1; 2; 2; 1', correct: false, difficulty: 2, seconds: 40 }
    const [m] = reviewOf([item])
    expect(m!.right).toBe('has asymptotes x = 0 and y = 1')
    expect(m!.wrote).toMatch(/^has asymptotes x = /)
    render(<Results firstName="Neo" missed={[m!]} />)
    expect(document.querySelectorAll('[data-asymptotes="right"] line')).toHaveLength(2)
    expect(document.querySelectorAll('[data-curve="yours"]').length).toBeGreaterThan(0)
  })

  it('the results mark both turning points of a cubic graph', () => {
    const q = ask(cub, 'Sketch y = (x + 1)(x − 1)(x − 3).', '-1; 0; 1; 0; 3; 0; 0; 3')
    const [m] = reviewOf([{ phase: 'try', position: 1, question: q, answer: '-1; 0; 1; 0; 3; 0; 0; 3', correct: true, difficulty: 2, seconds: 40 }])
    expect(m!.wrote).toBe('turns at (−0,15 ; 3,08) and (2,15 ; −3,08)')
    const { container } = render(<PlotGrid plot={cub} mode="results" points={[{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }]} right={[{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }]} />)
    expect(container.querySelectorAll('[data-right]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-yours]')).toHaveLength(0)
  })
})
