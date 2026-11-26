import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams'
import { niceTop } from '../components/diagrams/chart-frame'

// P197: the data and probability pictures (a tally table, a pie chart, a line plot, a spinner, a bag of counters; a broken-line graph, a histogram, an ogive, a stem
// and leaf display, a scatter plot, a Venn diagram), drawn in a question and in the results. While a question is answered the spoken words never read a value
// off the picture: it may be the answer. react-dom only: no server, no browser.

const draw = (spec: SeniorDiagramSpec, variant: 'question' | 'card' = 'question', notation: 'za' | 'us' = 'za') => {
  document.body.innerHTML = ''
  render(<DiagramView spec={spec} variant={variant} notation={notation} />)
  return document.querySelector('svg[role="img"]')!
}
const label = (svg: Element) => svg.getAttribute('aria-label')!

describe('Grades 1 to 6', () => {
  it('a tally table: a mark for each one, four strokes and a fifth across them', () => {
    const spec: SeniorDiagramSpec = { kind: 'tally_table', heading: 'Pet', rows: [{ label: 'Dogs', count: 12 }, { label: 'Cats', count: 5 }] }
    const svg = draw(spec)
    expect([...svg.querySelectorAll('[data-tally]')].map((g) => [g.getAttribute('data-tally'), g.querySelectorAll('line').length])).toEqual([
      ['12', 12],
      ['5', 5],
    ])
    expect(label(svg)).toBe('A tally table with rows for dogs and cats.')
    expect(label(draw(spec, 'card'))).toBe('A tally table: dogs 12 and cats 5.')
  })

  it('a pie chart: the asked part has a question mark, and no percent is said while it is answered', () => {
    const spec: SeniorDiagramSpec = { kind: 'pie_chart', parts: [{ label: 'Walk', percent: 40 }, { label: 'Bus', percent: 22.5, ask: true }, { label: 'Car', percent: 37.5 }] }
    const svg = draw(spec)
    expect(svg.querySelectorAll('[data-part]')).toHaveLength(3)
    expect(svg.textContent).toContain('?')
    expect(svg.textContent).not.toContain('22')
    expect(label(svg)).toBe('A pie chart of 3 parts: walk, bus and car.')
    expect(label(draw(spec, 'card'))).toBe('A pie chart of 3 parts: walk 40%, bus a question mark and car 37,5%.')
    expect(draw(spec, 'card', 'us').textContent).toContain('37.5%')
  })

  it('a line plot: a dot for each one counted', () => {
    const spec: SeniorDiagramSpec = { kind: 'dot_plot', marks: ['1', '2', '3'], counts: [2, 5, 0], title: 'Shoe size' }
    const svg = draw(spec)
    expect(svg.querySelectorAll('[data-dot]')).toHaveLength(7)
    expect(label(svg)).toBe('A line plot of shoe size with marks 1 to 3, a dot for each one counted.')
    expect(label(draw(spec, 'card'))).toContain('1 has 2, 2 has 5 and 3 has 0.')
  })

  it('a spinner and a bag of counters: their colours, and how many only after', () => {
    const spinner: SeniorDiagramSpec = { kind: 'spinner', parts: ['gold', 'green', 'gold', 'red'] }
    expect(draw(spinner).querySelectorAll('[data-part="gold"]')).toHaveLength(2)
    expect(label(draw(spinner))).toBe('A spinner with equal parts in gold, green and red.')
    expect(label(draw(spinner, 'card'))).toBe('A spinner with 4 equal parts: 2 gold, 1 green and 1 red.')
    const bag: SeniorDiagramSpec = { kind: 'counters', gold: 5, red: 2 }
    expect(draw(bag).querySelectorAll('[data-counter]')).toHaveLength(7)
    expect(label(draw(bag))).toBe('A bag of gold and red counters.')
    expect(label(draw(bag, 'card'))).toBe('A bag with 7 counters: 5 gold and 2 red.')
  })
})

describe('Grades 10 to 12', () => {
  it('a broken-line graph: a point for each label, its values said only after', () => {
    const spec: SeniorDiagramSpec = { kind: 'line_graph', labels: ['Mon', 'Tue', 'Wed'], values: [18, 22.5, 25], yMin: 10, yMax: 30, step: 5, unit: '°C' }
    const svg = draw(spec)
    expect(svg.querySelectorAll('[data-point]')).toHaveLength(3)
    expect(label(svg)).toBe('A broken-line graph of 3 values, from Mon to Wed, on a scale from 10 to 30 °C.')
    expect(label(draw(spec, 'card'))).toContain('Mon 18, Tue 22,5 and Wed 25.')
  })

  it('a histogram and an ogive: bars that touch, a running total with a dashed line read across', () => {
    const histogram: SeniorDiagramSpec = { kind: 'histogram', start: 40, width: 10, counts: [3, 7, 12] }
    const svg = draw(histogram)
    expect([...svg.querySelectorAll('[data-bar]')].map((b) => b.getAttribute('data-bar'))).toEqual(['3', '7', '12'])
    expect(label(svg)).toBe('A histogram of 3 classes of 10 from 40 to 70.')
    expect(label(draw(histogram, 'card'))).toContain('60 to 70 has 12.')
    const ogive: SeniorDiagramSpec = { kind: 'ogive', start: 0, width: 20, totals: [4, 12, 26, 36, 40], readAt: 20 }
    const curve = draw(ogive)
    expect(curve.querySelectorAll('[data-read] line')).toHaveLength(2)
    expect(label(curve)).toBe('An ogive of running totals over classes of 20 from 0 to 100, with a dashed line across from 20.')
    expect(label(draw(ogive, 'card'))).toContain('the running totals of 40')
  })

  it('a stem and leaf display: each leaf in its place, and the key', () => {
    const spec: SeniorDiagramSpec = { kind: 'stem_leaf', rows: [{ stem: 4, leaves: [5, 8] }, { stem: 5, leaves: [3, 3, 6] }] }
    const svg = draw(spec)
    expect([...svg.querySelectorAll('[data-stem]')].map((g) => g.textContent)).toEqual(['458', '5336'])
    expect(svg.textContent).toContain('Key: 4 | 5 means 45')
    expect(label(svg)).toBe('A stem and leaf display with the stems 4 to 5, and its key.')
    expect(label(draw(spec, 'card'))).toBe('A stem and leaf display: 4 | 5 8, 5 | 3 3 6. Key: 4 | 5 means 45.')
  })

  it('a scatter plot with its line of best fit, in the notation of the space', () => {
    const spec: SeniorDiagramSpec = { kind: 'scatter', points: [{ x: 1, y: 30 }, { x: 4, y: 55 }, { x: 8, y: 80 }], xMax: 10, yMax: 100, xLabel: 'hours', yLabel: 'mark', line: { a: 24, b: 7.5 } }
    const svg = draw(spec)
    expect(svg.querySelectorAll('[data-point]')).toHaveLength(3)
    expect(svg.querySelector('[data-fit] text')!.textContent).toBe('ŷ = 24 + 7,5x')
    expect(draw(spec, 'question', 'us').querySelector('[data-fit] text')!.textContent).toBe('ŷ = 24 + 7.5x')
    expect(label(svg)).toBe('A scatter plot of 3 points of mark against hours. The line of best fit is ŷ = 24 + 7,5x.')
  })

  it('a Venn diagram: the blanks are gold, and said as blanks', () => {
    const svg = draw({ kind: 'venn', a: 'Soccer', b: 'Netball', aOnly: '12', both: '?', bOnly: '8', neither: '5' })
    expect(svg.querySelectorAll('[data-blank]')).toHaveLength(1)
    expect(label(svg)).toBe('A Venn diagram in S with the sets Soccer and Netball: Soccer only is 12, both is a blank, Netball only is 8, and neither is 5.')
  })
})

describe('the scale of a chart', () => {
  it('steps by 1, 2 or 5 with at most 10 lines, and counts by whole numbers', () => {
    expect(niceTop(12, true)).toEqual({ top: 12, step: 2 })
    expect(niceTop(7, true)).toEqual({ top: 7, step: 1 })
    expect(niceTop(3, true)).toEqual({ top: 3, step: 1 })
    expect(niceTop(45, true)).toEqual({ top: 45, step: 5 })
    expect(niceTop(100)).toEqual({ top: 100, step: 10 })
    expect(niceTop(2.5)).toEqual({ top: 2.5, step: 0.5 })
  })
})
