import type { HundredChartSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_TINT, INK, Svg, T, WHITE, type Variant } from './shared'

// P188: part of a hundred chart, from the "Counting and place value" board ("Which number goes in the gold box?"): rows of ten, some boxes empty, and the one the
// question asks about in gold with a question mark.

export type HundredChartProps = HundredChartSpec & { variant?: Variant }

const CW = 30
const CH = 32
const PAD = 6

export function describeHundredChart({ from, rows, blanks, gold, variant = 'card' }: HundredChartProps): string {
  const last = from + rows * 10 - 1
  const others = blanks.filter((n) => n !== gold).length
  const goldWords = gold === undefined ? '' : variant === 'question' ? ' One empty box is gold.' : ` The gold box is ${gold}.`
  return `Part of a hundred chart from ${from} to ${last}, with ${others + (gold === undefined ? 0 : 1)} empty ${blanks.length === 1 ? 'box' : 'boxes'}.${goldWords}`
}

export function HundredChart(props: HundredChartProps) {
  const { from, rows, blanks, gold } = props
  const empty = new Set(blanks)
  return (
    <Svg width={PAD * 2 + CW * 10 + 9} height={PAD * 2 + rows * (CH + 2)} label={describeHundredChart(props)}>
      {Array.from({ length: rows * 10 }, (_, k) => {
        const n = from + k
        const x = PAD + (k % 10) * (CW + 1)
        const y = PAD + Math.floor(k / 10) * (CH + 2)
        if (n === gold)
          return (
            <g key={n} data-gold="">
              <rect x={x} y={y} width={CW} height={CH} rx={4} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2.5} />
              <T x={x + CW / 2} y={y + 22} size={16} weight={700}>
                ?
              </T>
            </g>
          )
        return (
          <g key={n}>
            <rect x={x} y={y} width={CW} height={CH} rx={4} fill={WHITE} stroke="#C9C5BC" strokeWidth={1.4} />
            {empty.has(n) ? null : (
              <T x={x + CW / 2} y={y + 21} size={13} weight={600} fill={INK}>
                {String(n)}
              </T>
            )}
          </g>
        )
      })}
    </Svg>
  )
}
