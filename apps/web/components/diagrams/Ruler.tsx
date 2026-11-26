import type { RulerSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, GOLD, INK, Line, Svg, T, type Variant } from './shared'

// P190: a thing above a ruler, from the "Measuring" board ("How long is the pencil?"). The ruler is marked in centimetres and half centimetres, or in inches and
// quarter inches. Dashed lines drop from the two ends of the thing to the ruler, so the learner reads where it starts and where it ends.

export type RulerProps = RulerSpec & { variant?: Variant; notation?: Notation }

const W = 330
const X0 = 20
const RULER_Y = 58
const RULER_H = 52

export function describeRuler({ thing = 'pencil', unit = 'cm', to, from = 0, length, variant = 'card', notation = 'za' }: RulerProps): string {
  const units = unit === 'in' ? 'inches' : 'centimetres'
  // While a question is answered the words never say where the thing ends: its length is the answer.
  if (variant === 'question') return `A ${thing} above a ruler in ${units}, from 0 to ${to}.`
  return `A ${thing} above a ruler. It starts at ${numberIn(from, notation)} and ends at ${numberIn(from + length, notation)} ${units}, so it is ${numberIn(length, notation)} ${unit} long.`
}

function Thing({ thing, x1, x2 }: { thing: NonNullable<RulerSpec['thing']>; x1: number; x2: number }) {
  const tip = Math.min(24, (x2 - x1) / 2)
  if (thing === 'crayon')
    return (
      <g>
        <rect x={x1} y={22} width={x2 - x1 - tip} height={18} rx={3} fill="#E03C31" stroke={INK} strokeWidth={2} />
        <rect x={x1 + (x2 - x1 - tip) * 0.2} y={22} width={(x2 - x1 - tip) * 0.6} height={18} fill="#F07A70" stroke={INK} strokeWidth={1.2} />
        <polygon points={`${x2 - tip},${24} ${x2},${31} ${x2 - tip},${38}`} fill="#E03C31" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      </g>
    )
  if (thing === 'ribbon') {
    const n = Math.min(8, (x2 - x1) / 4)
    return <polygon points={`${x1},20 ${x2},20 ${x2 - n},31 ${x2},42 ${x1},42 ${x1 + n},31`} fill="#5B7BD5" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
  }
  return (
    <g>
      <rect x={x1} y={20} width={x2 - x1 - tip} height={22} rx={4} fill={GOLD} stroke={INK} strokeWidth={2} />
      <polygon points={`${x2 - tip},20 ${x2},31 ${x2 - tip},42`} fill="#F2D8A7" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <polygon points={`${x2 - 6},28 ${x2},31 ${x2 - 6},34`} fill={INK} stroke={INK} strokeWidth={1} />
    </g>
  )
}

export function Ruler(props: RulerProps) {
  const { thing = 'pencil', unit = 'cm', to, from = 0, length } = props
  const per = (W - 2 * X0) / to
  const steps = unit === 'in' ? 4 : 2
  const x1 = X0 + from * per
  const x2 = X0 + (from + length) * per
  return (
    <Svg width={W} height={RULER_Y + RULER_H + 20} label={describeRuler(props)}>
      <Thing thing={thing} x1={x1} x2={x2} />
      <line x1={x1} y1={44} x2={x1} y2={RULER_Y} stroke={BODY} strokeWidth={1.4} strokeDasharray="3 3" />
      <line x1={x2} y1={thing === 'pencil' ? 35 : 44} x2={x2} y2={RULER_Y} stroke={BODY} strokeWidth={1.4} strokeDasharray="3 3" />
      <rect x={6} y={RULER_Y} width={W - 12} height={RULER_H} rx={6} fill="#FBF6E8" stroke={INK} strokeWidth={2} />
      {Array.from({ length: to * steps + 1 }, (_, k) => {
        const x = X0 + (k * per) / steps
        const whole = k % steps === 0
        const half = !whole && steps === 4 && k % 2 === 0
        return (
          <g key={k}>
            <Line x1={x} y1={RULER_Y} x2={x} y2={RULER_Y + (whole ? 16 : half ? 12 : 8)} w={1.4} />
            {whole ? (
              <T x={x} y={RULER_Y + 40} size={12} weight={600}>
                {String(k / steps)}
              </T>
            ) : null}
          </g>
        )
      })}
      <T x={W - 6} y={RULER_Y + RULER_H + 16} size={11} weight={600} fill={BODY} anchor="end">
        {unit}
      </T>
    </Svg>
  )
}
