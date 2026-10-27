import type { DiagramSpec } from '@jemma/profiling/schemas'
import { BODY, CORAL, INK, Line, SOFT_3, Svg, T, type Variant, fmt } from './shared'

export type BarChartProps = Extract<DiagramSpec, { kind: 'bar_chart' }> & {
  variant?: Variant
  /** Bar labels drawn in coral (question variant). Card variant highlights the tallest bar by default. */
  highlight?: string[]
}

export function describeBarChart({ bars, yMax }: BarChartProps) {
  return `Bar graph, from 0 to ${fmt(yMax)}: ${bars.map((b) => `${b.label} ${fmt(b.value)}`).join(', ')}.`
}

function niceStep(yMax: number, maxTicks: number) {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (yMax / s <= maxTicks) return s
  return yMax
}

export function BarChart(props: BarChartProps) {
  const { bars, variant = 'card' } = props
  const yMax = props.yMax > 0 ? props.yMax : 1
  const q = variant === 'question'
  const n = Math.max(1, bars.length)

  // card: 285x190, plot x 46..270, baseline 150, top 24. question: 314x252, plot x 34..306, baseline 214, top 30.
  const g = q
    ? { w: 314, h: 252, x0: 34, x1: 306, base: 214, top: 30, barW: 44, pitch: 68, off: 12, lab: 234, ls: 13, lw: 600, tick: 11 }
    : { w: 285, h: 190, x0: 46, x1: 270, base: 150, top: 24, barW: 34, pitch: 224 / n, off: 0, lab: 168, ls: 12, lw: 400, tick: 12 }
  const barW = q ? g.barW : Math.min(34, g.pitch - 22)
  const pitch = q ? Math.min(g.pitch, n > 1 ? (g.x1 - g.x0 - 12 - barW) / (n - 1) : g.pitch) : g.pitch
  const k = (g.base - g.top) / yMax
  const step = niceStep(yMax, q ? 8 : 5)
  const ticks: number[] = []
  for (let v = step; v <= yMax + 1e-9; v += step) ticks.push(v)
  if (q) ticks.unshift(0)
  const tallest = Math.max(...bars.map((b) => b.value))
  const lit = (b: { label: string; value: number }) => (props.highlight ? props.highlight.includes(b.label) : !q && b.value === tallest)
  const bx = (i: number) => (q ? g.x0 + 12 + pitch * i : g.x0 + pitch * i + (pitch - barW) / 2)

  return (
    <Svg width={g.w} height={g.h} label={describeBarChart(props)}>
      {q &&
        yMax <= 24 &&
        Array.from({ length: Math.floor(yMax) + 1 }, (_, v) => (
          <Line key={`m${v}`} x1={g.x0} y1={g.base - v * k} x2={g.x1} y2={g.base - v * k} stroke={v % 2 === 0 ? '#D7D5E4' : SOFT_3} />
        ))}
      {!q && ticks.map((v) => <Line key={`g${v}`} x1={g.x0} y1={g.base - v * k} x2={g.x1} y2={g.base - v * k} stroke={SOFT_3} />)}
      {(q ? ticks.filter((v) => v % step === 0) : [0, ...ticks]).map((v) => (
        <T key={`t${v}`} x={g.x0 - (q ? 6 : 8)} y={g.base - v * k + 4} size={g.tick} weight={q ? 500 : 400} fill={BODY} anchor="end">
          {fmt(v)}
        </T>
      ))}
      {bars.map((b, i) => {
        const h = Math.max(0, Math.min(yMax, b.value)) * k
        const x = bx(i)
        const on = lit(b)
        const fill = q ? (on ? CORAL : INK) : on ? CORAL : SOFT_3
        return (
          <g key={i}>
            <rect x={x} y={g.base - h} width={barW} height={h} rx={q ? 4 : 0} fill={fill} stroke={q ? undefined : INK} strokeWidth={q ? undefined : 1.2} />
            {!q && (
              <T x={x + barW / 2} y={g.base - h - 6} size={12} weight={600}>
                {fmt(b.value)}
              </T>
            )}
            <T x={x + barW / 2} y={g.lab} size={g.ls} weight={g.lw}>
              {b.label}
            </T>
          </g>
        )
      })}
      <Line x1={g.x0} y1={g.base} x2={g.x1} y2={g.base} w={q ? 1.6 : 1.5} />
      {q && <Line x1={g.x0} y1={24} x2={g.x0} y2={g.base} w={1.6} />}
    </Svg>
  )
}
