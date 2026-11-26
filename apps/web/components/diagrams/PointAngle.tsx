import type { PointAngleSpec } from '@jemma/profiling/schemas'
import { pointIn, type Notation } from '@jemma/profiling/logic'
import { BODY, INK, Svg, T, type Variant } from './shared'

// P195: a point and its angle, from the "Grades 10 to 12" board ("P(−3 ; 4) is on the arm of θ. Find sin θ."). The point is joined to the origin, the angle θ from
// the positive x-axis to that arm is a red arc, and a dashed line drops from the point to the x-axis, so the right triangle shows.

export type PointAngleProps = PointAngleSpec & { variant?: Variant; notation?: Notation }

const W = 320
const H = 240
const STEP = 28
const BLUE = '#001489'
const RED = '#E03C31'

const signed = (v: number) => (v < 0 ? `−${-v}` : String(v))

export function describePointAngle({ x, y, name = 'P', variant = 'card', notation = 'za' }: PointAngleProps): string {
  const point = `${name}${pointIn(signed(x), signed(y), notation)}`
  const head = `The point ${point} joined to the origin, with the angle θ from the positive x-axis to the line marked, and a dashed line from ${name} down to the x-axis.`
  if (variant === 'question') return head
  const r = Math.hypot(x, y)
  return `${head} ${name} is ${Number.isInteger(r) ? r : `the square root of ${x * x + y * y}`} from the origin.`
}

export function PointAngle(props: PointAngleProps) {
  const { x, y, name = 'P', notation = 'za' } = props
  // The origin sits so that the point is on the picture, whichever quadrant it is in.
  const ox = x < 0 ? W - 70 : 70 + (x === 0 ? 90 : 0)
  const oy = y < 0 ? 50 : H - 40
  const px = ox + x * STEP
  const py = oy - y * STEP
  const a = Math.atan2(y, x)
  const angle = a < 0 ? a + 2 * Math.PI : a
  const r = 26
  const end = { x: ox + r * Math.cos(angle), y: oy - r * Math.sin(angle) }
  const mid = { x: ox + (r + 14) * Math.cos(angle / 2), y: oy - (r + 14) * Math.sin(angle / 2) }
  return (
    <Svg width={W} height={H} label={describePointAngle(props)}>
      <line x1={10} y1={oy} x2={W - 10} y2={oy} stroke={INK} strokeWidth={1.6} />
      <line x1={ox} y1={10} x2={ox} y2={H - 10} stroke={INK} strokeWidth={1.6} />
      <text x={W - 12} y={oy - 6} fontSize={14} fontStyle="italic" fontWeight={600} fill={INK} textAnchor="end">
        x
      </text>
      <text x={ox + 8} y={20} fontSize={14} fontStyle="italic" fontWeight={600} fill={INK}>
        y
      </text>
      <line data-drop="" x1={px} y1={py} x2={px} y2={oy} stroke={BODY} strokeWidth={1.6} strokeDasharray="5 4" />
      <path data-angle="" d={`M${ox + r},${oy} A${r},${r} 0 ${angle > Math.PI ? 1 : 0} 0 ${end.x.toFixed(1)},${end.y.toFixed(1)}`} fill="none" stroke={RED} strokeWidth={2.5} />
      <line x1={ox} y1={oy} x2={px} y2={py} stroke={BLUE} strokeWidth={3} strokeLinecap="round" />
      <circle cx={px} cy={py} r={5} fill={BLUE} />
      <T x={px + (x < 0 ? -8 : 8)} y={py + (y < 0 ? 20 : -10)} size={13} weight={700} fill={BLUE} anchor={x < 0 ? 'end' : 'start'}>
        {`${name}${pointIn(signed(x), signed(y), notation)}`}
      </T>
      <T x={mid.x} y={mid.y + 5} size={15} weight={700} fill={RED}>
        θ
      </T>
    </Svg>
  )
}
