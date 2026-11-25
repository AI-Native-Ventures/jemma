import type { BoxPlotSpec } from '@jemma/profiling/schemas'
import { BODY, EDGE, GOLD_TINT, INK, Line, Svg, T, fmt } from './shared'

// P165: a box and whisker plot on a scale. No value is written on the plot: the learner reads the five numbers off the scale.

const W = 340
const X0 = 24
const X1 = 316

export function describeBoxPlot(s: BoxPlotSpec): string {
  return `${s.title ? `${s.title}. ` : ''}Box and whisker plot on a scale from ${fmt(s.scaleMin)} to ${fmt(s.scaleMax)}. Minimum ${fmt(s.min)}, lower quartile ${fmt(s.q1)}, median ${fmt(s.median)}, upper quartile ${fmt(s.q3)}, maximum ${fmt(s.max)}.`
}

export function BoxPlot(s: BoxPlotSpec) {
  const top = s.title ? 30 : 8
  const H = top + 132
  const x = (v: number) => X0 + ((v - s.scaleMin) / (s.scaleMax - s.scaleMin)) * (X1 - X0)
  const step = s.step ?? (s.scaleMax - s.scaleMin) / 10
  const ticks: number[] = []
  for (let v = s.scaleMin; v <= s.scaleMax + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  const every = ticks.length > 11 ? 2 : 1
  const mid = top + 46
  const axis = top + 96
  return (
    <Svg width={W} height={H} label={describeBoxPlot(s)}>
      {s.title ? (
        <T x={W / 2} y={18} size={13} weight={600} fill={BODY}>
          {s.title}
        </T>
      ) : null}
      {ticks.map((v) => (
        <Line key={`g${v}`} x1={x(v)} y1={top + 14} x2={x(v)} y2={axis} stroke={EDGE} w={0.8} />
      ))}
      <Line x1={x(s.min)} y1={mid} x2={x(s.q1)} y2={mid} w={2} />
      <Line x1={x(s.q3)} y1={mid} x2={x(s.max)} y2={mid} w={2} />
      <Line x1={x(s.min)} y1={mid - 12} x2={x(s.min)} y2={mid + 12} w={2} cap="round" />
      <Line x1={x(s.max)} y1={mid - 12} x2={x(s.max)} y2={mid + 12} w={2} cap="round" />
      <rect data-box="" x={x(s.q1)} y={mid - 22} width={Math.max(1, x(s.q3) - x(s.q1))} height={44} rx={4} fill={GOLD_TINT} stroke={INK} strokeWidth={2} />
      <Line x1={x(s.median)} y1={mid - 22} x2={x(s.median)} y2={mid + 22} w={3} />
      <Line x1={X0} y1={axis} x2={X1} y2={axis} w={1.6} />
      {ticks.map((v, i) => (
        <g key={`t${v}`}>
          <Line x1={x(v)} y1={axis} x2={x(v)} y2={axis + 6} w={1.4} />
          {i % every === 0 ? (
            <T x={x(v)} y={axis + 22} size={12} weight={500}>
              {fmt(v)}
            </T>
          ) : null}
        </g>
      ))}
    </Svg>
  )
}
