import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { BarGraphQuestion, GridAreaQuestion, questionStyleOf } from '@/components/questions'

const L_SHAPE: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3],
]

describe('GridAreaQuestion (q-amina-area)', () => {
  test('shows the prompt, the squared paper and a cm² answer box', () => {
    const onChange = vi.fn()
    const { container } = render(
      <GridAreaQuestion
        prompt="Each square is 1 cm². What is the area of the shape?"
        spec={{ kind: 'grid_area', cols: 8, rows: 5, cells: L_SHAPE }}
        value=""
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Each square is 1 cm². What is the area of the shape?')
    expect(container.querySelectorAll('rect')).toHaveLength(14)
    expect(screen.getByText('cm²')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Area in square centimetres'), { target: { value: '14' } })
    expect(onChange).toHaveBeenCalledWith('14')
  })

  test('never shows the answer', () => {
    const { container } = render(
      <GridAreaQuestion prompt="Area?" spec={{ kind: 'grid_area', cols: 8, rows: 5, cells: L_SHAPE }} value="" onChange={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/Area = 14/)
  })
})

describe('BarGraphQuestion (q-amina-bar-graph)', () => {
  const spec = {
    kind: 'bar_chart' as const,
    bars: [
      { label: 'Walk', value: 14 },
      { label: 'Taxi', value: 9 },
      { label: 'Car', value: 6 },
      { label: 'Bus', value: 4 },
    ],
    yMax: 16,
  }
  test('draws four bars, highlights the two asked about and has a "more" answer box', () => {
    const { container } = render(
      <BarGraphQuestion prompt="How many more learners walk than come by taxi?" spec={spec} highlight={['Walk', 'Taxi']} value="" onChange={() => {}} />,
    )
    const bars = Array.from(container.querySelectorAll('rect[rx="4"]'))
    expect(bars.map((b) => b.getAttribute('fill'))).toEqual(['#FF6A4D', '#FF6A4D', '#1F1D36', '#1F1D36'])
    expect(screen.getByText('more')).toBeTruthy()
    expect(screen.getByLabelText('How many more learners walk')).toBeTruthy()
  })
})

describe('questionStyleOf', () => {
  test('maps diagram kinds to the two Grade 6 styles, anything else to null', () => {
    expect(questionStyleOf({ kind: 'grid_area', cols: 1, rows: 1, cells: [] })).toBe('area')
    expect(questionStyleOf({ kind: 'bar_chart', bars: [], yMax: 1 })).toBe('bar-graph')
    expect(questionStyleOf({ kind: 'number_line', min: 0, max: 1, step: 1, marks: [] })).toBeNull()
    expect(questionStyleOf(undefined)).toBeNull()
  })
})
