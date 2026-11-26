import type { FractionCircleSpec } from '@jemma/profiling/schemas'
import { GOLD, INK, Svg, WHITE, type Variant } from './shared'

// P189: fraction circles to read, from the "Calculating and fractions" board ("What fraction of the circle is gold?"). Each circle is cut into equal slices from
// the top, going round clockwise, and the gold slices fill one circle before the next (two or three circles for a mixed number).

export type FractionCircleProps = FractionCircleSpec & { variant?: Variant }

const W = 300
const GAP = 16

export function describeFractionCircle({ parts, shaded, circles = 1, variant = 'card' }: FractionCircleProps): string {
  const what = circles === 1 ? 'A circle cut into' : `${circles} circles, each cut into`
  const total = parts * circles
  // While a question is answered the words never count the slices: the fraction is the answer.
  if (variant === 'question') {
    const gold = shaded === 0 ? '' : shaded === total ? ' All the parts are gold.' : ' Some parts are gold.'
    return `${what} equal parts.${gold}`
  }
  return `${what} ${parts} equal parts. ${shaded} ${shaded === 1 ? 'part is' : 'parts are'} gold.`
}

/** One slice of a circle, from `a1` to `a2` degrees, measured clockwise from the top. */
function slice(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const point = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180
    return `${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`
  }
  return `M${cx},${cy} L${point(a1)} A${r},${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${point(a2)} Z`
}

export function FractionCircle(props: FractionCircleProps) {
  const { parts, shaded, circles = 1 } = props
  const r = Math.min(96, (W - (circles - 1) * GAP) / circles / 2 - 4)
  const across = circles * 2 * r + (circles - 1) * GAP
  const left = (W - across) / 2
  const H = 2 * r + 16
  return (
    <Svg width={W} height={H} label={describeFractionCircle(props)}>
      {Array.from({ length: circles }, (_, c) => {
        const cx = left + r + c * (2 * r + GAP)
        const cy = r + 8
        return (
          <g key={c} data-circle={c + 1}>
            {Array.from({ length: parts }, (_, k) => {
              const on = c * parts + k < shaded
              return <path key={k} data-part="" data-shaded={on ? '1' : '0'} d={slice(cx, cy, r, (k * 360) / parts, ((k + 1) * 360) / parts)} fill={on ? GOLD : WHITE} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
            })}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={3} />
          </g>
        )
      })}
    </Svg>
  )
}
