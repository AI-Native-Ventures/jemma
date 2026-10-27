import type { DiagramSpec } from '@jemma/profiling/schemas'
import { CORAL, CORAL_TEXT, INK, Line, Svg, T, fmt } from './shared'

export type NumberLineProps = Extract<DiagramSpec, { kind: 'number_line' }>

const X0 = 30
const X1 = 255
const Y = 112
const r1 = (n: number) => Math.round(n * 10) / 10

export function describeNumberLine({ min, max, step, marks }: NumberLineProps) {
  const m = marks.length ? ` Marked: ${marks.map((k) => k.label).join(', ')}.` : ''
  return `Number line from ${fmt(min)} to ${fmt(max)} in steps of ${fmt(step)}.${m}`
}

export function NumberLine(props: NumberLineProps) {
  const { min, max, step, marks } = props
  const span = max - min || 1
  const px = (v: number) => X0 + ((v - min) / span) * (X1 - X0)
  const ticks: number[] = []
  if (step > 0) for (let v = min, i = 0; v <= max + 1e-9 && i < 200; i += 1, v = min + i * step) ticks.push(Math.round(v * 1e6) / 1e6)
  const marked = new Map(marks.map((m) => [Math.round(m.value * 1e6) / 1e6, m.label]))
  // Fraction marks (3/4) mean the whole line speaks in fractions: 0, 1/4, 2/4, 3/4, 1.
  const denom = Math.round(1 / step)
  const asFraction = step > 0 && step < 1 && Math.abs(denom * step - 1) < 1e-9 && marks.some((m) => /^\d+\/\d+$/.test(m.label))
  const tickLabel = (v: number) => {
    if (!asFraction) return fmt(v)
    const n = Math.round(v * denom)
    return n % denom === 0 ? String(n / denom) : `${n}/${denom}`
  }
  const all = [...new Set([...ticks, ...marked.keys()])].sort((a, b) => a - b)
  // Counting on: one hop per step from the start up to the highest mark, when that mark sits on the step grid.
  const hops: [number, number][] = []
  const target = marks.length ? Math.max(...marks.map((m) => m.value)) : min
  const count = step > 0 ? Math.round((target - min) / step) : 0
  if (count >= 1 && count <= 12 && Math.abs(min + count * step - target) < 1e-9) {
    for (let i = 0; i < count; i += 1) hops.push([min + i * step, min + (i + 1) * step])
  }
  return (
    <Svg width={285} height={190} label={describeNumberLine(props)}>
      <Line x1={X0} y1={Y} x2={X1} y2={Y} w={2} cap="round" />
      {hops.map(([a, b], i) => {
        const xa = px(a)
        const xb = px(b)
        const mid = (xa + xb) / 2
        return (
          <g key={`hop${i}`}>
            <path d={`M${r1(xa)} 108 Q${r1(mid)} 66 ${r1(xb - 3)} 104`} fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={`${r1(xb - 1)},107 ${r1(xb - 8)},103.1 ${r1(xb - 1.4)},99`} fill={INK} />
          </g>
        )
      })}
      {all.map((v) => {
        const x = Math.round(px(v) * 10) / 10
        const m = marked.has(v)
        return (
          <g key={v}>
            <Line x1={x} y1={Y - 8} x2={x} y2={Y + 8} w={2} cap="round" />
            <T x={x} y={138} size={13} weight={m ? 600 : 400} fill={m ? CORAL_TEXT : INK}>
              {marked.get(v) ?? tickLabel(v)}
            </T>
          </g>
        )
      })}
      {[...marked.keys()].map((v) => (
        <circle key={v} cx={Math.round(px(v) * 10) / 10} cy={Y} r={7} fill={CORAL} stroke={INK} strokeWidth={1.5} />
      ))}
    </Svg>
  )
}
