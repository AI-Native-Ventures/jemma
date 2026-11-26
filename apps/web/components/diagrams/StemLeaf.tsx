import type { StemLeafSpec } from '@jemma/profiling/schemas'
import { BODY, INK, Svg, T, type Variant } from './shared'

// P197: a stem and leaf display, from the "Data" board ("What is the median mark?"). The stems down the left of a line, the leaves of each row beside it, smallest
// first, and the key under it, made from its first value.

export type StemLeafProps = StemLeafSpec & { variant?: Variant }

const W = 320
const ROW = 36

export function describeStemLeaf({ rows, variant = 'card' }: StemLeafProps): string {
  const first = rows[0]!
  // While a question is answered the words never read the leaves: the smallest, the biggest or the middle value may be the answer.
  if (variant === 'question') return `A stem and leaf display with the stems ${first.stem} to ${rows[rows.length - 1]!.stem}, and its key.`
  return `A stem and leaf display: ${rows.map((r) => `${r.stem} | ${r.leaves.join(' ')}`).join(', ')}. Key: ${first.stem} | ${first.leaves[0]} means ${first.stem * 10 + first.leaves[0]!}.`
}

export function StemLeaf(props: StemLeafProps) {
  const { rows } = props
  const first = rows[0]!
  const H = 30 + rows.length * ROW + 32
  return (
    <Svg width={W} height={H} label={describeStemLeaf(props)}>
      <line x1={60} y1={14} x2={60} y2={14 + rows.length * ROW} stroke={INK} strokeWidth={2} />
      <T x={36} y={12} size={12} weight={700} fill={BODY}>
        stem
      </T>
      <T x={120} y={12} size={12} weight={700} fill={BODY}>
        leaf
      </T>
      {rows.map((r, k) => (
        <g key={k} data-stem={r.stem}>
          <T x={36} y={40 + k * ROW} size={20} weight={700}>
            {String(r.stem)}
          </T>
          {r.leaves.map((l, i) => (
            <T key={i} x={84 + i * 20} y={40 + k * ROW} size={19} weight={600}>
              {String(l)}
            </T>
          ))}
        </g>
      ))}
      <T x={10} y={H - 10} size={13} weight={700} fill={BODY} anchor="start">
        {`Key: ${first.stem} | ${first.leaves[0]} means ${first.stem * 10 + first.leaves[0]!}`}
      </T>
    </Svg>
  )
}
