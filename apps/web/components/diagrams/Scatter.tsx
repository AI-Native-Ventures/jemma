import type { ScatterSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK, Svg, type Variant } from './shared'
import { Axes, CHART, YScale, niceTop } from './chart-frame'

// P197: a scatter plot, from the "Data" boards ("What does the scatter plot show?", "Use the line of best fit to predict the mark for 6 hours of study."). A blue
// dot for each point, and the line of best fit in red with its equation when the question has one.

export type ScatterProps = ScatterSpec & { variant?: Variant; notation?: Notation }

const W = 320
const H = 240
const BLUE = '#001489'
const RED = '#E03C31'

const fitText = (line: { a: number; b: number }, n: Notation) => `ŷ = ${numberIn(line.a, n)} ${line.b < 0 ? '−' : '+'} ${numberIn(Math.abs(line.b), n)}x`

export function describeScatter({ points, xLabel, yLabel, line, notation = 'za' }: ScatterProps): string {
  const what = yLabel && xLabel ? ` of ${yLabel.trim()} against ${xLabel.trim()}` : ''
  return `A scatter plot of ${points.length} points${what}.${line ? ` The line of best fit is ${fitText(line, notation)}.` : ''}`
}

export function Scatter(props: ScatterProps) {
  const { points, xMax, yMax, xLabel, yLabel, line, notation = 'za' } = props
  const { x0, y0, w, h } = CHART
  const xs = niceTop(xMax)
  const ys = niceTop(yMax)
  const X = (v: number) => x0 + (v / xs.top) * w
  const Y = (v: number) => y0 + h - (v / ys.top) * h
  // The line of best fit across the plot, stopped at its top and its bottom.
  const fit = (() => {
    if (!line) return null
    const at = (x: number) => line.a + line.b * x
    const clampX = (y: number) => (line.b === 0 ? xs.top : (y - line.a) / line.b)
    let xa = 0
    let xb = xs.top
    if (at(xa) < 0) xa = clampX(0)
    if (at(xa) > ys.top) xa = clampX(ys.top)
    if (at(xb) > ys.top) xb = clampX(ys.top)
    if (at(xb) < 0) xb = clampX(0)
    return { x1: X(xa), y1: Y(at(xa)), x2: X(xb), y2: Y(at(xb)) }
  })()
  return (
    <Svg width={W} height={H} label={describeScatter(props)}>
      <YScale min={0} max={ys.top} step={ys.step} y={Y} notation={notation} />
      <Axes x={xLabel?.trim()} y={yLabel?.trim()} />
      {Array.from({ length: Math.round(xs.top / xs.step) + 1 }, (_, k) =>
        k > 0 ? (
          <text key={k} x={X(k * xs.step)} y={y0 + h + 16} fontSize={11} fontWeight={500} fill={BODY} textAnchor="middle">
            {numberIn(k * xs.step, notation)}
          </text>
        ) : null,
      )}
      {points.map((p, i) => (
        <circle key={i} data-point="" cx={X(p.x)} cy={Y(p.y)} r={5.5} fill={BLUE} stroke={INK} strokeWidth={1.2} />
      ))}
      {fit && line ? (
        <g data-fit="">
          <line x1={fit.x1} y1={fit.y1} x2={fit.x2} y2={fit.y2} stroke={RED} strokeWidth={2.5} />
          {/* Points rising to the right leave the bottom right empty; points falling leave the top right empty. */}
          <text x={x0 + w - 6} y={line.b >= 0 ? y0 + h - 10 : y0 + 16} fontSize={13} fontWeight={700} fill={RED} stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke" textAnchor="end">
            {fitText(line, notation)}
          </text>
        </g>
      ) : null}
    </Svg>
  )
}
