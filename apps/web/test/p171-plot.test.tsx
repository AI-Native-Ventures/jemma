import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tidyPlot } from '@jemma/profiling/logic'
import type { Question } from '@jemma/profiling/schemas'
import { writeLine } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { answerShape, reviewOf, stripQuestion, type StoredItem } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P171: points placed on a grid. Tapping is tried in a real browser (a test page has no layout); here: what is sent, the coordinates typed instead, paper and
// the results. react-dom only: no server, no browser.

const reflect: Question = tidyPlot({
  prompt: "Reflect triangle ABC in the y-axis. Tap where A', B' and C' go.",
  render: 'text',
  steps: ['(x; y) → (−x; y)', "A'(4; 1)"],
  answer: '4; 1; 1; 1; 1; 4',
  answerKind: 'list',
  plot: { xMin: -5, xMax: 5, yMin: -1, yMax: 5, given: [{ x: -4, y: 1, label: 'A' }, { x: -1, y: 1, label: 'B' }, { x: -1, y: 4, label: 'C' }], shape: true, place: ["A'", "B'", "C'"] },
  difficulty: 2,
  why: 'w',
  rightWay: 'r',
})
const at = { position: 1, phase: 'try' as const, index: 1, of: 5 }

describe('placing points on a grid', () => {
  it('the grid and the given points are sent, never where the points go', () => {
    const sent = stripQuestion(reflect, at)
    expect(sent.plot).toEqual(reflect.plot)
    expect(JSON.stringify(sent)).not.toContain('4; 1; 1; 1')
    const shape = answerShape(sent)
    expect(shape.kind).toBe('plot')
    expect(shape.kind === 'plot' && shape.typed).toMatchObject({ kind: 'list', count: 6, labels: ["A' x", "A' y", "B' x", "B' y", "C' x", "C' y"] })
  })

  it('starts by asking for the first point; Undo waits for a point; the coordinates can be typed instead', () => {
    const onAnswer = vi.fn()
    render(<QuestionScreen q={stripQuestion(reflect, at)} busy={false} onAnswer={onAnswer} />)
    expect(screen.getByText("Tap the grid to place A'.")).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Or type the coordinates instead' }))
    for (const [label, v] of [["A' x", '4'], ["A' y", '1'], ["B' x", '1'], ["B' y", '1'], ["C' x", '1'], ["C' y", '4']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onAnswer).toHaveBeenCalledWith('4; 1; 1; 1; 1; 4', expect.any(Number))
  })
})

describe('on paper and in the results', () => {
  it('paper asks for the coordinates', () => {
    expect(writeLine(answerShape(stripQuestion(reflect, at)))).toBe("Write the x and the y of A', B', C', in order, with a semicolon between them.")
  })

  it('the results say the points in words and draw the right ones with a wrong one dashed', () => {
    const item: StoredItem = { phase: 'try', position: 1, question: reflect, answer: '4; 1; 1; 1; 2; 4', correct: false, difficulty: 2, seconds: 40 }
    const [m] = reviewOf([item])
    expect(m).toMatchObject({ wrote: "A' (4; 1), B' (1; 1), C' (2; 4)", right: "A' (4; 1), B' (1; 1), C' (1; 4)" })
    render(<Results firstName="Ayanda" missed={[m!]} />)
    expect(document.querySelectorAll('[data-right]')).toHaveLength(3)
    expect(document.querySelectorAll('[data-yours]')).toHaveLength(1)
  })
})
