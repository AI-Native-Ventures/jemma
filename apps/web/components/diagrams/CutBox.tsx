import type { CutBoxSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD_TINT, INK, Svg, T, WHITE, type Variant } from './shared'

// P196: a box cut from a card, from the "Grades 10 to 12" board ("Squares of side x are cut from a 30 cm card to make an open box. For which x is the volume
// biggest?"). The square card has a dashed red square cut from each corner, x on two of their sides, and beside it the open box the card folds into.

export type CutBoxProps = CutBoxSpec & { variant?: Variant }

const W = 320
const H = 244
const S = 200
const CUT = 40
const RED = '#E03C31'

export function describeCutBox({ side, cut = 'x' }: CutBoxProps): string {
  return `A square card ${side.trim()} wide with a square of side ${cut.trim()} cut from each corner, and the open box it folds into.`
}

export function CutBox(props: CutBoxProps) {
  const { side, cut = 'x' } = props
  const corners = [
    [10, 10],
    [10 + S - CUT, 10],
    [10, 10 + S - CUT],
    [10 + S - CUT, 10 + S - CUT],
  ]
  return (
    <Svg width={W} height={H} label={describeCutBox(props)}>
      <rect x={10} y={10} width={S} height={S} fill={GOLD_TINT} stroke={INK} strokeWidth={2} />
      {corners.map(([x, y], i) => (
        <rect key={i} data-cut="" x={x} y={y} width={CUT} height={CUT} fill={WHITE} stroke={RED} strokeWidth={2} strokeDasharray="5 4" />
      ))}
      <T x={30} y={64} size={14} weight={700} fill={RED}>
        {cut.trim()}
      </T>
      <T x={54} y={34} size={14} weight={700} fill={RED}>
        {cut.trim()}
      </T>
      <T x={110} y={232} size={14} weight={700} fill={BODY}>
        {side.trim()}
      </T>
      <g data-box="">
        <path d="M232,150 l40,-24 l40,24 l-40,24 Z" fill={GOLD_TINT} stroke={INK} strokeWidth={2} />
        <path d="M232,150 l0,28 l40,24 l40,-24 l0,-28" fill="none" stroke={INK} strokeWidth={2} />
        <path d="M272,174 l0,28" fill="none" stroke={INK} strokeWidth={1.6} />
      </g>
    </Svg>
  )
}
