import type { ReactNode } from 'react'
import type { ObjectsSpec } from '@jemma/profiling/schemas'
import { EDGE, GOLD, INK, Svg, WHITE, type Variant } from './shared'

// P188: things to count, share or see in equal groups, from the "Counting and place value" board ("How many apples?"). Lined up in rows to count, or each group
// in a ring of its own (equal groups, sharing, a fraction of a set). The things are drawn with the flag colours: an apple, a star, a ball, a flower, a fish, a
// car, a cookie, a heart.

export type ObjectsProps = ObjectsSpec & { variant?: Variant }

const RED = '#E03C31'
const BLUE = '#001489'
const GREEN = '#007749'
const BROWN = '#6B4A2B'
const W = 300

const PLURAL: Record<ObjectsSpec['thing'], string> = {
  apple: 'apples',
  star: 'stars',
  ball: 'balls',
  flower: 'flowers',
  fish: 'fish',
  car: 'cars',
  cookie: 'cookies',
  heart: 'hearts',
}

/** One thing, centred at (x, y), about `s` across. */
function Thing({ thing, x, y, s }: { thing: ObjectsSpec['thing']; x: number; y: number; s: number }): ReactNode {
  const r = s / 2
  switch (thing) {
    case 'apple':
      return (
        <g>
          <circle cx={x} cy={y + r * 0.12} r={r * 0.82} fill={RED} stroke="#9C1F17" strokeWidth={1.4} />
          <path d={`M${x},${y - r * 0.62} q${r * 0.12},${-r * 0.36} ${r * 0.4},${-r * 0.48}`} fill="none" stroke={BROWN} strokeWidth={1.8} strokeLinecap="round" />
          <ellipse cx={x + r * 0.42} cy={y - r * 0.9} rx={r * 0.36} ry={r * 0.18} fill={GREEN} transform={`rotate(-25 ${x + r * 0.42} ${y - r * 0.9})`} />
        </g>
      )
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI / 5) * i - Math.PI / 2
        const rr = i % 2 === 0 ? r * 0.95 : r * 0.42
        return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`
      }).join(' ')
      return <polygon points={pts} fill={GOLD} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
    }
    case 'ball':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.85} fill={BLUE} stroke={INK} strokeWidth={1.4} />
          <path d={`M${x - r * 0.85},${y} q${r * 0.85},${-r * 0.5} ${r * 1.7},0`} fill="none" stroke={WHITE} strokeWidth={1.6} />
          <path d={`M${x},${y - r * 0.85} q${r * 0.45},${r * 0.85} 0,${r * 1.7}`} fill="none" stroke={WHITE} strokeWidth={1.6} />
        </g>
      )
    case 'flower':
      return (
        <g>
          {[0, 72, 144, 216, 288].map((deg) => {
            const a = (deg * Math.PI) / 180 - Math.PI / 2
            return <circle key={deg} cx={x + r * 0.5 * Math.cos(a)} cy={y + r * 0.5 * Math.sin(a)} r={r * 0.36} fill={RED} stroke="#9C1F17" strokeWidth={1} />
          })}
          <circle cx={x} cy={y} r={r * 0.3} fill={GOLD} stroke={INK} strokeWidth={1.2} />
        </g>
      )
    case 'fish':
      return (
        <g>
          <polygon points={`${x + r * 0.45},${y} ${x + r * 0.95},${y - r * 0.45} ${x + r * 0.95},${y + r * 0.45}`} fill={GOLD} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          <ellipse cx={x - r * 0.12} cy={y} rx={r * 0.68} ry={r * 0.45} fill={GOLD} stroke={INK} strokeWidth={1.4} />
          <circle cx={x - r * 0.45} cy={y - r * 0.08} r={r * 0.08} fill={INK} />
        </g>
      )
    case 'car':
      return (
        <g>
          <path d={`M${x - r * 0.95},${y + r * 0.25} v${-r * 0.35} l${r * 0.35},${-r * 0.4} h${r * 0.9} l${r * 0.35},${r * 0.4} v${r * 0.35} z`} fill={RED} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
          <rect x={x - r * 0.5} y={y - r * 0.42} width={r * 0.42} height={r * 0.28} fill={WHITE} stroke={INK} strokeWidth={0.8} />
          <rect x={x + r * 0.05} y={y - r * 0.42} width={r * 0.42} height={r * 0.28} fill={WHITE} stroke={INK} strokeWidth={0.8} />
          <circle cx={x - r * 0.5} cy={y + r * 0.32} r={r * 0.2} fill={INK} />
          <circle cx={x + r * 0.5} cy={y + r * 0.32} r={r * 0.2} fill={INK} />
        </g>
      )
    case 'cookie':
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.85} fill="#E3A008" stroke={BROWN} strokeWidth={1.4} />
          {[
            [-0.35, -0.3],
            [0.3, -0.2],
            [-0.1, 0.25],
            [0.35, 0.35],
            [-0.45, 0.2],
          ].map(([dx, dy], i) => (
            <circle key={i} cx={x + dx! * r} cy={y + dy! * r} r={r * 0.1} fill={BROWN} />
          ))}
        </g>
      )
    case 'heart':
      return (
        <path
          d={`M${x},${y + r * 0.8} C${x - r * 1.1},${y} ${x - r * 0.75},${y - r * 0.85} ${x},${y - r * 0.4} C${x + r * 0.75},${y - r * 0.85} ${x + r * 1.1},${y} ${x},${y + r * 0.8} z`}
          fill={RED}
          stroke="#9C1F17"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      )
  }
}

const sayList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''))

export function describeObjects({ thing, groups, layout = 'rows', variant = 'card' }: ObjectsProps): string {
  const name = PLURAL[thing]
  const parts = layout === 'groups' ? 'groups' : 'rows'
  // While a question is answered the words say what is drawn, never how many: the count may be the answer.
  if (variant === 'question') return `A picture of ${name} in ${groups.length} ${groups.length === 1 ? parts.slice(0, -1) : parts}.`
  const total = groups.reduce((a, n) => a + n, 0)
  if (layout === 'groups' && groups.every((n) => n === groups[0])) return `${total} ${name} in ${groups.length} groups of ${groups[0]}.`
  return `${total} ${name} in ${groups.length} ${groups.length === 1 ? parts.slice(0, -1) : parts}: ${sayList(groups.map(String))}.`
}

export function Objects(props: ObjectsProps) {
  const { thing, groups, layout = 'rows' } = props
  if (layout === 'groups') {
    // Each group in a ring of its own: up to 3 rings in a line, the things inside in rows of up to 5.
    const perLine = groups.length <= 4 ? Math.min(groups.length, 2) : 3
    const most = Math.max(...groups)
    const across = Math.min(most, 5)
    const down = Math.ceil(most / 5)
    const ringW = (W - 12 - (perLine - 1) * 10) / perLine
    const s = Math.min(34, (ringW - 14) / across)
    const ringH = down * s + 18
    const lines = Math.ceil(groups.length / perLine)
    const H = lines * ringH + (lines - 1) * 10 + 12
    return (
      <Svg width={W} height={H} label={describeObjects(props)}>
        {groups.map((n, g) => {
          const rx = 6 + (g % perLine) * (ringW + 10)
          const ry = 6 + Math.floor(g / perLine) * (ringH + 10)
          return (
            <g key={g} data-group={g + 1}>
              <rect x={rx} y={ry} width={ringW} height={ringH} rx={16} fill={WHITE} stroke={EDGE} strokeWidth={2} strokeDasharray="6 5" />
              {Array.from({ length: n }, (_, k) => {
                const inRow = Math.min(n - Math.floor(k / 5) * 5, 5)
                const left = rx + (ringW - inRow * s) / 2
                return <Thing key={k} thing={thing} x={left + (k % 5) * s + s / 2} y={ry + 9 + Math.floor(k / 5) * s + s / 2} s={s * 0.86} />
              })}
            </g>
          )
        })}
      </Svg>
    )
  }
  // In rows to count: one row for each number, every row starting at the same place on the left so the rows can be compared, the whole block in the middle.
  const most = Math.max(...groups)
  const s = Math.min(52, (W - 16) / most)
  const left = (W - most * s) / 2
  const H = groups.length * s + 16
  return (
    <Svg width={W} height={H} label={describeObjects(props)}>
      {groups.map((n, row) =>
        Array.from({ length: n }, (_, k) => <Thing key={`${row}.${k}`} thing={thing} x={left + k * s + s / 2} y={8 + row * s + s / 2} s={s * 0.84} />),
      )}
    </Svg>
  )
}
