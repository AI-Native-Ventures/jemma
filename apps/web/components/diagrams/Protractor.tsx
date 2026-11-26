import type { ProtractorSpec } from '@jemma/profiling/schemas'
import { INK, Svg, T, type Variant } from './shared'

// P193: a protractor over an angle, from the "Angles and transformations" board ("How big is the angle?"). One arm lies on 0, on the right, and the other crosses
// the scale at the reading. The scale has a mark every 5 degrees, a longer one every 10 and a number every 30.

export type ProtractorProps = ProtractorSpec & { variant?: Variant }

const W = 320
const CX = 160
const CY = 180
const R = 140
const BLUE = '#001489'

export function describeProtractor({ degrees, variant = 'card' }: ProtractorProps): string {
  const head = 'A protractor over an angle. One arm is on 0.'
  // While a question is answered the words never say where the other arm crosses: it is the answer.
  return variant === 'question' ? head : `${head} The other arm crosses the scale at ${degrees}.`
}

export function Protractor(props: ProtractorProps) {
  const rad = (d: number) => (d * Math.PI) / 180
  const a = rad(props.degrees)
  return (
    <Svg width={W} height={196} label={describeProtractor(props)}>
      <path d={`M${CX - R},${CY} A${R},${R} 0 0 1 ${CX + R},${CY} Z`} fill="#EAF2FF" stroke={BLUE} strokeWidth={2} />
      {Array.from({ length: 37 }, (_, i) => {
        const d = i * 5
        const r1 = R - (d % 10 === 0 ? 14 : 7)
        return (
          <g key={d}>
            <line x1={CX + r1 * Math.cos(rad(d))} y1={CY - r1 * Math.sin(rad(d))} x2={CX + R * Math.cos(rad(d))} y2={CY - R * Math.sin(rad(d))} stroke={BLUE} strokeWidth={1.2} />
            {d % 30 === 0 ? (
              <T x={CX + (R - 28) * Math.cos(rad(d))} y={CY - (R - 28) * Math.sin(rad(d)) + 4 - (d === 0 || d === 180 ? 10 : 0)} size={11} weight={700} fill={BLUE}>
                {String(d)}
              </T>
            ) : null}
          </g>
        )
      })}
      <line x1={CX} y1={CY} x2={CX + R + 10} y2={CY} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <line data-arm="" x1={CX} y1={CY} x2={CX + (R + 10) * Math.cos(a)} y2={CY - (R + 10) * Math.sin(a)} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={4} fill={INK} />
    </Svg>
  )
}
