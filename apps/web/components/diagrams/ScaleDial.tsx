import type { ScaleDialSpec } from '@jemma/profiling/schemas'
import { numberIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK, Line, Svg, T, WHITE, type Variant } from './shared'

// P190: a kitchen scale, from the "Measuring" board ("How much does the flour weigh?"). The dial runs round three quarters of a circle from 0 to its top number in 20
// steps, with a number every 4 steps, and the red needle points to the reading.

export type ScaleDialProps = ScaleDialSpec & { variant?: Variant; notation?: Notation }

const W = 320
const CX = 160
const CY = 150
const R = 104
const RED = '#E03C31'
const STEPS = 20

const unitWord = (unit: ScaleDialSpec['unit']) => (unit === 'kg' ? 'kilograms' : 'grams')

export function describeScaleDial({ max, value, unit, variant = 'card', notation = 'za' }: ScaleDialProps): string {
  const dial = `A kitchen scale. The dial goes from 0 to ${numberIn(max, notation)} ${unitWord(unit)}.`
  // While a question is answered the words never say where the needle points: the reading is the answer.
  return variant === 'question' ? dial : `${dial} The needle points to ${numberIn(value, notation)} ${unit}.`
}

export function ScaleDial(props: ScaleDialProps) {
  const { max, value, unit, notation = 'za' } = props
  const at = (k: number) => ((-135 + (k * 270) / STEPS) * Math.PI) / 180
  const needle = ((-135 + (value / max) * 270) * Math.PI) / 180
  return (
    <Svg width={W} height={262} label={describeScaleDial(props)}>
      <rect x={40} y={20} width={240} height={26} rx={12} fill="#F2E9D8" stroke={INK} strokeWidth={2} />
      <rect x={56} y={230} width={208} height={24} rx={8} fill="#ECE9E2" stroke={INK} strokeWidth={2} />
      <circle cx={CX} cy={CY} r={R} fill={WHITE} stroke={INK} strokeWidth={3} />
      {Array.from({ length: STEPS + 1 }, (_, k) => {
        const a = at(k)
        const big = k % 4 === 0
        const r1 = R - (big ? 14 : 7)
        return (
          <g key={k}>
            <Line x1={CX + r1 * Math.sin(a)} y1={CY - r1 * Math.cos(a)} x2={CX + (R - 4) * Math.sin(a)} y2={CY - (R - 4) * Math.cos(a)} w={big ? 2 : 1.2} />
            {big ? (
              <T x={CX + (R - 32) * Math.sin(a)} y={CY - (R - 32) * Math.cos(a) + 5} size={13} weight={700}>
                {numberIn((k * max) / STEPS, notation)}
              </T>
            ) : null}
          </g>
        )
      })}
      <line data-needle="" x1={CX} y1={CY} x2={CX + (R - 18) * Math.sin(needle)} y2={CY - (R - 18) * Math.cos(needle)} stroke={RED} strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={7} fill={RED} />
      <T x={CX} y={CY + 46} size={13} weight={700} fill={BODY}>
        {unitWord(unit)}
      </T>
    </Svg>
  )
}
