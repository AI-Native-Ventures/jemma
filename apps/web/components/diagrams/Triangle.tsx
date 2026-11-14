import type { TriangleSpec } from '@jemma/profiling/schemas'
import { CORAL_TEXT, INK, SOFT, Svg } from './shared'
import { layoutTriangle, rightCorner, triangleAngles } from './triangle-math'

export type TriangleProps = TriangleSpec

const W = 320
const H = 260
/** The room left round the shape for the names and the side labels. */
const BOX = { x0: 76, y0: 48, x1: 244, y1: 208 }
const r1 = (n: number) => Math.round(n * 10) / 10
const text = (list: readonly string[] | undefined, i: number) => list?.[i]?.trim() ?? ''

/** The spoken description: the names, the right angle, and the labels that can be seen. Never an angle or a side that has no label. */
export function describeTriangle(spec: TriangleSpec) {
  const names = [0, 1, 2].map((i) => spec.vertices[i]?.trim() ?? '')
  const right = rightCorner(triangleAngles(spec))
  const parts = [`Triangle ${names.join('')}.`]
  if (right !== null) parts.push(`Right angle at ${names[right]}.`)
  for (let i = 0; i < 3; i++) if (text(spec.angleLabels, i)) parts.push(`Angle ${names[i]} is ${text(spec.angleLabels, i)}.`)
  for (let i = 0; i < 3; i++) if (text(spec.sides, i)) parts.push(`Side ${names[i]}${names[(i + 1) % 3]} is ${text(spec.sides, i)}.`)
  return parts.join(' ')
}

/**
 * A triangle with its corners named. Drawn from the angles when the model gives them (they add up to 180), else with equal sides; scaled to fit.
 * An angle is only written when the model gave a label for it (the angles that draw the shape are never printed: one of them may be the answer).
 * Labels sit outside the edges, the angle labels inside the corners, and a small square marks a right angle.
 */
export function Triangle(props: TriangleProps) {
  const angles = triangleAngles(props)
  const right = rightCorner(angles)
  const l = layoutTriangle(angles, BOX, right)
  return (
    <Svg width={W} height={H} label={describeTriangle(props)}>
      <polygon
        data-shape=""
        points={l.points.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ')}
        fill={SOFT}
        stroke={INK}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      {l.right && <path data-mark="right" data-corner={l.right.at} d={l.right.path} fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />}
      {[0, 1, 2].map((i) => {
        const arc = l.arcs[i]
        return (
          <g key={i}>
            {arc && text(props.angleLabels, i) && <path data-mark="arc" d={arc} fill="none" stroke={CORAL_TEXT} strokeWidth={1.4} strokeLinecap="round" />}
            <text data-vertex={i} x={r1(l.names[i]!.x)} y={r1(l.names[i]!.y + 5)} fontSize={16} fontWeight={700} fill={INK} textAnchor="middle">
              {props.vertices[i] ?? ''}
            </text>
            {text(props.sides, i) && (
              <text data-side={i} x={r1(l.sides[i]!.at.x)} y={r1(l.sides[i]!.at.y + 4)} fontSize={13} fontWeight={600} fill={INK} textAnchor={l.sides[i]!.anchor}>
                {text(props.sides, i)}
              </text>
            )}
            {text(props.angleLabels, i) && (
              <text data-angle={i} x={r1(l.angles[i]!.at.x)} y={r1(l.angles[i]!.at.y + 4)} fontSize={13} fontWeight={700} fill={CORAL_TEXT} textAnchor="middle">
                {text(props.angleLabels, i)}
              </text>
            )}
          </g>
        )
      })}
    </Svg>
  )
}
