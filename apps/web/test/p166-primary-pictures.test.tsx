import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Question, SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { QuestionPicture } from '../app/k/session/_parts/QuestionPicture'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { stripQuestion } from '../app/k/session/[sessionId]/logic'

// The maths editor is stood in for by a fake (see fake-mathlive.ts): CI's browser specs use the real one.
vi.mock('mathlive', async () => (await import('./fake-mathlive')).fakeMathlive())

// P166: a question of Grades 1 to 6 may show one of the seven primary pictures. While the learner answers, neither the drawing nor its spoken description
// gives the answer away (how many parts are shaded, how many squares, how tall a bar is); after the answer is shown, the results card describes it in full.
// react-dom only: no server, no browser, no database.

const bar: SeniorDiagramSpec = { kind: 'fraction_bar', rows: [{ parts: 8, shaded: 3 }] }
const area: SeniorDiagramSpec = { kind: 'area_model', rows: 3, cols: 4, shaded: 5 }
const chart: SeniorDiagramSpec = { kind: 'bar_chart', bars: [{ label: 'Cats', value: 4 }, { label: 'Dogs', value: 7 }, { label: 'Fish', value: 2 }], yMax: 8 }
const grid: SeniorDiagramSpec = { kind: 'grid_area', cols: 6, rows: 4, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] }
const line: SeniorDiagramSpec = { kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '?' }] }
const place: SeniorDiagramSpec = { kind: 'place_value', columns: ['H', 'T', 'U'], digits: ['3', '?', '5'] }

const box = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question') => {
  const div = document.createElement('div')
  div.innerHTML = renderToStaticMarkup(<QuestionPicture spec={spec} variant={variant} />)
  return div
}
const label = (div: HTMLElement) => div.querySelector('svg')!.getAttribute('aria-label')!
const words = (div: HTMLElement) => Array.from(div.querySelectorAll('text')).map((t) => t.textContent ?? '')

const base = { prompt: 'What fraction of the bar is shaded?', render: 'text' as const, answer: '3/8', answerKind: 'fraction' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const question = (over: Partial<Question> = {}): Question => ({ ...base, diagram: bar, ...over })
const at = { position: 1, phase: 'try' as const, index: 1, of: 5, young: true }

describe('what the browser is given', () => {
  it('a primary question keeps its picture, and the key stays on the server', () => {
    const sent = stripQuestion(question(), at)
    expect(sent.diagram).toEqual(bar)
    expect(sent.young).toBe(true)
    expect(JSON.stringify(sent)).not.toContain('3/8')
  })

  it('a picture does not make a primary question a senior one: no minus key, even when the grade is not known', () => {
    expect(stripQuestion(question({ answerKind: 'whole', answer: '7', diagram: chart }), { ...at, young: false })).not.toHaveProperty('signed')
  })
})

describe('the question screen', () => {
  it('draws the picture between the words and the answer box', () => {
    const q = stripQuestion(question({ answerKind: 'whole', answer: '7', prompt: 'How many children chose Dogs?', diagram: chart }), at)
    render(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
    const picture = screen.getByRole('img', { name: 'Bar graph, from 0 to 8, with bars for Cats, Dogs, Fish.' })
    expect(picture.closest('[data-picture]')).not.toBeNull()
  })
})

describe('while the learner answers, the picture does not give the answer', () => {
  it('a fraction bar: no fraction next to the bar and no count in the words', () => {
    const div = box(bar)
    expect(label(div)).toBe('Fraction bars: a bar split into 8 equal parts with some shaded.')
    expect(words(div).join(' ')).not.toMatch(/3\/8|3/)
    expect(div.querySelectorAll('rect[fill="#FFB81C"]')).toHaveLength(3)
  })

  it('a fraction bar keeps a label the writer gave it (it is not computed from the bar)', () => {
    const div = box({ kind: 'fraction_bar', rows: [{ parts: 4, shaded: 1, label: 'A' }] })
    expect(words(div)).toEqual(['A'])
  })

  it('an area model: no sides, no sum and no total', () => {
    const div = box(area)
    expect(label(div)).toBe('Area model: a rectangle of squares, some of them shaded.')
    expect(words(div)).toEqual([])
  })

  it('squared paper: no area under the shape and no count in the words', () => {
    const div = box(grid)
    expect(label(div)).toBe('Squared paper 6 squares wide and 4 tall, with a shape drawn on it.')
    expect(words(div).join(' ')).not.toContain('Area')
  })

  it('a bar graph: the bars are named, but their values are read off the scale', () => {
    const div = box(chart)
    expect(label(div)).not.toMatch(/Dogs 7|Cats 4/)
    expect(words(div)).toEqual(expect.arrayContaining(['Cats', 'Dogs', 'Fish']))
  })

  it('a number line: the mark shows its label, not its number', () => {
    const div = box(line)
    expect(label(div)).toBe('Number line from 0 to 1 in steps of 0,25. Marked: ?.')
    expect(words(div)).toContain('?')
    expect(words(div)).not.toContain('0,75')
  })

  it('a place value chart: the blank stays a blank', () => {
    const div = box(place)
    expect(label(div)).toContain('T ?')
  })
})

describe('after the answer is shown', () => {
  it('the results card describes the picture in full', () => {
    expect(label(box(bar, 'card'))).toBe('Fraction bars: a bar split into 8 equal parts with 3 of 8 shaded.')
    expect(words(box(bar, 'card'))).toContain('3/8')
    expect(label(box(area, 'card'))).toBe('Area model: a rectangle 4 squares wide and 3 squares tall, 12 squares in all, with 5 of the 12 squares shaded.')
    expect(label(box(chart, 'card'))).toBe('Bar graph, from 0 to 8: Cats 4, Dogs 7, Fish 2.')
    expect(label(box(grid, 'card'))).toContain('its area is 4 cm²')
  })
})

describe('a bar graph with many bars', () => {
  const bars = (n: number): SeniorDiagramSpec => ({ kind: 'bar_chart', bars: Array.from({ length: n }, (_, i) => ({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Hol'][i]!, value: i + 1 })), yMax: 10 })
  const rects = (div: HTMLElement) =>
    Array.from(div.querySelectorAll('rect')).map((r) => ({ x: Number(r.getAttribute('x')), w: Number(r.getAttribute('width')) }))

  it('keeps a gap between two bars, up to 8 bars, and stays inside the drawing', () => {
    for (const n of [6, 7, 8]) {
      const drawn = rects(box(bars(n)))
      expect(drawn).toHaveLength(n)
      for (let i = 1; i < n; i += 1) expect(drawn[i]!.x - (drawn[i - 1]!.x + drawn[i - 1]!.w), `${n} bars, gap ${i}`).toBeGreaterThanOrEqual(8)
      expect(drawn[n - 1]!.x + drawn[n - 1]!.w).toBeLessThanOrEqual(306.01)
    }
  })

  it('draws up to 5 bars exactly as before: 44 wide', () => {
    for (const n of [1, 3, 5]) for (const r of rects(box(bars(n)))) expect(r.w).toBe(44)
  })
})
