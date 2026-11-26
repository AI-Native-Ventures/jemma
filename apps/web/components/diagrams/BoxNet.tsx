import type { BoxNetSpec } from '@jemma/profiling/schemas'
import { GOLD_TINT, INK, Svg, T, WHITE, type Variant } from './shared'

// P190: the net of a box, from the "Measuring" board ("This is the net of a box. What is its surface area?"). Six rectangles drawn to scale: a column of four
// (an end, the bottom, the other end, the top) with a side on each side of the bottom, which is gold. Each size is written on an edge it measures.

export type BoxNetProps = BoxNetSpec & { variant?: Variant }

const W = 320
const MAX_H = 300

export function describeBoxNet({ long, wide, high, unit = 'cm' }: BoxNetProps): string {
  return `The net of a box: six rectangles drawn to scale. The box is ${long} ${unit} long, ${wide} ${unit} wide and ${high} ${unit} high.`
}

export function BoxNet(props: BoxNetProps) {
  const { long, wide, high, unit = 'cm' } = props
  // Room round the net for the three sizes: 44 to the left and right, 26 at the top.
  const u = Math.min(28, (W - 88) / (long + 2 * high), (MAX_H - 36) / (2 * high + 2 * wide))
  const netW = (long + 2 * high) * u
  const x0 = (W - netW) / 2 + high * u
  const y0 = 26 + high * u
  // [x, y, w, h] in units, from the top left corner of the bottom.
  const faces: [number, number, number, number][] = [
    [0, -high, long, high],
    [0, 0, long, wide],
    [0, wide, long, high],
    [0, wide + high, long, wide],
    [-high, 0, high, wide],
    [long, 0, high, wide],
  ]
  const H = y0 + (wide + high + wide) * u + 10
  return (
    <Svg width={W} height={H} label={describeBoxNet(props)}>
      {faces.map(([x, y, w, h], i) => (
        <rect key={i} data-face={i + 1} x={x0 + x * u} y={y0 + y * u} width={w * u} height={h * u} fill={i === 1 ? GOLD_TINT : WHITE} stroke={INK} strokeWidth={2} />
      ))}
      <T x={x0 + (long * u) / 2} y={y0 - high * u - 8} size={13} weight={700}>
        {`${long} ${unit}`}
      </T>
      <T x={x0 + (long + high) * u + 6} y={y0 + (wide * u) / 2 + 5} size={13} weight={700} anchor="start">
        {`${wide} ${unit}`}
      </T>
      <T x={x0 - 6} y={y0 - (high * u) / 2 + 5} size={13} weight={700} anchor="end">
        {`${high} ${unit}`}
      </T>
    </Svg>
  )
}
