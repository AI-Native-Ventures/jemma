import type { DiagramSpec } from '@jemma/profiling/schemas'
import { BODY, CORAL_SOFT, CORAL_TINT, EDGE, INK, Line, Svg, T, type Variant } from './shared'

export type GridAreaProps = Extract<DiagramSpec, { kind: 'grid_area' }> & { variant?: Variant }

export function describeGridArea({ cols, rows, cells }: GridAreaProps) {
  return `Squared paper ${cols} squares wide and ${rows} tall. A shape covers ${cells.length} squares, so its area is ${cells.length} cm².`
}

/** cells are [column, row], counted from the top left, both from 0. */
export function GridArea(props: GridAreaProps) {
  const { variant = 'card' } = props
  const q = variant === 'question'
  const cols = Math.max(1, Math.round(props.cols))
  const rows = Math.max(1, Math.round(props.rows))
  const cells = [...new Map(props.cells.filter(([c, r]) => c >= 0 && c < cols && r >= 0 && r < rows).map(([c, r]) => [`${c},${r}`, [c, r] as const])).values()]
  const has = new Set(cells.map(([c, r]) => `${c},${r}`))

  // card: cell 18 centred in 285 wide, top 18, caption under. question: cell 34 on a 2px margin, no caption.
  const cell = q ? 34 : Math.min(18, Math.floor(240 / cols), Math.floor(108 / rows)) || 1
  const x0 = q ? 2 : (285 - cols * cell) / 2
  const y0 = q ? 2 : 18
  const w = cols * cell
  const h = rows * cell
  const width = q ? w + 4 : 285
  const height = q ? h + 4 : Math.max(190, y0 + h + 50)
  const px = (c: number) => x0 + c * cell
  const py = (r: number) => y0 + r * cell
  const stroke = q ? 3 : 2.2

  let edges = ''
  for (const [c, r] of cells) {
    if (!has.has(`${c},${r - 1}`)) edges += `M${px(c)} ${py(r)} L${px(c + 1)} ${py(r)} `
    if (!has.has(`${c},${r + 1}`)) edges += `M${px(c)} ${py(r + 1)} L${px(c + 1)} ${py(r + 1)} `
    if (!has.has(`${c - 1},${r}`)) edges += `M${px(c)} ${py(r)} L${px(c)} ${py(r + 1)} `
    if (!has.has(`${c + 1},${r}`)) edges += `M${px(c + 1)} ${py(r)} L${px(c + 1)} ${py(r + 1)} `
  }

  return (
    <Svg width={width} height={height} label={describeGridArea(props)}>
      {cells.map(([c, r]) => (
        <rect key={`${c},${r}`} x={px(c)} y={py(r)} width={cell} height={cell} rx={0} fill={q ? CORAL_SOFT : CORAL_TINT} />
      ))}
      {Array.from({ length: cols + 1 }, (_, c) => (
        <Line key={`v${c}`} x1={px(c)} y1={y0} x2={px(c)} y2={y0 + h} stroke={EDGE} />
      ))}
      {Array.from({ length: rows + 1 }, (_, r) => (
        <Line key={`h${r}`} x1={x0} y1={py(r)} x2={x0 + w} y2={py(r)} stroke={EDGE} />
      ))}
      {edges && <path d={edges} fill="none" stroke={INK} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />}
      {!q && (
        <>
          <T x={142.5} y={y0 + h + 26} size={15} weight={700}>
            {`Area = ${cells.length} cm²`}
          </T>
          <T x={142.5} y={y0 + h + 48} size={12} fill={BODY}>
            Each square is 1 cm²
          </T>
        </>
      )}
    </Svg>
  )
}
