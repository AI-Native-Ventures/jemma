import type { ReactNode } from 'react'
import type { TilePatternSpec } from '@jemma/profiling/schemas'
import { tilesOf } from '@jemma/profiling/logic'
import { BODY, GOLD, INK, Svg, T, type Variant } from './shared'

// P191: a growing pattern of tiles, from the "Patterns, algebra and graphs" board ("How many tiles are in pattern 5?"). The patterns stand side by side on one line,
// each named under it, so the learner sees what is added each time.

export type TilePatternProps = TilePatternSpec & { variant?: Variant }

const W = 320
const GAP = 20
const MAX_TILES_H = 140

const SHAPE_WORDS: Record<TilePatternSpec['shape'], string> = {
  row: 'in a row',
  L: 'in the shape of an L',
  T: 'in the shape of a T',
  cross: 'in the shape of a cross',
  square: 'in squares',
  rectangle: 'in rectangles',
  stairs: 'in steps',
}

export function describeTilePattern({ shape, from = 1, show }: TilePatternProps): string {
  const counts = Array.from({ length: show }, (_, i) => tilesOf(shape, from + i).length)
  const said = counts.map((c, i) => (i === 0 ? `pattern ${from} has ${c} ${c === 1 ? 'tile' : 'tiles'}` : `pattern ${from + i} has ${c}`))
  const list = `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`
  return `A growing pattern of tiles: ${list}, ${SHAPE_WORDS[shape]}.`
}

export function TilePattern(props: TilePatternProps) {
  const { shape, from = 1, show } = props
  const patterns = Array.from({ length: show }, (_, i) => tilesOf(shape, from + i))
  const sizeOf = (cells: [number, number][]) => ({ cols: Math.max(...cells.map(([c]) => c)) + 1, rows: Math.max(...cells.map(([, r]) => r)) + 1 })
  const sizes = patterns.map(sizeOf)
  const slot = (W - 12 - (show - 1) * GAP) / show
  const s = Math.min(22, slot / Math.max(...sizes.map((z) => z.cols)), MAX_TILES_H / Math.max(...sizes.map((z) => z.rows)))
  const tallest = Math.max(...sizes.map((z) => z.rows)) * s
  const top = 12
  const out: ReactNode[] = []
  patterns.forEach((cells, p) => {
    const { cols, rows } = sizes[p]!
    const left = 6 + p * (slot + GAP) + (slot - cols * s) / 2
    const base = top + tallest - rows * s
    out.push(
      <g key={p} data-pattern={from + p}>
        {cells.map(([c, r], k) => (
          <rect key={k} data-tile="" x={left + c * s} y={base + r * s} width={s} height={s} fill={GOLD} stroke={INK} strokeWidth={1.6} />
        ))}
        <T x={6 + p * (slot + GAP) + slot / 2} y={top + tallest + 24} size={13} weight={700} fill={BODY}>
          {`Pattern ${from + p}`}
        </T>
      </g>,
    )
  })
  return (
    <Svg width={W} height={top + tallest + 34} label={describeTilePattern(props)}>
      {out}
    </Svg>
  )
}
