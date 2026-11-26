import type { CastSpec } from '@jemma/profiling/schemas'
import { GREEN, INK, Svg, T, type Variant } from './shared'

// P196: the CAST quadrants, from the "Grades 10 to 12" board ("θ = 150°. Is sin θ positive or negative?"). The quadrants are named S, A, T and C in green, and the
// angle is a blue arm turned anticlockwise from the positive x-axis, with a red arc and its size.

export type CastProps = CastSpec & { variant?: Variant }

const W = 320
const H = 240
const CX = 160
const CY = 120
const R = 96
const BLUE = '#001489'
const RED = '#E03C31'

const QUADRANT_WORDS = ['the first quadrant, A', 'the second quadrant, S', 'the third quadrant, T', 'the fourth quadrant, C']

export function describeCast({ degrees, label, variant = 'card' }: CastProps): string {
  const angle = label ? label.trim() : `${degrees}°`
  const head = `The four quadrants named S, A, T and C, with S top left, A top right, T bottom left and C bottom right, and an angle of ${angle} drawn from the positive x-axis.`
  // While a question is answered the words never say which quadrant the arm is in: that may be the answer.
  if (variant === 'question') return head
  const q = degrees % 90 === 0 ? null : Math.floor(degrees / 90)
  return q === null ? head : `${head} Its arm is in ${QUADRANT_WORDS[q]}.`
}

export function Cast(props: CastProps) {
  const { degrees, label } = props
  const a = (degrees * Math.PI) / 180
  const r = 30
  const end = { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
  const mid = { x: CX + (r + 18) * Math.cos(a / 2), y: CY - (r + 18) * Math.sin(a / 2) }
  return (
    <Svg width={W} height={H} label={describeCast(props)}>
      <line x1={CX - 130} y1={CY} x2={CX + 130} y2={CY} stroke={INK} strokeWidth={1.6} />
      <line x1={CX} y1={CY - 110} x2={CX} y2={CY + 110} stroke={INK} strokeWidth={1.6} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={INK} strokeWidth={2} />
      {[
        ['S', -62, -50],
        ['A', 62, -50],
        ['T', -62, 72],
        ['C', 62, 72],
      ].map(([letter, dx, dy]) => (
        <T key={letter as string} x={CX + (dx as number)} y={CY + (dy as number)} size={24} weight={700} fill={GREEN}>
          {letter as string}
        </T>
      ))}
      <path data-angle="" d={`M${CX + r},${CY} A${r},${r} 0 ${degrees > 180 ? 1 : 0} 0 ${end.x.toFixed(1)},${end.y.toFixed(1)}`} fill="none" stroke={RED} strokeWidth={2.5} />
      <line data-arm="" x1={CX} y1={CY} x2={CX + R * Math.cos(a)} y2={CY - R * Math.sin(a)} stroke={BLUE} strokeWidth={3} strokeLinecap="round" />
      {/* A white halo keeps the size readable where it crosses an axis. */}
      <text data-size="" x={mid.x} y={mid.y + 5} fontSize={13} fontWeight={700} fill={RED} textAnchor="middle" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">
        {label ? label.trim() : `${degrees}°`}
      </text>
    </Svg>
  )
}
