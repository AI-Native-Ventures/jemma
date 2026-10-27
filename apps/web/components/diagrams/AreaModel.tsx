import type { DiagramSpec } from '@jemma/profiling/schemas'
import { CORAL_TINT, INK, Line, Svg, T, WHITE } from './shared'

export type AreaModelProps = Extract<DiagramSpec, { kind: 'area_model' }>

export function describeAreaModel({ rows, cols, shaded }: AreaModelProps) {
  const total = rows * cols
  const eq = shaded >= total ? `showing ${rows} × ${cols} = ${total}` : `with ${shaded} of the ${total} squares shaded`
  return `Area model: a rectangle ${cols} squares wide and ${rows} squares tall, ${total} squares in all, ${eq}.`
}

export function AreaModel(props: AreaModelProps) {
  const rows = Math.max(1, Math.round(props.rows))
  const cols = Math.max(1, Math.round(props.cols))
  const total = rows * cols
  const shaded = Math.max(0, Math.min(total, Math.round(props.shaded)))
  const cell = Math.min(30, Math.floor(200 / cols), Math.floor(90 / rows)) || 1
  const w = cols * cell
  const h = rows * cell
  const x = (285 - w) / 2
  const y = 40
  const full = shaded === total
  return (
    <Svg width={285} height={Math.max(190, y + h + 60)} label={describeAreaModel(props)}>
      <rect x={x} y={y} width={w} height={h} rx={0} fill={full ? CORAL_TINT : WHITE} stroke={INK} strokeWidth={1.8} />
      {!full &&
        Array.from({ length: shaded }, (_, i) => (
          <rect key={i} x={x + (i % cols) * cell} y={y + Math.floor(i / cols) * cell} width={cell} height={cell} fill={CORAL_TINT} />
        ))}
      {Array.from({ length: cols - 1 }, (_, i) => (
        <Line key={`c${i}`} x1={x + (i + 1) * cell} y1={y} x2={x + (i + 1) * cell} y2={y + h} />
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <Line key={`r${i}`} x1={x} y1={y + (i + 1) * cell} x2={x + w} y2={y + (i + 1) * cell} />
      ))}
      {!full && <rect x={x} y={y} width={w} height={h} rx={0} fill="none" stroke={INK} strokeWidth={1.8} />}
      <T x={142.5} y={30} size={14} weight={600}>
        {cols}
      </T>
      <T x={x - 12} y={y + h / 2 } size={14} weight={600} anchor="end">
        {rows}
      </T>
      <T x={142.5} y={y + h + 32} size={18} weight={700}>
        {full ? `${rows} × ${cols} = ${total}` : `${shaded} of ${total} squares`}
      </T>
    </Svg>
  )
}
