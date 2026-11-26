import type { ReactNode } from 'react'
import type { MapGridSpec } from '@jemma/profiling/schemas'
import { placeMarks } from '@jemma/profiling/logic'
import { BODY, INK, Svg, T, WHITE, type Variant } from './shared'

// P192: a map on a grid of squares, from the "Shapes and position" board ("Start at the house. Go 3 squares right and 2 squares up. Where are you?"). Each place is
// marked with its first letter in a square of its own colour and named under the map; a house is drawn as a house.

export type MapGridProps = MapGridSpec & { variant?: Variant }

const W = 300
const RED = '#E03C31'
const LOOKS = [
  { fill: '#D8EFE3', edge: '#007749' },
  { fill: '#FFEDC6', edge: '#B7791F' },
  { fill: '#DCE3F5', edge: '#001489' },
  { fill: '#FBE0DD', edge: '#B8281E' },
  { fill: '#EDE4F5', edge: '#6B3FA0' },
  { fill: '#E6EDE0', edge: '#4F6F52' },
]

const sayList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''))
const theName = (p: MapGridSpec['places'][number]) => `the ${p.house ? 'house' : p.name.trim().toLowerCase()}`

export function describeMapGrid({ cols, rows, places, variant = 'card' }: MapGridProps): string {
  const head = `A map on a grid of ${cols} by ${rows} squares`
  // While a question is answered the words never say where a place is: moving from one to another is the question.
  if (variant === 'question') return `${head}, with ${sayList(places.map(theName))} on it.`
  const where = sayList(places.map((p) => `${theName(p)} is in column ${p.col + 1} and row ${p.row + 1}`))
  return `${head}. ${where.charAt(0).toUpperCase()}${where.slice(1)}, counted from the bottom left.`
}

export function MapGrid(props: MapGridProps) {
  const { cols, rows, places } = props
  const s = Math.min(44, (W - 20) / cols, 220 / rows)
  const x0 = (W - cols * s) / 2
  const y0 = 10
  const marks = placeMarks(places.map((p) => p.name))
  const centre = (p: { col: number; row: number }) => [x0 + p.col * s + s / 2, y0 + (rows - 1 - p.row) * s + s / 2] as const
  const legend = places.map((p, i) => ({ mark: marks[i]!, name: p.name.trim().toLowerCase(), house: !!p.house })).filter((l) => !l.house)
  const lines: (typeof legend)[] = legend.length > 3 ? [legend.slice(0, 3), legend.slice(3)] : [legend]
  const gridBottom = y0 + rows * s
  const H = gridBottom + 14 + lines.length * 20
  const out: ReactNode[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push(<rect key={`g${c}.${r}`} x={x0 + c * s} y={y0 + r * s} width={s} height={s} fill={WHITE} stroke="#D9D5CC" strokeWidth={1.2} />)
  places.forEach((p, i) => {
    const [x, y] = centre(p)
    if (p.house) {
      const k = s / 44
      out.push(
        <g key={`p${i}`} data-place={p.name} data-house="">
          <polygon points={`${x - 13 * k},${y + 2 * k} ${x},${y - 11 * k} ${x + 13 * k},${y + 2 * k}`} fill={RED} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <rect x={x - 9 * k} y={y + 2 * k} width={18 * k} height={12 * k} fill={WHITE} stroke={INK} strokeWidth={1.6} />
        </g>,
      )
      return
    }
    const look = LOOKS[i % LOOKS.length]!
    const w = Math.min(s - 8, marks[i]!.length > 1 ? 30 : 26)
    out.push(
      <g key={`p${i}`} data-place={p.name}>
        <rect x={x - w / 2} y={y - 12} width={w} height={24} rx={5} fill={look.fill} stroke={look.edge} strokeWidth={2} />
        <T x={x} y={y + 5} size={marks[i]!.length > 1 ? 12 : 13} weight={700} fill={look.edge}>
          {marks[i]!}
        </T>
      </g>,
    )
  })
  lines.forEach((line, j) =>
    out.push(
      <T key={`l${j}`} x={x0} y={gridBottom + 22 + j * 20} size={13} weight={600} fill={BODY} anchor="start">
        {line.map((l) => `${l.mark} ${l.name}`).join('   ')}
      </T>,
    ),
  )
  return (
    <Svg width={W} height={H} label={describeMapGrid(props)}>
      {out}
    </Svg>
  )
}
