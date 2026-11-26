import type { ReactNode } from 'react'
import type { CubesSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_SOFT, GOLD_TINT, INK, Line, Svg, type Variant } from './shared'

// P190: a box built from cubes, drawn in 3D, from the "Measuring" board ("This box is made of 1 cm cubes. How many cubes are there?"). The top, the front and the
// side each show their cubes, so the learner counts them by rows and layers.

export type CubesProps = CubesSpec & { variant?: Variant }

const W = 320
const MAX_H = 230
const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)

export function describeCubes({ long, wide, high, variant = 'card' }: CubesProps): string {
  // While a question is answered the words never count the cubes: how many there are is the answer.
  if (variant === 'question') return 'A box built from cubes, drawn in 3D.'
  return `A box built from cubes: ${long} long, ${wide} wide and ${high} high, ${long * wide * high} cubes in all.`
}

export function Cubes(props: CubesProps) {
  const { long, wide, high } = props
  const s = Math.min(34, (W - 20) / ((long + wide) * COS), (MAX_H - 20) / ((long + wide) * SIN + high))
  const cx = s * COS
  const cy = s * SIN
  const ox = W / 2 - ((long - wide) * cx) / 2
  const oy = 10
  const P = (x: number, y: number, z: number): [number, number] => [ox + (x - y) * cx, oy + (x + y) * cy + (high - z) * s]
  const pts = (...ps: [number, number][]) => ps.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')
  const H = Math.ceil(P(long, wide, 0)[1] + 10)
  const lines: ReactNode[] = []
  const seg = (a: [number, number], b: [number, number], key: string) => lines.push(<Line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} w={1} />)
  for (let i = 1; i < long; i++) {
    seg(P(i, 0, high), P(i, wide, high), `ti${i}`)
    seg(P(i, wide, high), P(i, wide, 0), `fi${i}`)
  }
  for (let j = 1; j < wide; j++) {
    seg(P(0, j, high), P(long, j, high), `tj${j}`)
    seg(P(long, j, high), P(long, j, 0), `sj${j}`)
  }
  for (let k = 1; k < high; k++) {
    seg(P(0, wide, k), P(long, wide, k), `fk${k}`)
    seg(P(long, 0, k), P(long, wide, k), `sk${k}`)
  }
  return (
    <Svg width={W} height={H} label={describeCubes(props)}>
      <polygon data-face="top" points={pts(P(0, 0, high), P(long, 0, high), P(long, wide, high), P(0, wide, high))} fill={GOLD_TINT} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <polygon data-face="front" points={pts(P(0, wide, high), P(long, wide, high), P(long, wide, 0), P(0, wide, 0))} fill={GOLD_SOFT} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <polygon data-face="side" points={pts(P(long, 0, high), P(long, wide, high), P(long, wide, 0), P(long, 0, 0))} fill={GOLD} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {lines}
    </Svg>
  )
}
