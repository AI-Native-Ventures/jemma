import type { PieChartSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { INK, Svg, T, type Variant } from './shared'
import { PART_COLOURS, sayList, wedge } from './chart-frame'

// P197: a pie chart, from the "Data" board ("What percentage of learners come by bus?"). Each part in a colour of its own with its percent in it, from the top
// going round clockwise, and a key beside it. The part the question asks about has a question mark.

export type PieChartProps = PieChartSpec & { variant?: Variant; notation?: Notation }

const W = 320
const H = 224
const CX = 102
const CY = 112
const R = 94

export function describePieChart({ parts, variant = 'card', notation = 'za' }: PieChartProps): string {
  const names = parts.map((p) => p.label.trim().toLowerCase())
  // While a question is answered the words name the parts but do not read them: a percent may be the answer.
  if (variant === 'question') return `A pie chart of ${parts.length} parts: ${sayList(names)}.`
  return `A pie chart of ${parts.length} parts: ${sayList(parts.map((p, i) => `${names[i]} ${p.ask ? 'a question mark' : `${numberIn(p.percent, notation)}%`}`))}.`
}

export function PieChart(props: PieChartProps) {
  const { parts, notation = 'za' } = props
  let a = 0
  const slices = parts.map((p, i) => {
    const a1 = a + p.percent * 3.6
    const mid = ((a + a1) / 2) * (Math.PI / 180)
    // The percent of a thin part sits further out, where the part is wider.
    const at = p.percent < 8 ? 74 : 60
    const out = { p, i, a0: a, a1, lx: CX + at * Math.sin(mid), ly: CY - at * Math.cos(mid) }
    a = a1
    return out
  })
  return (
    <Svg width={W} height={H} label={describePieChart(props)}>
      {slices.map(({ p, i, a0, a1 }) => (
        <path key={i} data-part={p.label.trim()} d={wedge(CX, CY, R, a0, a1)} fill={PART_COLOURS[i % PART_COLOURS.length]} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      ))}
      {slices.map(({ p, i, lx, ly }) => (
        <T key={`l${i}`} x={lx} y={ly + 5} size={p.percent < 8 ? 11 : 15} weight={700} fill={i % PART_COLOURS.length === 0 ? INK : '#FFFFFF'}>
          {p.ask ? '?' : `${numberIn(p.percent, notation)}%`}
        </T>
      ))}
      {parts.map((p, i) => (
        <g key={`k${i}`}>
          <rect x={206} y={22 + i * 30} width={18} height={18} rx={4} fill={PART_COLOURS[i % PART_COLOURS.length]} stroke={INK} strokeWidth={1.2} />
          <T x={230} y={36 + i * 30} size={13} weight={700} anchor="start">
            {p.label.trim()}
          </T>
        </g>
      ))}
    </Svg>
  )
}
