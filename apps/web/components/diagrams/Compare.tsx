import type { CompareSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_TINT, INK, Svg, T, WHITE } from './shared'

// P188: two numbers with a blank sign between them, from the "Counting and place value" board ("Which sign makes it true?"). The sign is the answer, picked from
// the choices <, > and =.

export type CompareProps = CompareSpec

export const describeCompare = ({ left, right }: CompareProps): string => `${left.trim()}, a blank sign, ${right.trim()}.`

export function Compare(props: CompareProps) {
  const size = (t: string) => (t.trim().length > 4 ? 26 : 40)
  return (
    <Svg width={320} height={120} label={describeCompare(props)}>
      <rect x={10} y={20} width={110} height={80} rx={18} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      <T x={65} y={60 + size(props.left) * 0.36} size={size(props.left)} weight={700}>
        {props.left.trim()}
      </T>
      <circle cx={160} cy={60} r={28} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2.5} />
      <T x={160} y={70} size={28} weight={700}>
        ?
      </T>
      <rect x={200} y={20} width={110} height={80} rx={18} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      <T x={255} y={60 + size(props.right) * 0.36} size={size(props.right)} weight={700}>
        {props.right.trim()}
      </T>
    </Svg>
  )
}
