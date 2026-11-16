import type { DiagramSpec } from '@jemma/profiling/schemas'
import { BODY, CORAL, CORAL_TEXT, INK, Line, Svg, T, fmt } from './shared'
import { boxOf, hitsAny, type Box } from './label-clear'
import { labelWidth, raisedLabel } from './math-label'

export type NumberLineProps = Extract<DiagramSpec, { kind: 'number_line' }>

const X0 = 30
const X1 = 255
const Y = 112
const VIEW_W = 285
/** The row of the numbers under the line, and the size of every label on the line. */
const TICK_Y = 138
const SIZE = 13
/** A label that does not fit in the row of the numbers goes above the line: the first row of words over the line (clear of the hops), and the room between two rows. */
const ABOVE_PLAIN = Y - 18
const ABOVE_HOPS = 74
const ROW = 17
const ROWS = 4
const EDGE = 4
const r1 = (n: number) => Math.round(n * 10) / 10

export function describeNumberLine({ min, max, step, marks }: NumberLineProps) {
  const m = marks.length ? ` Marked: ${marks.map((k) => k.label).join(', ')}.` : ''
  return `Number line from ${fmt(min)} to ${fmt(max)} in steps of ${fmt(step)}.${m}`
}

export function NumberLine(props: NumberLineProps) {
  const { min, max, step, marks } = props
  const span = max - min || 1
  const px = (v: number) => X0 + ((v - min) / span) * (X1 - X0)
  const ticks: number[] = []
  if (step > 0) for (let v = min, i = 0; v <= max + 1e-9 && i < 200; i += 1, v = min + i * step) ticks.push(Math.round(v * 1e6) / 1e6)
  const marked = new Map(marks.map((m) => [Math.round(m.value * 1e6) / 1e6, m.label]))
  // Fraction marks (3/4) mean the whole line speaks in fractions: 0, 1/4, 2/4, 3/4, 1.
  const denom = Math.round(1 / step)
  const asFraction = step > 0 && step < 1 && Math.abs(denom * step - 1) < 1e-9 && marks.some((m) => /^\d+\/\d+$/.test(m.label))
  const tickLabel = (v: number) => {
    if (!asFraction) return fmt(v)
    const n = Math.round(v * denom)
    return n % denom === 0 ? String(n / denom) : `${n}/${denom}`
  }
  const all = [...new Set([...ticks, ...marked.keys()])].sort((a, b) => a - b)
  // Counting on: one hop per step from the start up to the highest mark, when that mark sits on the step grid.
  const hops: [number, number][] = []
  const target = marks.length ? Math.max(...marks.map((m) => m.value)) : min
  const count = step > 0 ? Math.round((target - min) / step) : 0
  if (count >= 1 && count <= 12 && Math.abs(min + count * step - target) < 1e-9) {
    for (let i = 0; i < count; i += 1) hops.push([min + i * step, min + (i + 1) * step])
  }
  // P134: a label of a point sits in the row of the numbers only where it fits in the place of its own number (a "7", a "3/4"). A longer one ("2x + 3")
  // would cover the numbers beside it, so it goes above the line and its number stays in the row. A label that meets another label moves up a row.
  const inRow = new Map<number, string>(all.map((v) => [v, marked.get(v) ?? tickLabel(v)]))
  const rowBox = (v: number): Box => boxOf(px(v), TICK_Y, 'middle', labelWidth(inRow.get(v)!, SIZE) + 2, 10, 3)
  const moved = new Set<number>()
  for (const v of marked.keys()) {
    const own = labelWidth(tickLabel(v), SIZE) + 2
    const width = labelWidth(marked.get(v)!, SIZE) + 2
    if (width <= own + 0.5) continue
    if (!hitsAny(rowBox(v), all.filter((u) => u !== v).map(rowBox))) continue
    moved.add(v)
  }
  const above = new Map<number, { x: number; y: number; w: number; leader: boolean }>()
  const taken: Box[][] = Array.from({ length: ROWS }, () => [])
  for (const v of [...moved].sort((a, b) => a - b)) {
    const text = marked.get(v)!
    const w = labelWidth(text, SIZE) + 2
    // Inside the drawing: the middle of the label is the point, moved in just as far as it takes to keep all of the words in the box.
    const x = Math.min(Math.max(px(v), EDGE + w / 2), VIEW_W - EDGE - w / 2)
    const up = raisedLabel(text) ? 17 : 11
    let row = 0
    while (row < ROWS - 1 && hitsAny(boxOf(x, (hops.length ? ABOVE_HOPS : ABOVE_PLAIN) - row * ROW, 'middle', w + 4, up, 4), taken[row]!)) row += 1
    const y = (hops.length ? ABOVE_HOPS : ABOVE_PLAIN) - row * ROW
    taken[row]!.push(boxOf(x, y, 'middle', w + 4, up, 4))
    // Over the hops the label is far from its point: a thin dotted line brings the eye down to the end of the last hop.
    above.set(v, { x, y, w, leader: hops.length > 0 && row === 0 && Math.abs(v - target) < 1e-6 })
  }
  return (
    <Svg width={VIEW_W} height={190} label={describeNumberLine(props)}>
      <Line x1={X0} y1={Y} x2={X1} y2={Y} w={2} cap="round" />
      {hops.map(([a, b], i) => {
        const xa = px(a)
        const xb = px(b)
        const mid = (xa + xb) / 2
        return (
          <g key={`hop${i}`}>
            <path d={`M${r1(xa)} 108 Q${r1(mid)} 66 ${r1(xb - 3)} 104`} fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={`${r1(xb - 1)},107 ${r1(xb - 8)},103.1 ${r1(xb - 1.4)},99`} fill={INK} />
          </g>
        )
      })}
      {all.map((v) => {
        const x = Math.round(px(v) * 10) / 10
        const m = marked.has(v)
        return (
          <g key={v}>
            <Line x1={x} y1={Y - 8} x2={x} y2={Y + 8} w={2} cap="round" />
            {moved.has(v) ? (
              <T x={x} y={TICK_Y} size={SIZE} weight={400} fill={INK}>
                {tickLabel(v)}
              </T>
            ) : (
              <T x={x} y={TICK_Y} size={SIZE} weight={m ? 600 : 400} fill={m ? CORAL_TEXT : INK}>
                {marked.get(v) ?? tickLabel(v)}
              </T>
            )}
          </g>
        )
      })}
      {[...marked.keys()].map((v) => (
        <circle key={v} cx={Math.round(px(v) * 10) / 10} cy={Y} r={7} fill={CORAL} stroke={INK} strokeWidth={1.5} />
      ))}
      {[...above].map(([v, at]) => (
        <g key={`above${v}`}>
          {at.leader && <line x1={r1(px(v))} y1={at.y + 7} x2={r1(px(v))} y2={Y - 9} stroke={BODY} strokeWidth={1.2} strokeDasharray="2 3" strokeLinecap="round" />}
          <T x={r1(at.x)} y={at.y} size={SIZE} weight={600} fill={CORAL_TEXT} attrs={{ 'data-mark-label': 'above' }}>
            {marked.get(v)!}
          </T>
        </g>
      ))}
    </Svg>
  )
}
