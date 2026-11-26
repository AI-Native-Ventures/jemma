import type { ReactNode } from 'react'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK } from './shared'

// P197: the frame the data graphs share (a broken-line graph, a histogram, an ogive, a scatter plot): light lines across, two axes, numbers up the side and
// along the bottom, and the names of the axes. Pure drawing helpers.

export const CHART = { x0: 44, y0: 22, w: 256, h: 168 } as const
const GRID = '#ECE9E2'

/**
 * A round top for a scale that holds `max`, and the step of its lines: a step of 1, 2 or 5 (or 10, 20, 50 and so on) with at most 10 lines, so a bar or a point
 * can be read against them. A scale of counts (`whole`) never steps by less than 1.
 */
export function niceTop(max: number, whole = false): { top: number; step: number } {
  const target = Math.max(max, whole ? 1 : 1e-6) / 10
  const pow = 10 ** Math.floor(Math.log10(target))
  const found = [1, 2, 5, 10].map((k) => k * pow).find((s) => s >= target - 1e-9) ?? 10 * pow
  const step = whole ? Math.max(1, found) : found
  return { top: Math.round((Math.ceil(max / step - 1e-9) * step || step) * 1e6) / 1e6, step }
}

/** Light lines across at each step from `min` to `max`, and the numbers beside them. */
export function YScale({ min, max, step, y, notation = 'za' }: { min: number; max: number; step: number; y: (v: number) => number; notation?: Notation }): ReactNode {
  const n = Math.round((max - min) / step)
  return (
    <g>
      {Array.from({ length: n + 1 }, (_, k) => {
        const v = min + k * step
        return (
          <g key={k}>
            {k > 0 ? <line x1={CHART.x0} y1={y(v)} x2={CHART.x0 + CHART.w} y2={y(v)} stroke={GRID} strokeWidth={1} /> : null}
            <text x={CHART.x0 - 6} y={y(v) + 4} fontSize={11} fontWeight={500} fill={BODY} textAnchor="end">
              {numberIn(Math.round(v * 1e6) / 1e6, notation)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** The two axes, and the names of the axes: `x` under the right end, `y` over the top. */
export function Axes({ x, y }: { x?: string; y?: string }): ReactNode {
  const { x0, y0, w, h } = CHART
  return (
    <g>
      <line x1={x0} y1={y0 + h} x2={x0 + w} y2={y0 + h} stroke={INK} strokeWidth={1.6} />
      <line x1={x0} y1={y0} x2={x0} y2={y0 + h} stroke={INK} strokeWidth={1.6} />
      {x ? (
        <text x={x0 + w} y={y0 + h + 32} fontSize={12} fontWeight={700} fill={BODY} textAnchor="end">
          {x}
        </text>
      ) : null}
      {y ? (
        <text x={x0 - 4} y={y0 - 8} fontSize={12} fontWeight={700} fill={BODY} textAnchor="start">
          {y}
        </text>
      ) : null}
    </g>
  )
}

/** The colours of the parts of a pie chart, in order. */
export const PART_COLOURS = ['#FFB81C', '#007749', '#001489', '#E03C31', '#6B3FA0', '#0E7C86'] as const

/** The colour of a spinner part or a counter. */
export const CHANCE_FILL: Record<'gold' | 'green' | 'red' | 'blue', string> = { gold: '#FFB81C', green: '#007749', red: '#E03C31', blue: '#001489' }

/** A slice of a circle from `a1` to `a2` degrees, clockwise from the top. */
export function wedge(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const p = (a: number) => `${(cx + r * Math.sin((a * Math.PI) / 180)).toFixed(2)},${(cy - r * Math.cos((a * Math.PI) / 180)).toFixed(2)}`
  if (a2 - a1 >= 359.99) return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`
  return `M${cx},${cy} L${p(a1)} A${r},${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${p(a2)} Z`
}

export const sayList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''))
