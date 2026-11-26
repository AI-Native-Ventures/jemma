import type { JugSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK, Line, Svg, T, WHITE, type Variant } from './shared'

// P190: a measuring jug, from the "Measuring" board ("How much water is in the jug?"). The jug is marked from 0 to its top number in 10 steps, with a number every
// 2 steps, and the water comes up to the reading.

export type JugProps = JugSpec & { variant?: Variant; notation?: Notation }

const W = 300
const BOTTOM = 262
const TALL = 220
const BLUE = '#001489'
const WATER = '#CFE0FF'
const STEPS = 10

const unitWord = (unit: JugSpec['unit']) => (unit === 'l' ? 'litres' : 'millilitres')

export function describeJug({ max, value, unit, variant = 'card', notation = 'za' }: JugProps): string {
  const jug = `A measuring jug marked in ${unitWord(unit)} up to ${numberIn(max, notation)}.`
  // While a question is answered the words never say where the water is: the reading is the answer.
  return variant === 'question' ? jug : `${jug} The water is at ${numberIn(value, notation)} ${unit}.`
}

export function Jug(props: JugProps) {
  const { max, value, unit, notation = 'za' } = props
  const level = BOTTOM - (value / max) * TALL
  // The sides lean in by 8 towards the bottom.
  const leftAt = (y: number) => 70 + ((y - 30) / 220) * 8
  const rightAt = (y: number) => 230 - ((y - 30) / 220) * 8
  return (
    <Svg width={W} height={270} label={describeJug(props)}>
      <path d={`M70,30 L230,30 L222,250 Q220,262 208,262 L92,262 Q80,262 78,250 Z`} fill={WHITE} stroke={INK} strokeWidth={3} />
      <path data-water="" d={`M${leftAt(level)},${level} L${rightAt(level)},${level} L222,250 Q220,262 208,262 L92,262 Q80,262 78,250 Z`} fill={WATER} />
      <path d="M230,60 Q290,70 284,130 Q280,180 226,190" fill="none" stroke={INK} strokeWidth={3} />
      {Array.from({ length: STEPS }, (_, i) => {
        const k = i + 1
        const y = BOTTOM - (k * TALL) / STEPS
        const big = k % 2 === 0
        return (
          <g key={k}>
            <Line x1={leftAt(y) + 2} y1={y} x2={leftAt(y) + (big ? 30 : 18)} y2={y} w={1.6} />
            {big ? (
              <T x={leftAt(y) + 38} y={y + 5} size={13} weight={700} anchor="start">
                {numberIn((k * max) / STEPS, notation)}
              </T>
            ) : null}
          </g>
        )
      })}
      <Line x1={leftAt(level)} y1={level} x2={rightAt(level)} y2={level} stroke={BLUE} w={2.5} />
      <path d={`M70,30 L230,30 L222,250 Q220,262 208,262 L92,262 Q80,262 78,250 Z`} fill="none" stroke={INK} strokeWidth={3} />
      <T x={180} y={252} size={13} weight={700} fill={BODY}>
        {unit}
      </T>
    </Svg>
  )
}
