import type { TenFrameSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_TINT, INK, Line, Svg, T, WHITE, type Variant } from './shared'

// P188: a ten-frame (two for twenty) with counters in some boxes, from the "Counting and place value" board ("7 and how many more make 10?"). The counters fill the
// top row first, from the left. A number bond under it, when the question has one: the whole in a circle on top, one part below it, and a gold blank for the other.

export type TenFrameProps = TenFrameSpec & { variant?: Variant }

const CELL = 50
const X0 = 10
const FRAME_H = CELL * 2
const GAP = 14

export function describeTenFrame({ frames = 1, filled, bond, variant = 'card' }: TenFrameProps): string {
  const what = frames === 2 ? 'Two ten-frames' : 'A ten-frame'
  // While a question is answered the words never count the counters: how many there are may be the answer.
  const counters = variant === 'question' ? ' with counters in some boxes.' : ` with ${filled} ${filled === 1 ? 'counter' : 'counters'} and ${frames * 10 - filled} empty boxes.`
  const bondWords = bond ? (variant === 'question' ? ' A number bond: a whole at the top, one part and a blank below.' : ` A number bond: ${bond.whole} at the top, ${bond.part} and a blank below.`) : ''
  return `${what}${counters}${bondWords}`
}

export function TenFrame(props: TenFrameProps) {
  const { frames = 1, filled, bond } = props
  const framesH = frames * FRAME_H + (frames - 1) * GAP
  const bondTop = framesH + 22
  const H = bond ? bondTop + 116 : framesH + 20
  const W = X0 * 2 + CELL * 5
  return (
    <Svg width={W} height={H} label={describeTenFrame(props)}>
      {Array.from({ length: frames }, (_, f) => {
        const y0 = 10 + f * (FRAME_H + GAP)
        return (
          <g key={f} data-frame={f + 1}>
            <rect x={X0} y={y0} width={CELL * 5} height={FRAME_H} rx={6} fill={WHITE} stroke={INK} strokeWidth={2.5} />
            {[1, 2, 3, 4].map((i) => (
              <Line key={i} x1={X0 + i * CELL} y1={y0} x2={X0 + i * CELL} y2={y0 + FRAME_H} w={1.6} />
            ))}
            <Line x1={X0} y1={y0 + CELL} x2={X0 + CELL * 5} y2={y0 + CELL} w={1.6} />
            {Array.from({ length: 10 }, (_, k) => k + f * 10 < filled).map((on, k) =>
              on ? <circle key={k} data-counter="" cx={X0 + (k % 5) * CELL + CELL / 2} cy={y0 + Math.floor(k / 5) * CELL + CELL / 2} r={17} fill={GOLD} stroke={INK} strokeWidth={2} /> : null,
            )}
          </g>
        )
      })}
      {bond ? (
        <g data-bond="">
          <Line x1={W / 2} y1={bondTop + 24} x2={W / 2 - 50} y2={bondTop + 78} w={2} />
          <Line x1={W / 2} y1={bondTop + 24} x2={W / 2 + 50} y2={bondTop + 78} w={2} />
          <circle cx={W / 2} cy={bondTop + 14} r={24} fill={GOLD_TINT} stroke={INK} strokeWidth={2} />
          <T x={W / 2} y={bondTop + 22} size={22} weight={700}>
            {String(bond.whole)}
          </T>
          <circle cx={W / 2 - 50} cy={bondTop + 88} r={24} fill={WHITE} stroke={INK} strokeWidth={2} />
          <T x={W / 2 - 50} y={bondTop + 96} size={22} weight={700}>
            {String(bond.part)}
          </T>
          <circle cx={W / 2 + 50} cy={bondTop + 88} r={24} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2.5} />
          <T x={W / 2 + 50} y={bondTop + 96} size={22} weight={700}>
            ?
          </T>
        </g>
      ) : null}
    </Svg>
  )
}
