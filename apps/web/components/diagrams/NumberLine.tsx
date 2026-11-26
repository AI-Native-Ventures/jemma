import type { DiagramSpec } from '@jemma/profiling/schemas'
import type { Notation } from '@jemma/profiling/logic'
import { BODY, GOLD, GREEN, RED_TEXT, INK, Line, Svg, T, WHITE, fmtIn } from './shared'
import { boxOf, hits, hitsAny, type Box } from './label-clear'
import { bareNumberValue, isBareNumber, isSolutionLabel, readCaption, readInequality, type Inequality } from './inequality'
import { labelWidth, raisedLabel } from './math-label'

export type NumberLineProps = Extract<DiagramSpec, { kind: 'number_line' }> & {
  /** P145: the caption of the step the line is drawn for. Read only when `senior` is set. */
  caption?: string
  /** P145: the line is in a lesson of a senior class: a caption that gives the side of a mark makes a ray, and a single solution mark is a dot, never hops. */
  senior?: boolean
  /** P187: how its numbers are written (a decimal point in the US). */
  notation?: Notation
}

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
/**
 * P141: an inequality is a circle on its number and a thick ray with an arrow head (or a thick segment between two circles). The ray, its arrow head and a
 * filled circle are one shape in one colour, green (the line to look at); an open circle is white. A mark that is only a point stays a gold dot.
 */
const RAY_W = 6
const CIRCLE_R = 7
const ARROW_LEN = 12
const ARROW_HALF = 7
/** The count of the numbers under a long line goes up by 1, 2, 5, 10 ... steps: the first of these that leaves no number over its neighbour. */
const LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500]

/**
 * What an inequality mark is drawn as, with the numbers of the line it stands on: a ray from its point, a segment between two, or (P145) an open circle alone,
 * for a boundary whose side the caption does not say. `text` is the label above the circle ('' when the number under the line says it all).
 */
type Shape = (Extract<Inequality, { kind: 'ray' }> & { at: number } | Extract<Inequality, { kind: 'segment' }> | { kind: 'open'; at: number }) & { text: string }

export function describeNumberLine({ min, max, step, marks, notation }: NumberLineProps) {
  const fmt = (v: number) => fmtIn(v, notation)
  const m = marks.length ? ` Marked: ${marks.map((k) => k.label).join(', ')}.` : ''
  return `Number line from ${fmt(min)} to ${fmt(max)} in steps of ${fmt(step)}.${m}`
}

export function NumberLine(props: NumberLineProps) {
  const { min, max, step, marks } = props
  const fmt = (v: number) => fmtIn(v, props.notation)
  const span = max - min || 1
  const px = (v: number) => X0 + ((v - min) / span) * (X1 - X0)
  const ticks: number[] = []
  if (step > 0) for (let v = min, i = 0; v <= max + 1e-9 && i < 200; i += 1, v = min + i * step) ticks.push(Math.round(v * 1e6) / 1e6)
  // P141: a mark whose label is an inequality in one letter, and whose numbers are on the line, is a circle and a ray (or a segment). Every other mark is as it was.
  const shapes: Shape[] = []
  const within = (v: number) => v >= min - 1e-9 && v <= max + 1e-9
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6
  const labelled = marks.filter((m) => {
    const read = readInequality(m.label)
    if (!read) return true
    if (read.kind === 'ray') {
      if (!within(m.value)) return true
      shapes.push({ ...read, at: round6(m.value), text: m.label })
      return false
    }
    if (!(read.lo >= min - 1e-9 && read.hi <= max + 1e-9)) return true
    shapes.push({ ...read, text: m.label })
    return false
  })
  // P145: in a lesson of a senior class the caption of the step says the inequality ("running to the right of 3") and the mark is only the number. A mark that
  // the caption gives a side to is a circle and a ray. When the caption has an inequality sign and says no side for a single boundary number, that number is an
  // open circle and nothing else. Neither draws hops.
  const caption = props.senior && props.caption ? readCaption(props.caption) : null
  let plain = labelled
  if (caption) {
    const same = (a: number, b: number) => Math.abs(a - b) < 1e-9
    const left = [...labelled]
    const take = (value: number) => {
      const at = left.findIndex((m) => same(m.value, value) && within(m.value))
      return at < 0 ? null : left.splice(at, 1)[0]!
    }
    // "-2 < x <= 3" in the caption, with a mark at each end: one segment.
    for (const sg of caption.segments) {
      if (!left.some((m) => same(m.value, sg.lo)) || !left.some((m) => same(m.value, sg.hi))) continue
      take(sg.lo)
      take(sg.hi)
      shapes.push({ kind: 'segment', lo: sg.lo, hi: sg.hi, loClosed: sg.loClosed, hiClosed: sg.hiClosed, text: '' })
    }
    // "to the right of 3", "x > 3": the first side the caption names for a mark. The label is written above the circle unless it is just the number.
    for (const m of [...left]) {
      const ray = caption.rays.find((r) => same(r.value, m.value))
      if (!ray || !within(m.value)) continue
      left.splice(left.indexOf(m), 1)
      shapes.push({ kind: 'ray', dir: ray.dir, closed: ray.closed, at: round6(m.value), text: same(bareNumberValue(m.label), m.value) ? '' : m.label })
    }
    // One boundary number, an inequality sign in the caption and no side for it: an open circle.
    const only = left[0]
    if (caption.symbol && shapes.length === 0 && left.length === 1 && only && isBareNumber(only.label) && within(only.value)) {
      left.splice(0, 1)
      shapes.push({ kind: 'open', at: round6(only.value), text: '' })
    }
    plain = left
  }
  const bounds = shapes.flatMap((sh) => (sh.kind === 'segment' ? [round6(sh.lo), round6(sh.hi)] : [sh.at]))
  const marked = new Map(plain.map((m) => [Math.round(m.value * 1e6) / 1e6, m.label]))
  // Fraction marks (3/4) mean the whole line speaks in fractions: 0, 1/4, 2/4, 3/4, 1.
  const denom = Math.round(1 / step)
  const asFraction = step > 0 && step < 1 && Math.abs(denom * step - 1) < 1e-9 && marks.some((m) => /^\d+\/\d+$/.test(m.label))
  const tickLabel = (v: number) => {
    if (!asFraction) return fmt(v)
    const n = Math.round(v * denom)
    return n % denom === 0 ? String(n / denom) : `${n}/${denom}`
  }
  const all = [...new Set([...ticks, ...marked.keys(), ...bounds])].sort((a, b) => a - b)
  // Counting on: one hop per step from the start up to the highest mark, when that mark sits on the step grid. An inequality is not counted on: it has its own picture.
  // P145: in a senior lesson a line with an inequality picture on it, or with one mark that says where a solution is ("x = 4", a number, "x"), is not a count: a dot, no hops.
  const hops: [number, number][] = []
  const target = plain.length ? Math.max(...plain.map((m) => m.value)) : min
  const count = step > 0 ? Math.round((target - min) / step) : 0
  const noCount = props.senior === true && (shapes.length > 0 || (plain.length === 1 && isSolutionLabel(plain[0]!.label)))
  if (!noCount && count >= 1 && count <= 12 && Math.abs(min + count * step - target) < 1e-9) {
    for (let i = 0; i < count; i += 1) hops.push([min + i * step, min + (i + 1) * step])
  }
  // P141: the numbers under a long line thin out. The count goes by 1, 2, 5, 10 ... steps, from 0 when it is on the line (else from the first number), as far
  // as it takes for no number to be over its neighbour. A tick stays at every step. A short line keeps every number, as it always did.
  const zeroAt = Math.max(0, ticks.indexOf(0))
  const tickBox = (v: number): Box => boxOf(px(v), TICK_Y, 'middle', labelWidth(tickLabel(v), SIZE) + 2, 10, 3)
  const labelStep =
    LABEL_STEPS.find((k) => {
      const row = ticks.filter((_, i) => (i - zeroAt) % k === 0).map(tickBox)
      return row.every((b, i) => i === 0 || !hits(row[i - 1]!, b))
    }) ?? LABEL_STEPS[LABEL_STEPS.length - 1]!
  const onGrid = labelStep === 1 ? ticks : ticks.filter((_, i) => (i - zeroAt) % labelStep === 0)
  // P134: a label of a point sits in the row of the numbers only where it fits in the place of its own number (a "7", a "3/4"). A longer one ("2x + 3")
  // would cover the numbers beside it, so it goes above the line and its number stays in the row. A label that meets another label moves up a row.
  const inRow = new Map<number, string>(all.map((v) => [v, marked.get(v) ?? tickLabel(v)]))
  const rowBox = (v: number): Box => boxOf(px(v), TICK_Y, 'middle', labelWidth(inRow.get(v)!, SIZE) + 2, 10, 3)
  // The numbers that have a say: all of them on a line that is not thinned; on a thinned one, those on the count and the numbers of the marks.
  const neighbours = labelStep === 1 ? all : [...new Set([...onGrid, ...marked.keys(), ...bounds])].sort((a, b) => a - b)
  const moved = new Set<number>()
  for (const v of marked.keys()) {
    const own = labelWidth(tickLabel(v), SIZE) + 2
    const width = labelWidth(marked.get(v)!, SIZE) + 2
    if (width <= own + 0.5) continue
    if (!hitsAny(rowBox(v), neighbours.filter((u) => u !== v).map(rowBox))) continue
    moved.add(v)
  }
  // On a thinned line the number of a mark (or of the end of an inequality) is always there, and the numbers of the count that it would cover are left out.
  const priority = labelStep === 1 ? [] : [...new Set([...marked.keys(), ...bounds])]
  const priorityBoxes = priority.map((v) => boxOf(px(v), TICK_Y, 'middle', labelWidth(moved.has(v) ? tickLabel(v) : inRow.get(v)!, SIZE) + 2, 10, 3))
  const shown = new Set<number>(labelStep === 1 ? all : [...priority, ...onGrid.filter((v) => !priority.includes(v) && !hitsAny(tickBox(v), priorityBoxes))])
  // The words above the line: the long label of a mark, and the label of each inequality (above its circle, or above the middle of its segment).
  const wanted = [
    ...[...moved].map((v) => ({ key: `m${v}`, text: marked.get(v)!, at: px(v), mark: v })),
    ...shapes.flatMap((sh, i) => (sh.text ? [{ key: `i${i}`, text: sh.text, at: sh.kind === 'segment' ? (px(sh.lo) + px(sh.hi)) / 2 : px(sh.at), mark: null as number | null }] : [])),
  ].sort((a, b) => a.at - b.at)
  const above: { key: string; text: string; x: number; y: number; at: number; leader: boolean }[] = []
  const taken: Box[][] = Array.from({ length: ROWS }, () => [])
  for (const w of wanted) {
    const text = w.text
    const bw = labelWidth(text, SIZE) + 2
    // Inside the drawing: the middle of the label is the point, moved in just as far as it takes to keep all of the words in the box.
    const x = Math.min(Math.max(w.at, EDGE + bw / 2), VIEW_W - EDGE - bw / 2)
    const up = raisedLabel(text) ? 17 : 11
    let row = 0
    while (row < ROWS - 1 && hitsAny(boxOf(x, (hops.length ? ABOVE_HOPS : ABOVE_PLAIN) - row * ROW, 'middle', bw + 4, up, 4), taken[row]!)) row += 1
    const y = (hops.length ? ABOVE_HOPS : ABOVE_PLAIN) - row * ROW
    taken[row]!.push(boxOf(x, y, 'middle', bw + 4, up, 4))
    // Over the hops the label is far from its point: a thin dotted line brings the eye down to the end of the last hop.
    above.push({ key: w.key, text, x, y, at: w.at, leader: w.mark !== null && hops.length > 0 && row === 0 && Math.abs(w.mark - target) < 1e-6 })
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
      {shapes.map((sh, i) => {
        if (sh.kind === 'open') return null
        if (sh.kind === 'segment') return <line key={`shape${i}`} data-segment="" x1={r1(px(sh.lo))} y1={Y} x2={r1(px(sh.hi))} y2={Y} stroke={GREEN} strokeWidth={RAY_W} />
        // The ray runs from its circle to the end of the line, and an arrow head (a little past the end) says that it goes on.
        const end = sh.dir === 'left' ? X0 - 1 : X1 + 1
        const tip = sh.dir === 'left' ? X0 - ARROW_LEN : X1 + ARROW_LEN
        return (
          <g key={`shape${i}`}>
            <line data-ray={sh.dir} x1={r1(px(sh.at))} y1={Y} x2={end} y2={Y} stroke={GREEN} strokeWidth={RAY_W} />
            <polygon data-arrow={sh.dir} points={`${end},${Y - ARROW_HALF} ${tip},${Y} ${end},${Y + ARROW_HALF}`} fill={GREEN} />
          </g>
        )
      })}
      {all.map((v) => {
        const x = Math.round(px(v) * 10) / 10
        const m = marked.has(v)
        return (
          <g key={v}>
            <Line x1={x} y1={Y - 8} x2={x} y2={Y + 8} w={2} cap="round" />
            {!shown.has(v) ? null : moved.has(v) || !m ? (
              <T x={x} y={TICK_Y} size={SIZE} weight={400} fill={INK}>
                {moved.has(v) ? tickLabel(v) : (marked.get(v) ?? tickLabel(v))}
              </T>
            ) : (
              <T x={x} y={TICK_Y} size={SIZE} weight={600} fill={RED_TEXT}>
                {marked.get(v)!}
              </T>
            )}
          </g>
        )
      })}
      {[...marked.keys()].map((v) => (
        <circle key={v} cx={Math.round(px(v) * 10) / 10} cy={Y} r={CIRCLE_R} fill={GOLD} stroke={INK} strokeWidth={1.5} />
      ))}
      {shapes.flatMap((sh, i) =>
        (sh.kind === 'ray' ? [{ v: sh.at, closed: sh.closed }] : sh.kind === 'open' ? [{ v: sh.at, closed: false }] : [{ v: sh.lo, closed: sh.loClosed }, { v: sh.hi, closed: sh.hiClosed }]).map((c) => (
          <circle key={`end${i}-${c.v}`} data-circle={c.closed ? 'filled' : 'open'} cx={r1(px(c.v))} cy={Y} r={CIRCLE_R} fill={c.closed ? GREEN : WHITE} stroke={INK} strokeWidth={1.5} />
        )),
      )}
      {above.map((at) => (
        <g key={`above${at.key}`}>
          {at.leader && <line x1={r1(at.at)} y1={at.y + 7} x2={r1(at.at)} y2={Y - 9} stroke={BODY} strokeWidth={1.2} strokeDasharray="2 3" strokeLinecap="round" />}
          <T x={r1(at.x)} y={at.y} size={SIZE} weight={600} fill={RED_TEXT} attrs={{ 'data-mark-label': 'above' }}>
            {at.text}
          </T>
        </g>
      ))}
    </Svg>
  )
}
