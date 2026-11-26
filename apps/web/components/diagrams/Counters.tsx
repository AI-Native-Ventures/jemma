import type { CountersSpec } from '@jemma/profiling/schemas'
import { INK, Svg, type Variant } from './shared'
import { CHANCE_FILL, sayList } from './chart-frame'

// P197: a bag of counters, from the "Probability" board ("Lerato takes one counter without looking. What is P(gold)?"). An open bag with the counters in it, a row
// at a time, each in its colour.

export type CountersProps = CountersSpec & { variant?: Variant }

const W = 300
const H = 226
const WORDS = ['gold', 'green', 'red', 'blue'] as const

export function describeCounters(props: CountersProps): string {
  const counts = WORDS.map((c) => [c, props[c] ?? 0] as const).filter(([, n]) => n > 0)
  const total = counts.reduce((a, [, n]) => a + n, 0)
  // While a question is answered the words name the colours but do not count the counters: a count may be the answer.
  if (props.variant === 'question') return `A bag of ${sayList(counts.map(([c]) => c))} counters.`
  return `A bag with ${total} counters: ${sayList(counts.map(([c, n]) => `${n} ${c}`))}.`
}

export function Counters(props: CountersProps) {
  const colours = WORDS.flatMap((c) => Array.from({ length: props[c] ?? 0 }, () => c))
  const perRow = colours.length > 15 ? 5 : colours.length > 8 ? 4 : 3
  const rows = Math.ceil(colours.length / perRow)
  const r = Math.min(16, 120 / (rows * 2.4))
  const rowGap = r * 2.3
  return (
    <Svg width={W} height={H} label={describeCounters(props)}>
      <path d="M60,60 Q50,30 90,30 L210,30 Q250,30 240,60 L260,190 Q262,214 236,214 L64,214 Q38,214 40,190 Z" fill="#F2E9D8" stroke={INK} strokeWidth={2.5} />
      <path d="M80,30 Q150,52 220,30" fill="none" stroke={INK} strokeWidth={2} />
      {colours.map((c, k) => {
        const row = Math.floor(k / perRow)
        const inRow = Math.min(perRow, colours.length - row * perRow)
        const col = k % perRow
        const x = 150 + (col - (inRow - 1) / 2) * (r * 2.6) + (row % 2 ? r * 0.4 : 0)
        // The counters rest at the bottom of the bag, a row at a time.
        const y = 192 - (rows - 1 - row) * rowGap
        return <circle key={k} data-counter={c} cx={x} cy={y} r={r} fill={CHANCE_FILL[c]} stroke={INK} strokeWidth={1.8} />
      })}
    </Svg>
  )
}
