import type { LineGraphSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK, Svg, T, type Variant } from './shared'
import { Axes, CHART, YScale, sayList } from './chart-frame'

// P197: a broken-line graph, from the "Data" board ("On which day was it warmest?"). A red dot for each value, joined by straight lines, on light lines across,
// with the labels along the bottom.

export type LineGraphProps = LineGraphSpec & { variant?: Variant; notation?: Notation }

const W = 320
const H = 230
const RED = '#E03C31'

export function describeLineGraph({ labels, values, yMin, yMax, unit, variant = 'card', notation = 'za' }: LineGraphProps): string {
  const head = `A broken-line graph of ${labels.length} values, from ${labels[0]!.trim()} to ${labels[labels.length - 1]!.trim()}, on a scale from ${numberIn(yMin, notation)} to ${numberIn(yMax, notation)}${unit ? ` ${unit.trim()}` : ''}`
  // While a question is answered the words never read the values: one may be the answer.
  if (variant === 'question') return `${head}.`
  return `${head}: ${sayList(labels.map((l, i) => `${l.trim()} ${numberIn(values[i]!, notation)}`))}.`
}

export function LineGraph(props: LineGraphProps) {
  const { labels, values, yMin, yMax, unit, notation = 'za' } = props
  const step = props.step ?? (yMax - yMin) / 5
  const { x0, y0, w, h } = CHART
  const X = (i: number) => x0 + 20 + (i * (w - 40)) / Math.max(labels.length - 1, 1)
  const Y = (v: number) => y0 + h - ((v - yMin) / (yMax - yMin)) * h
  const gap = (w - 40) / Math.max(labels.length - 1, 1)
  const longest = Math.max(...labels.map((l) => l.trim().length))
  // Labels too wide for the room between two points go on two rows, every other one lower down.
  const twoRows = longest * 0.62 * 12 > gap * 0.9
  const size = twoRows ? 11 : 12
  return (
    <Svg width={W} height={H} label={describeLineGraph(props)}>
      <YScale min={yMin} max={yMax} step={step} y={Y} notation={notation} />
      <Axes y={unit?.trim()} />
      <polyline data-line="" points={values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke={RED} strokeWidth={3} strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle data-point={labels[i]!.trim()} cx={X(i)} cy={Y(v)} r={5} fill={RED} stroke={INK} strokeWidth={1.4} />
          <T x={X(i)} y={y0 + h + (twoRows && i % 2 ? 32 : 18)} size={size} weight={700} fill={BODY}>
            {labels[i]!.trim()}
          </T>
        </g>
      ))}
    </Svg>
  )
}
