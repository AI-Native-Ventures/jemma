import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { DiagramView, FractionBar, GridArea, NumberLine, PlaceValue, AreaModel, BarChart, Shape2D } from '@/components/diagrams'

const CORAL = '#FF6A4D'
const rects = (c: HTMLElement) => Array.from(c.querySelectorAll('rect'))

describe('FractionBar', () => {
  test('draws parts and shading', () => {
    const { container } = render(<FractionBar kind="fraction_bar" rows={[{ parts: 4, shaded: 3 }]} />)
    expect(rects(container)).toHaveLength(4)
    expect(rects(container).filter((r) => r.getAttribute('fill') === CORAL)).toHaveLength(3)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/3 of 4/)
  })
  test('first shaded row is coral, later shaded rows ink, label defaults', () => {
    const { container } = render(
      <FractionBar kind="fraction_bar" rows={[{ parts: 1, shaded: 0 }, { parts: 2, shaded: 1 }, { parts: 4, shaded: 1 }]} />,
    )
    const fills = rects(container).map((r) => r.getAttribute('fill'))
    expect(fills.filter((f) => f === CORAL)).toHaveLength(1)
    expect(fills.filter((f) => f === '#1F1D36')).toHaveLength(1)
    expect(container.textContent).toContain('1/2')
    expect(container.textContent).toContain('1/4')
  })
})

describe('other kinds', () => {
  test('NumberLine marks and ticks', () => {
    const { container } = render(
      <NumberLine kind="number_line" min={0} max={1} step={0.25} marks={[{ value: 0.75, label: '3/4' }]} />,
    )
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.textContent).toContain('3/4')
    expect(container.textContent).toContain('2/4')
    expect(container.querySelectorAll('path')).toHaveLength(3)
    const dec = render(<NumberLine kind="number_line" min={0} max={1} step={0.5} marks={[]} />)
    expect(dec.container.textContent).toContain('0,5')
  })
  test('AreaModel shades the requested squares', () => {
    const { container } = render(<AreaModel kind="area_model" rows={3} cols={4} shaded={12} />)
    expect(container.textContent).toContain('3 × 4 = 12')
    const { container: c2 } = render(<AreaModel kind="area_model" rows={2} cols={3} shaded={4} />)
    expect(Array.from(c2.querySelectorAll('rect')).filter((r) => r.getAttribute('fill') === '#FFE3DA')).toHaveLength(4)
  })
  test('PlaceValue shows columns and digits with a decimal comma', () => {
    const { container } = render(
      <PlaceValue kind="place_value" columns={['U', 't', 'h']} digits={['0', '7', '5']} />,
    )
    expect(container.textContent).toContain(',')
    expect(container.textContent).toContain('7')
    expect(container.textContent).toContain('h')
  })
  test('BarChart draws a bar per entry', () => {
    const { container } = render(
      <BarChart kind="bar_chart" yMax={15} bars={[{ label: 'Walk', value: 14 }, { label: 'Taxi', value: 9 }]} />,
    )
    expect(rects(container)).toHaveLength(2)
    expect(container.textContent).toContain('Walk')
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Walk 14/)
  })
  test('Shape2D renders each shape with labels', () => {
    for (const shape of ['square', 'rectangle', 'triangle', 'circle'] as const) {
      const { container, unmount } = render(<Shape2D kind="shape_2d" shape={shape} labels={['8 cm', '5 cm']} />)
      expect(container.textContent).toContain('8 cm')
      unmount()
    }
  })
  test('GridArea shades cells and counts the area', () => {
    const { container } = render(<GridArea kind="grid_area" cols={4} rows={3} cells={[[0, 0], [1, 0], [0, 1]]} />)
    expect(container.textContent).toContain('Area = 3 cm²')
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/3 squares/)
  })
})

describe('DiagramView', () => {
  test('rejects an unknown kind', () => {
    render(<DiagramView spec={{ kind: 'hologram' }} />)
    const box = screen.getByRole('img')
    expect(box.textContent).toContain('Picture missing')
  })
  test('survives junk specs', () => {
    for (const junk of [null, undefined, 4, 'x', { kind: 'fraction_bar' }, { kind: 'bar_chart', bars: 3, yMax: 'a' }]) {
      expect(() => render(<DiagramView spec={junk} />)).not.toThrow()
    }
  })
  test('dispatches valid specs', () => {
    render(<DiagramView spec={{ kind: 'area_model', rows: 3, cols: 4, shaded: 12 }} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/4 squares wide/)
  })
  test('no em dash in rendered output', () => {
    const { container } = render(<DiagramView spec={{ kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] }} />)
    expect(container.innerHTML).not.toContain('\u2014')
  })
})
