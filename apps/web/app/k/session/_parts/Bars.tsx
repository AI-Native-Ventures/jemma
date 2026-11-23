import { Frac } from './Frac'

export type Fill = 'gold' | 'ink' | 'grey' | 'none'

const COLOURS: Record<Fill, string | undefined> = { gold: '#FFB81C', ink: '#161616', grey: '#8F8D88', none: undefined }

export type BarProps = {
  fills: Fill[]
  height: number
  radius: number
  /** Indexes whose right edge is dashed (a cut inside a bigger piece). */
  dashed?: number[]
  white?: boolean
}

/** One fraction bar from the boards: a grid of equal cells with a black frame. */
export function Bar({ fills, height, radius, dashed = [], white }: BarProps) {
  return (
    <span
      aria-hidden="true"
      className="grid overflow-hidden border-2 border-ink"
      style={{
        gridTemplateColumns: `repeat(${fills.length}, minmax(0, 1fr))`,
        height,
        borderRadius: radius,
        background: white ? '#FFFFFF' : undefined,
        flex: 1,
      }}
    >
      {fills.map((fill, i) => (
        <span
          key={i}
          style={{
            background: COLOURS[fill],
            borderRight: i === fills.length - 1 ? undefined : dashed.includes(i) ? '1.5px dashed #161616' : '2px solid #161616',
          }}
        />
      ))}
    </span>
  )
}

export type RowSpec = { parts: number; shaded: number; label?: string }

const parse = (label?: string): [string, string] | null => {
  const m = label ? /^(\d+)\/(\d+)$/.exec(label.trim()) : null
  return m ? [m[1]!, m[2]!] : null
}

/**
 * Gold for the first shaded row and for rows that show the same amount again, black for a new amount added.
 * `carry` is the previous step's last row: in a one-row step the cells past its gold ones are the added amount.
 */
export function rowFills(rows: RowSpec[], carry?: { parts: number; gold: number }): Fill[][] {
  let base: number | null = null
  return rows.map((row) => {
    const value = row.parts ? row.shaded / row.parts : 0
    if (base === null && row.shaded > 0) base = value
    const added = row.shaded > 0 && Math.abs(value - (base ?? value)) > 1e-9
    return Array.from({ length: row.parts }, (_, i): Fill => {
      if (i >= row.shaded) return 'none'
      if (added) return 'ink'
      if (carry && rows.length === 1 && carry.parts === row.parts && i >= carry.gold) return 'ink'
      return 'gold'
    })
  })
}

export type BarRowsProps = {
  rows: RowSpec[]
  fills?: Fill[][]
  /** Dashed cuts per row index. */
  dashed?: Record<number, number[]>
  height: number
  radius: number
  labelWidth: number
  labelSize: number
  labelRule: number
  labelGap: number
  labelSide: number
  gap: number
  white?: boolean
}

/** Rows of `label + bar`, as in the learn cards and the lesson diagram. */
export function BarRows({ rows, fills, dashed, height, radius, labelWidth, labelSize, labelRule, labelGap, labelSide, gap, white }: BarRowsProps) {
  const colours = fills ?? rowFills(rows)
  return (
    <>
      {rows.map((row, i) => {
        const label = parse(row.label) ?? [String(row.shaded), String(row.parts)]
        return (
          <span key={i} className="flex items-center" style={{ gap }}>
            <span aria-hidden="true" style={{ width: labelWidth, display: 'inline-flex', justifyContent: 'center' }}>
              <Frac top={label[0]} bottom={label[1]} size={labelSize} rule={labelRule} gap={labelGap} side={labelSide} width={labelWidth} />
            </span>
            <Bar fills={colours[i]!} height={height} radius={radius} dashed={dashed?.[i]} white={white} />
          </span>
        )
      })}
    </>
  )
}
