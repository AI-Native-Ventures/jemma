import type { AngleSpec } from '@jemma/profiling/schemas'
import { angleKind } from '@jemma/profiling/logic'
import { INK, Svg, T, type Variant } from './shared'

// P193: one angle, from the "Angles and transformations" board ("What kind of angle is this?"). One arm points to the right and the other turns anticlockwise to
// the angle; a red arc shows the side it is measured, or a small square for a right angle, the long way round for a reflex angle.

export type AngleProps = AngleSpec & { variant?: Variant }

const W = 300
const RED = '#E03C31'
const ARC = 36

export function describeAngle({ degrees, label, variant = 'card' }: AngleProps): string {
  const marked = label ? ` It is marked ${label.trim()}.` : ''
  // While a question is answered the words never say how big the angle is or what kind: either may be the answer.
  if (variant === 'question') return `An angle between two arms, with an arc on the side it is measured.${marked}`
  return `An angle of ${degrees}°, ${angleKind(degrees) === 'acute' || angleKind(degrees) === 'obtuse' ? 'an' : 'a'} ${angleKind(degrees)} angle.${marked}`
}

export function Angle(props: AngleProps) {
  const { degrees, label } = props
  const reflex = degrees > 180
  const cx = 150
  const cy = reflex ? 100 : 150
  const arm = reflex ? 88 : 125
  const H = reflex ? 196 : 172
  const rad = (d: number) => (d * Math.PI) / 180
  const at = (d: number, r: number) => [cx + r * Math.cos(rad(d)), cy - r * Math.sin(rad(d))] as const
  const [ex, ey] = at(degrees, arm)
  const [ax, ay] = at(degrees, ARC)
  const [lx, ly] = at(degrees / 2, ARC + 22)
  return (
    <Svg width={W} height={H} label={describeAngle(props)}>
      {degrees === 90 ? (
        <path data-right="" d={`M${cx + 16},${cy} L${cx + 16},${cy - 16} L${cx},${cy - 16}`} fill="none" stroke={RED} strokeWidth={2.5} />
      ) : (
        <path data-arc="" d={`M${cx + ARC},${cy} A${ARC},${ARC} 0 ${reflex ? 1 : 0} 0 ${ax.toFixed(1)},${ay.toFixed(1)}`} fill="none" stroke={RED} strokeWidth={2.5} />
      )}
      <line x1={cx} y1={cy} x2={cx + arm + (reflex ? 30 : 10)} y2={cy} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3.5} fill={INK} />
      {label ? (
        <T x={lx} y={ly + 6} size={17} weight={700} fill={RED}>
          {label.trim()}
        </T>
      ) : null}
    </Svg>
  )
}
