import type { ParallelLinesSpec } from '@jemma/profiling/schemas'
import { cornerAngle, labelDegrees } from '@jemma/profiling/logic'
import { BODY, INK, Svg, T, type Variant } from './shared'

// P193: two parallel lines cut by a slanted line, from the "Angles and transformations" board ("AB ∥ CD. Find x."). The arrows on AB and CD say they are parallel;
// the slanted line really makes its angle with them, so the picture matches the numbers. Each mark is a red arc in a corner of a crossing, with its label.

export type ParallelLinesProps = ParallelLinesSpec & { variant?: Variant }

const W = 320
const H = 210
const AB = 60
const CD = 150
const RED = '#E03C31'

const CORNER_WORDS: Record<ParallelLinesSpec['marks'][number]['corner'], string> = {
  above_right: 'above the line and to the right of the crossing',
  above_left: 'above the line and to the left of the crossing',
  below_left: 'below the line and to the left of the crossing',
  below_right: 'below the line and to the right of the crossing',
}

/** Where a corner starts and ends, in degrees anticlockwise from the right. */
const SPAN: Record<ParallelLinesSpec['marks'][number]['corner'], (a: number) => [number, number]> = {
  above_right: (a) => [0, a],
  above_left: (a) => [a, 180],
  below_left: () => [180, 0],
  below_right: (a) => [180 + a, 360],
}

const sayList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join('; ')} and ${items[items.length - 1]}` : (items[0] ?? ''))

export function describeParallelLines({ acute, marks, variant = 'card' }: ParallelLinesProps): string {
  const said = marks.map((m) => `${labelDegrees(m.label) === null ? m.label.trim() : `${labelDegrees(m.label)}°`} is ${CORNER_WORDS[m.corner]} at ${m.line}`)
  const head = `Two parallel lines AB and CD cut by a slanted line. ${sayList(said)}.`
  // While a question is answered the words never say what a letter stands for: it is the answer.
  if (variant === 'question') return head
  const letters = marks.filter((m) => labelDegrees(m.label) === null).map((m) => `${m.label.trim()} is ${cornerAngle(acute, m.corner)}°`)
  return letters.length ? `${head} ${sayList(letters)}.` : head
}

export function ParallelLines(props: ParallelLinesProps) {
  const { acute, marks } = props
  const rad = (d: number) => (d * Math.PI) / 180
  // The two crossings sit either side of the middle, so the slanted line stays on the picture.
  const offset = (CD - AB) / Math.tan(rad(acute))
  const crossAB = 160 + offset / 2
  const crossCD = 160 - offset / 2
  const X = (y: number) => crossAB - (y - AB) / Math.tan(rad(acute))
  return (
    <Svg width={W} height={H} label={describeParallelLines(props)}>
      <line x1={10} y1={AB} x2={310} y2={AB} stroke={INK} strokeWidth={2.5} />
      <line x1={10} y1={CD} x2={310} y2={CD} stroke={INK} strokeWidth={2.5} />
      <path d={`M276,${AB - 6} l8,6 l-8,6`} fill="none" stroke={INK} strokeWidth={2} />
      <path d={`M276,${CD - 6} l8,6 l-8,6`} fill="none" stroke={INK} strokeWidth={2} />
      <line x1={X(8)} y1={8} x2={X(202)} y2={202} stroke={INK} strokeWidth={2.5} />
      {marks.map((m, i) => {
        const cx = m.line === 'AB' ? crossAB : crossCD
        const cy = m.line === 'AB' ? AB : CD
        const span = SPAN[m.corner](acute)
        const from = span[0]
        const to = m.corner === 'below_left' ? 180 + acute : span[1]
        const p = (d: number, r: number) => [cx + r * Math.cos(rad(d)), cy - r * Math.sin(rad(d))] as const
        const [x1, y1] = p(from, 22)
        const [x2, y2] = p(to, 22)
        // A narrow corner has its label further out, so it sits clear of the two lines.
        const [lx, ly] = p((from + to) / 2, Math.min(58, Math.max(36, 17 / Math.sin(rad((to - from) / 2)))))
        const letter = labelDegrees(m.label) === null
        return (
          <g key={i} data-mark={m.label.trim()}>
            <path d={`M${x1.toFixed(1)},${y1.toFixed(1)} A22,22 0 ${to - from > 180 ? 1 : 0} 0 ${x2.toFixed(1)},${y2.toFixed(1)}`} fill="none" stroke={RED} strokeWidth={2} />
            <T x={lx} y={ly + 6} size={letter ? 17 : 15} weight={700} fill={RED}>
              {letter ? m.label.trim() : `${labelDegrees(m.label)}°`}
            </T>
          </g>
        )
      })}
      <T x={16} y={AB - 8} size={14} weight={700} fill={BODY}>
        A
      </T>
      <T x={302} y={AB - 8} size={14} weight={700} fill={BODY}>
        B
      </T>
      <T x={16} y={CD - 8} size={14} weight={700} fill={BODY}>
        C
      </T>
      <T x={302} y={CD - 8} size={14} weight={700} fill={BODY}>
        D
      </T>
    </Svg>
  )
}
