import type { ReactNode } from 'react'
import type { TallyTableSpec } from '@jemma/profiling/schemas'
import { INK, Svg, T, WHITE, type Variant } from './shared'
import { sayList } from './chart-frame'

// P197: a tally table, from the "Data" board ("How many more children have dogs than cats?"). A row for each thing, its count as tally marks: four strokes and a
// fifth across them for each five.

export type TallyTableProps = TallyTableSpec & { variant?: Variant }

const W = 340
const ROW = 44
const LINE = '#C9C5BC'

export function describeTallyTable({ rows, variant = 'card' }: TallyTableProps): string {
  // While a question is answered the words never count the marks: a count may be the answer.
  if (variant === 'question') return `A tally table with rows for ${sayList(rows.map((r) => r.label.trim().toLowerCase()))}.`
  return `A tally table: ${sayList(rows.map((r) => `${r.label.trim().toLowerCase()} ${r.count}`))}.`
}

/** Tally marks for `n` at (x, y): groups of five, 44 apart. */
function Tally({ x, y, n }: { x: number; y: number; n: number }) {
  const out: ReactNode[] = []
  for (let g = 0; g * 5 < n; g++) {
    const k = Math.min(5, n - g * 5)
    const gx = x + g * 44
    for (let i = 0; i < Math.min(k, 4); i++) out.push(<line key={`${g}.${i}`} x1={gx + i * 8} y1={y - 14} x2={gx + i * 8} y2={y + 10} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />)
    if (k === 5) out.push(<line key={`${g}.x`} x1={gx - 4} y1={y + 4} x2={gx + 28} y2={y - 8} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />)
  }
  return <g data-tally={n}>{out}</g>
}

export function TallyTable(props: TallyTableProps) {
  const { heading, rows } = props
  const H = ROW * (rows.length + 1) + 20
  return (
    <Svg width={W} height={H} label={describeTallyTable(props)}>
      <rect x={10} y={10} width={320} height={ROW * (rows.length + 1)} rx={10} fill={WHITE} stroke={INK} strokeWidth={2} />
      <line x1={10} y1={10 + ROW} x2={330} y2={10 + ROW} stroke={INK} strokeWidth={1.6} />
      <line x1={130} y1={10} x2={130} y2={10 + ROW * (rows.length + 1)} stroke={INK} strokeWidth={1.6} />
      <T x={70} y={38} size={15} weight={700}>
        {heading?.trim() || ' '}
      </T>
      <T x={230} y={38} size={15} weight={700}>
        Tally
      </T>
      {rows.map((r, k) => {
        const y = 10 + ROW * (k + 1)
        return (
          <g key={k}>
            {k ? <line x1={10} y1={y} x2={330} y2={y} stroke={LINE} strokeWidth={1.4} /> : null}
            <T x={70} y={y + 28} size={15} weight={600}>
              {r.label.trim()}
            </T>
            <Tally x={152} y={y + 24} n={r.count} />
          </g>
        )
      })}
    </Svg>
  )
}
