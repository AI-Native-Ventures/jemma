import type { CircleAnglesSpec } from '@jemma/profiling/schemas'
import { INK, Svg, T, WHITE, type Variant } from './shared'

// P196: angles in a circle, from the "Grades 10 to 12" board ("O is the centre. Find x and give the reason."). A and B are low on the circle, C at the top; OA and
// OB meet at the centre O, CA and CB at C, both standing on the arc AB. The angle the question asks for is the letter x, in red; the other has its size.

export type CircleAnglesProps = CircleAnglesSpec & { variant?: Variant }

const W = 320
const H = 236
const CX = 160
const CY = 120
const R = 96
const RED = '#E03C31'

export function describeCircleAngles({ centre, ask, variant = 'card' }: CircleAnglesProps): string {
  const head = `A circle with centre O. A, B and C are on the circle. ${ask === 'centre' ? 'The angle AOB at the centre is x' : `The angle AOB at the centre is ${centre}°`}; ${ask === 'circle' ? 'the angle ACB at C is x' : `the angle ACB at C is ${centre / 2}°`}.`
  // While a question is answered the words never say what x is: it is the answer.
  return variant === 'question' ? head : `${head} x is ${ask === 'circle' ? centre / 2 : centre}°.`
}

export function CircleAngles(props: CircleAnglesProps) {
  const { centre, ask } = props
  const at = (deg: number) => [CX + R * Math.cos((deg * Math.PI) / 180), CY - R * Math.sin((deg * Math.PI) / 180)] as const
  const [ax, ay] = at(270 - centre / 2)
  const [bx, by] = at(270 + centre / 2)
  const [cx, cy] = at(95)
  const centreText = ask === 'centre' ? 'x' : `${centre}°`
  const circleText = ask === 'circle' ? 'x' : `${centre / 2}°`
  return (
    <Svg width={W} height={H} label={describeCircleAngles(props)}>
      <circle cx={CX} cy={CY} r={R} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      <line x1={ax} y1={ay} x2={CX} y2={CY} stroke={INK} strokeWidth={2} />
      <line x1={bx} y1={by} x2={CX} y2={CY} stroke={INK} strokeWidth={2} />
      <line x1={ax} y1={ay} x2={cx} y2={cy} stroke={INK} strokeWidth={2} />
      <line x1={bx} y1={by} x2={cx} y2={cy} stroke={INK} strokeWidth={2} />
      <circle cx={CX} cy={CY} r={4} fill={INK} />
      <T x={CX + 10} y={CY - 8} size={14} weight={700} anchor="start">
        O
      </T>
      <T x={ax - 12} y={ay + 14} size={14} weight={700}>
        A
      </T>
      <T x={bx + 12} y={by + 14} size={14} weight={700}>
        B
      </T>
      <T x={cx} y={cy - 10} size={14} weight={700}>
        C
      </T>
      <g data-centre-angle={centreText}>
        <T x={CX} y={CY + 30} size={ask === 'centre' ? 16 : 14} weight={700} fill={RED}>
          {centreText}
        </T>
      </g>
      <g data-circle-angle={circleText}>
        <T x={cx} y={cy + 36} size={ask === 'circle' ? 16 : 14} weight={700} fill={RED}>
          {circleText}
        </T>
      </g>
    </Svg>
  )
}
