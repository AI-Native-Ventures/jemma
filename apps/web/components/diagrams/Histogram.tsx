import type { HistogramSpec, OgiveSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, GOLD_TINT, INK, Svg, type Variant } from './shared'
import { Axes, CHART, YScale, niceTop, sayList } from './chart-frame'

// P197: a histogram and an ogive, from the "Data" boards ("How many learners scored 60% or more?", "Use the ogive to estimate the median mark."). The histogram's
// bars touch, one for each class; the ogive is the running total at the top of each class, joined from 0, with a dashed line read across from a total.

export type HistogramProps = HistogramSpec & { variant?: Variant; notation?: Notation }
export type OgiveProps = OgiveSpec & { variant?: Variant; notation?: Notation }

const W = 320
const H = 236
const GREEN = '#007749'
const RED = '#E03C31'

const bounds = (start: number, width: number, n: number) => Array.from({ length: n + 1 }, (_, k) => start + k * width)

/** The numbers of the class boundaries along the bottom. */
function XBounds({ start, width, n, notation }: { start: number; width: number; n: number; notation: Notation }) {
  const { x0, y0, w, h } = CHART
  return (
    <g>
      {bounds(start, width, n).map((b, k) => (
        <text key={k} x={x0 + (k * w) / n} y={y0 + h + 16} fontSize={11} fontWeight={600} fill={BODY} textAnchor="middle">
          {numberIn(b, notation)}
        </text>
      ))}
    </g>
  )
}

export function describeHistogram({ start, width, counts, variant = 'card', notation = 'za' }: HistogramProps): string {
  const b = bounds(start, width, counts.length).map((v) => numberIn(v, notation))
  const head = `A histogram of ${counts.length} classes of ${numberIn(width, notation)} from ${b[0]} to ${b[b.length - 1]}`
  // While a question is answered the words never read the bars: a count may be the answer.
  if (variant === 'question') return `${head}.`
  return `${head}: ${sayList(counts.map((c, i) => `${b[i]} to ${b[i + 1]} has ${c}`))}.`
}

export function Histogram(props: HistogramProps) {
  const { start, width, counts, xLabel, yLabel, notation = 'za' } = props
  const { top, step } = niceTop(Math.max(...counts), true)
  const { x0, y0, w, h } = CHART
  const bw = w / counts.length
  const Y = (v: number) => y0 + h - (v / top) * h
  return (
    <Svg width={W} height={H} label={describeHistogram(props)}>
      <YScale min={0} max={top} step={step} y={Y} notation={notation} />
      {counts.map((c, k) => (
        <rect key={k} data-bar={c} x={x0 + k * bw} y={Y(c)} width={bw} height={y0 + h - Y(c)} fill={GOLD_TINT} stroke={INK} strokeWidth={1.8} />
      ))}
      <Axes x={xLabel?.trim()} y={yLabel?.trim()} />
      <XBounds start={start} width={width} n={counts.length} notation={notation} />
    </Svg>
  )
}

export function describeOgive({ start, width, totals, readAt, variant = 'card', notation = 'za' }: OgiveProps): string {
  const b = bounds(start, width, totals.length).map((v) => numberIn(v, notation))
  const across = readAt !== undefined ? `, with a dashed line across from ${numberIn(readAt, notation)}` : ''
  // While a question is answered the words never read the curve: a value on it, or the total, may be the answer.
  if (variant === 'question') return `An ogive of running totals over classes of ${numberIn(width, notation)} from ${b[0]} to ${b[b.length - 1]}${across}.`
  return `An ogive of the running totals of ${totals[totals.length - 1]} over classes of ${numberIn(width, notation)} from ${b[0]} to ${b[b.length - 1]}${across}: ${sayList(totals.map((t, i) => `${t} by ${b[i + 1]}`))}.`
}

export function Ogive(props: OgiveProps) {
  const { start, width, totals, readAt, xLabel, notation = 'za' } = props
  const { top, step } = niceTop(totals[totals.length - 1]!, true)
  const { x0, y0, w, h } = CHART
  const n = totals.length
  const X = (v: number) => x0 + ((v - start) / (width * n)) * w
  const Y = (v: number) => y0 + h - (v / top) * h
  const pts = [{ x: start, y: 0 }, ...totals.map((t, i) => ({ x: start + (i + 1) * width, y: t }))]
  // Where the curve reaches the total read across from: on the piece of the curve that passes it.
  const across = (() => {
    if (readAt === undefined) return null
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      if (readAt >= a.y && readAt <= b.y && b.y > a.y) return a.x + ((readAt - a.y) / (b.y - a.y)) * (b.x - a.x)
    }
    return null
  })()
  return (
    <Svg width={W} height={H} label={describeOgive(props)}>
      <YScale min={0} max={top} step={step} y={Y} notation={notation} />
      <Axes x={xLabel?.trim()} y="cumulative" />
      <polyline data-curve="" points={pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} fill="none" stroke={GREEN} strokeWidth={3} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={GREEN} stroke={INK} strokeWidth={1.2} />
      ))}
      {readAt !== undefined && across !== null ? (
        <g data-read="">
          <line x1={x0} y1={Y(readAt)} x2={X(across)} y2={Y(readAt)} stroke={RED} strokeWidth={2} strokeDasharray="6 4" />
          <line x1={X(across)} y1={Y(readAt)} x2={X(across)} y2={y0 + h} stroke={RED} strokeWidth={2} strokeDasharray="6 4" />
        </g>
      ) : null}
      <XBounds start={start} width={width} n={n} notation={notation} />
    </Svg>
  )
}
