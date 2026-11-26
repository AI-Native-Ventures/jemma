import type { EnlargementSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GOLD_TINT, INK, Svg, T, type Variant } from './shared'

// P193: a shape and its enlargement on a grid of squares, from the "Angles and transformations" board ("What is the scale factor?"). The small shape is gold and
// the big one pale gold beside it, both on the same squares, so the learner counts how many times bigger each side is.

export type EnlargementProps = EnlargementSpec & { variant?: Variant }

const W = 300
const GRID = '#E1DDD4'

export function describeEnlargement({ shape, w, h, factor, sizes = false, variant = 'card' }: EnlargementProps): string {
  const name = shape === 'rectangle' ? 'rectangle' : 'right triangle'
  const both =
    shape === 'rectangle'
      ? `the small one is ${w} by ${h} squares and the big one ${w * factor} by ${h * factor}`
      : `the small one is ${w} squares wide and ${h} tall, and the big one ${w * factor} wide and ${h * factor} tall`
  const head = `A small ${name} and a big ${name} on a grid of squares`
  // While a question is answered the words never say how many times bigger: it is the answer.
  if (variant === 'question') return sizes ? `${head}: ${both}.` : `${head}.`
  return `${head}: ${both}, ${factor} times as big.`
}

export function Enlargement(props: EnlargementProps) {
  const { shape, w, h, factor, sizes = false } = props
  const cols = w + w * factor + 3
  const rows = h * factor + 2 + (sizes ? 1 : 0)
  const s = Math.min(22, (W - 4) / cols, 200 / rows)
  const x0 = (W - cols * s) / 2
  const y0 = 2
  const draw = (gx: number, gw: number, gh: number, fill: string, key: string) => {
    const x = x0 + gx * s
    const y = y0 + s
    return shape === 'rectangle' ? (
      <rect key={key} data-shape={key} x={x} y={y} width={gw * s} height={gh * s} fill={fill} stroke={INK} strokeWidth={2} />
    ) : (
      <polygon key={key} data-shape={key} points={`${x},${y + gh * s} ${x + gw * s},${y + gh * s} ${x},${y}`} fill={fill} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
    )
  }
  const label = (gx: number, gw: number, gh: number, k: number) =>
    sizes ? (
      <T key={`l${k}`} x={x0 + (gx + gw / 2) * s} y={y0 + (gh + 2) * s - 4} size={12} weight={700} fill={BODY}>
        {shape === 'rectangle' ? `${w * k} by ${h * k}` : `${w * k} wide, ${h * k} tall`}
      </T>
    ) : null
  return (
    <Svg width={W} height={y0 * 2 + rows * s} label={describeEnlargement(props)}>
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`v${i}`} x1={x0 + i * s} y1={y0} x2={x0 + i * s} y2={y0 + rows * s} stroke={GRID} strokeWidth={1} />
      ))}
      {Array.from({ length: rows + 1 }, (_, j) => (
        <line key={`h${j}`} x1={x0} y1={y0 + j * s} x2={x0 + cols * s} y2={y0 + j * s} stroke={GRID} strokeWidth={1} />
      ))}
      {draw(1, w, h, GOLD, 'small')}
      {draw(w + 2, w * factor, h * factor, GOLD_TINT, 'big')}
      {label(1, w, h, 1)}
      {label(w + 2, w * factor, h * factor, factor)}
    </Svg>
  )
}
