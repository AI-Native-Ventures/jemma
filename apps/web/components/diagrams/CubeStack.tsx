import type { CubeStackSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_SOFT, GOLD_TINT, INK, Svg, type Variant } from './shared'

// P192: a shape built from cubes, drawn in 3D, from the "Shapes and position" board ("Which picture shows the view from the top?"). The rows stand one behind the
// other, from the back to the front, and the cubes are drawn from the back so the nearer ones hide the ones behind them.

export type CubeStackProps = CubeStackSpec & { variant?: Variant }

const W = 300
const MAX_H = 190
const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)

export function describeCubeStack({ heights, variant = 'card' }: CubeStackProps): string {
  // While a question is answered the words never count the cubes: how many there are, or how the shape looks from a side, may be the answer.
  if (variant === 'question') return 'A shape built from cubes, drawn in 3D.'
  const n = heights.flat().reduce((a, h) => a + h, 0)
  return `A shape built from ${n} ${n === 1 ? 'cube' : 'cubes'}, drawn in 3D.`
}

export function CubeStack(props: CubeStackProps) {
  const { heights } = props
  const rows = heights.length
  const cols = heights[0]!.length
  const tall = Math.max(...heights.flat())
  const s = Math.min(40, (W - 20) / ((cols + rows) * COS), (MAX_H - 20) / ((cols + rows) * SIN + tall))
  const cx = s * COS
  const cy = s * SIN
  const ox = W / 2 - ((cols - rows) * cx) / 2
  const oy = 10
  const P = (x: number, y: number, z: number): string => `${(ox + (x - y) * cx).toFixed(1)},${(oy + (x + y) * cy + (tall - z) * s).toFixed(1)}`
  // Every cube, from the back: by how far it is from the back left corner, then from the bottom up.
  const cubes = heights.flatMap((row, y) => row.flatMap((h, x) => Array.from({ length: h }, (_, z) => ({ x, y, z })))).sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z)
  const H = Math.ceil(oy + (cols + rows) * cy + tall * s + 10)
  return (
    <Svg width={W} height={H} label={describeCubeStack(props)}>
      {cubes.map(({ x, y, z }) => (
        <g key={`${x}.${y}.${z}`} data-cube="">
          <polygon points={`${P(x, y, z + 1)} ${P(x + 1, y, z + 1)} ${P(x + 1, y + 1, z + 1)} ${P(x, y + 1, z + 1)}`} fill={GOLD_TINT} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <polygon points={`${P(x, y + 1, z + 1)} ${P(x + 1, y + 1, z + 1)} ${P(x + 1, y + 1, z)} ${P(x, y + 1, z)}`} fill={GOLD_SOFT} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <polygon points={`${P(x + 1, y, z + 1)} ${P(x + 1, y + 1, z + 1)} ${P(x + 1, y + 1, z)} ${P(x + 1, y, z)}`} fill={GOLD} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      ))}
    </Svg>
  )
}
