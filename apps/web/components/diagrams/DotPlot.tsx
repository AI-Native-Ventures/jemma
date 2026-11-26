import type { DotPlotSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, INK, Svg, T, type Variant } from './shared'
import { sayList } from './chart-frame'

// P197: a line plot, from the "Data" board ("How many children wear size 3?"). A mark on a line for each value, and a gold dot above it for each one counted.

export type DotPlotProps = DotPlotSpec & { variant?: Variant }

const W = 320
const BASE = 170

export function describeDotPlot({ marks, counts, title, variant = 'card' }: DotPlotProps): string {
  const head = `A line plot${title ? ` of ${title.trim().toLowerCase()}` : ''} with marks ${marks[0]!.trim()} to ${marks[marks.length - 1]!.trim()}, a dot for each one counted`
  // While a question is answered the words never count the dots: a count may be the answer.
  if (variant === 'question') return `${head}.`
  return `${head}: ${sayList(marks.map((m, i) => `${m.trim()} has ${counts[i]}`))}.`
}

export function DotPlot(props: DotPlotProps) {
  const { marks, counts, title } = props
  const gap = 280 / marks.length
  const most = Math.max(...counts)
  const step = Math.min(22, 130 / Math.max(most, 1))
  const r = Math.min(9, step / 2 - 1)
  const longest = Math.max(...marks.map((m) => m.trim().length))
  const size = Math.max(10, Math.min(14, Math.floor(gap / (longest * 0.62))))
  return (
    <Svg width={W} height={title ? 222 : 204} label={describeDotPlot(props)}>
      <line x1={20} y1={BASE} x2={300} y2={BASE} stroke={INK} strokeWidth={2} />
      {marks.map((m, i) => {
        const x = 20 + (i + 0.5) * gap
        return (
          <g key={i} data-mark={m.trim()}>
            <line x1={x} y1={BASE - 6} x2={x} y2={BASE + 6} stroke={INK} strokeWidth={2} />
            <T x={x} y={BASE + 24} size={size} weight={700}>
              {m.trim()}
            </T>
            {Array.from({ length: counts[i]! }, (_, k) => (
              <circle key={k} data-dot="" cx={x} cy={BASE - 18 - k * step} r={r} fill={GOLD} stroke={INK} strokeWidth={1.6} />
            ))}
          </g>
        )
      })}
      {title ? (
        <T x={W / 2} y={214} size={13} weight={700} fill={BODY}>
          {title.trim()}
        </T>
      ) : null}
    </Svg>
  )
}
