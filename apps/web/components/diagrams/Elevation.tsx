import type { ElevationSpec } from '@jemma/profiling/schemas'
import { BODY, INK, Svg, T, type Variant } from './shared'

// P196: an angle of elevation in 3D, from the "Grades 10 to 12" board ("From C the angle of elevation of the top of tower AB is 30°. AC = 80 m. How high is the
// tower?"). The tower AB stands on flat ground drawn in perspective; C is on the ground, joined to the top B and, along the ground, to the foot A.

export type ElevationProps = ElevationSpec & { variant?: Variant }

const W = 320
const H = 224
const RED = '#E03C31'

export function describeElevation({ ground, angle, height }: ElevationProps): string {
  return `A vertical tower AB on flat ground. From the point C on the ground, ${ground.trim()} from A, the angle of elevation up to the top B is ${angle.trim()}.${height ? ` The height AB is ${height.trim()}.` : ''}`
}

export function Elevation(props: ElevationProps) {
  const { ground, angle, height } = props
  const A = { x: 220, y: 170 }
  const B = { x: 220, y: 30 }
  const C = { x: 60, y: 168 }
  return (
    <Svg width={W} height={H} label={describeElevation(props)}>
      <polygon points="20,180 220,210 300,150 100,130" fill="#EFF6EE" stroke="#9FBF9F" strokeWidth={1.6} />
      <line data-tower="" x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <line x1={C.x} y1={C.y} x2={B.x} y2={B.y} stroke={INK} strokeWidth={2} />
      <line x1={C.x} y1={C.y} x2={A.x} y2={A.y} stroke={INK} strokeWidth={2} strokeDasharray="6 4" />
      <path d={`M${C.x + 34},${C.y} A34,34 0 0 0 ${C.x + 30},${C.y - 17}`} fill="none" stroke={RED} strokeWidth={2.5} />
      <T x={C.x + 54} y={C.y - 6} size={13} weight={700} fill={RED}>
        {angle.trim()}
      </T>
      <T x={(A.x + C.x) / 2} y={A.y + 22} size={13} weight={700} fill={BODY}>
        {ground.trim()}
      </T>
      {height ? (
        <T x={A.x + 14} y={(A.y + B.y) / 2} size={14} weight={700} fill={RED} anchor="start">
          {height.trim()}
        </T>
      ) : null}
      <T x={A.x + 12} y={A.y + 8} size={14} weight={700} anchor="start">
        A
      </T>
      <T x={B.x + 12} y={B.y + 6} size={14} weight={700} anchor="start">
        B
      </T>
      <T x={C.x - 10} y={C.y + 6} size={14} weight={700} anchor="end">
        C
      </T>
    </Svg>
  )
}
