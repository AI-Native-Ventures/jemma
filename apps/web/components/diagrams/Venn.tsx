import type { VennSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GOLD_TINT, INK, Svg, T, WHITE, type Variant } from './shared'

// P197: a Venn diagram, from the "Probability" board ("Fill in the Venn diagram."). Two circles A and B in the box S, a number in each part; a part the learner fills
// in is a gold box with a question mark.

export type VennProps = VennSpec & { variant?: Variant }

const W = 320
const H = 222
const GREEN = '#007749'

const blank = (t: string) => t.trim() === '?'

export function describeVenn({ a, b, aOnly, both, bOnly, neither }: VennProps): string {
  const part = (t: string) => (blank(t) ? 'a blank' : t.trim())
  return `A Venn diagram in S with the sets ${a.trim()} and ${b.trim()}: ${a.trim()} only is ${part(aOnly)}, both is ${part(both)}, ${b.trim()} only is ${part(bOnly)}${neither !== undefined ? `, and neither is ${part(neither)}` : ''}.`
}

function Part({ x, y, text }: { x: number; y: number; text: string }) {
  return blank(text) ? (
    <g data-blank="">
      <circle cx={x} cy={y - 6} r={16} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2} />
      <T x={x} y={y} size={17} weight={700}>
        ?
      </T>
    </g>
  ) : (
    <T x={x} y={y} size={18} weight={700}>
      {text.trim()}
    </T>
  )
}

export function Venn(props: VennProps) {
  const { a, b, aOnly, both, bOnly, neither } = props
  return (
    <Svg width={W} height={H} label={describeVenn(props)}>
      <rect x={10} y={10} width={300} height={200} rx={12} fill={WHITE} stroke={INK} strokeWidth={2} />
      <T x={22} y={32} size={15} weight={700} fill={BODY} anchor="start">
        S
      </T>
      <circle cx={120} cy={118} r={74} fill={GOLD} fillOpacity={0.35} stroke={INK} strokeWidth={2} />
      <circle cx={200} cy={118} r={74} fill={GREEN} fillOpacity={0.22} stroke={INK} strokeWidth={2} />
      <T x={100} y={34} size={15} weight={700}>
        {a.trim()}
      </T>
      <T x={220} y={34} size={15} weight={700}>
        {b.trim()}
      </T>
      <Part x={88} y={126} text={aOnly} />
      <Part x={160} y={126} text={both} />
      <Part x={232} y={126} text={bOnly} />
      {neither !== undefined ? <Part x={282} y={190} text={neither} /> : null}
    </Svg>
  )
}
