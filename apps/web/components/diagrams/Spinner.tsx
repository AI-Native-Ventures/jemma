import type { SpinnerSpec } from '@jemma/profiling/schemas'
import { INK, Svg, WHITE, type Variant } from './shared'
import { CHANCE_FILL, sayList, wedge } from './chart-frame'

// P197: a spinner, from the "Probability" board ("What is the chance of landing on gold?"). Equal parts in their colours, from the top going round clockwise,
// and an arrow in the middle.

export type SpinnerProps = SpinnerSpec & { variant?: Variant }

const W = 300
const H = 232
const CX = 150
const CY = 118
const R = 100
const WORDS = ['gold', 'green', 'red', 'blue'] as const

export function describeSpinner({ parts, variant = 'card' }: SpinnerProps): string {
  const counts = WORDS.map((c) => [c, parts.filter((p) => p === c).length] as const).filter(([, n]) => n > 0)
  // While a question is answered the words name the colours but do not count the parts: a count may be the answer.
  if (variant === 'question') return `A spinner with equal parts in ${sayList(counts.map(([c]) => c))}.`
  return `A spinner with ${parts.length} equal parts: ${sayList(counts.map(([c, n]) => `${n} ${c}`))}.`
}

export function Spinner(props: SpinnerProps) {
  const { parts } = props
  const each = 360 / parts.length
  return (
    <Svg width={W} height={H} label={describeSpinner(props)}>
      {parts.map((c, k) => (
        <path key={k} data-part={c} d={wedge(CX, CY, R, k * each, (k + 1) * each)} fill={CHANCE_FILL[c]} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      ))}
      <polygon points={`${CX},${CY - 70} ${CX - 7},${CY} ${CX + 7},${CY}`} fill={INK} />
      <circle cx={CX} cy={CY} r={9} fill={WHITE} stroke={INK} strokeWidth={2} />
    </Svg>
  )
}
