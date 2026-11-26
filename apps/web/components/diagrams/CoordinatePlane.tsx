import { useId } from 'react'
import type { CoordinatePlaneSpec } from '@jemma/profiling/schemas'
import { Rich, fracLabel, labelWidth, raisedLabel } from './math-label'
import { boxOf, hits, hitsAny, within, type Anchor, type Box } from './label-clear'
import { piText, pointIn, type Notation } from '@jemma/profiling/logic'
import { BODY, GREEN, RED_TEXT, INK, Line, Svg, WHITE, fmtIn, type Variant } from './shared'
import { defaultStep, graphEquation, sampleGraph, ticksOf, type Pt } from './plane-math'

/** P187: `notation` says how its numbers are written (a decimal point, and (2, 3) for a point, in the US). */
export type CoordinatePlaneProps = CoordinatePlaneSpec & { variant?: Variant; notation?: Notation }

const W = 320
const H = 300
const LEFT = 40
const RIGHT = 24
const TOP = 24
const BOTTOM = 34
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = H - TOP - BOTTOM
const GRID = '#D9D6CE'
/**
 * One colour for each of up to three graphs: green (the line to look at, with its label in the red of a label: gold is too pale for a thin line
 * or for words on white), black, and a grey one that is also dashed.
 */
const GRAPH = [
  { stroke: GREEN, text: RED_TEXT, dash: undefined },
  { stroke: INK, text: INK, dash: undefined },
  { stroke: BODY, text: BODY, dash: '7 5' },
] as const

const r1 = (n: number) => Math.round(n * 10) / 10
/** A negative number with a true minus sign, and the decimal comma of the app (P187: a decimal point in the US). */
const numeral = (v: number, n?: Notation) => (v < 0 ? `−${fmtIn(-v, n)}` : fmtIn(v, n))
const unlabelled = (spec: CoordinatePlaneSpec) => spec.points?.filter((p) => !p.label) ?? []
const sentence = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? ''))
const kindOf = (g: NonNullable<CoordinatePlaneSpec['graphs']>[number]) => (g.type === 'line' ? 'line' : 'curve')

/**
 * The spoken description. On a card it says the equation of each graph and the coordinates of each point. In a question (`variant` "question")
 * the equation or a coordinate can be the very answer, so it only says what can be seen: a straight line, a curve, the labels.
 */
export function describeCoordinatePlane(spec: CoordinatePlaneSpec, variant: Variant = 'card', notation?: Notation) {
  const fmt = (v: number) => fmtIn(v, notation)
  const q = variant === 'question'
  const same = spec.xMin === spec.yMin && spec.xMax === spec.yMax && !spec.radians
  // P198: a grid of trig graphs marked in π says its x in π.
  const fx = (v: number) => (spec.radians ? piText(v) : fmt(v))
  let text = `A grid from ${fx(spec.xMin)} to ${fx(spec.xMax)}${same ? '' : ` across and from ${fmt(spec.yMin)} to ${fmt(spec.yMax)} up`}`
  if (spec.graphs?.length) {
    const parts = spec.graphs.map((g) =>
      q
        ? `${g.type === 'line' ? 'a straight line' : 'a curve'}${g.label ? ` labelled ${g.label}` : ''}`
        : `the ${kindOf(g)} ${graphEquation(g, notation)}${g.label ? ` (${g.label})` : ''}`,
    )
    text += ` with ${sentence(parts)}`
  }
  // P195: circles, and the angle of a line.
  if (spec.circles?.length) {
    const said = spec.circles.map((c) => (q ? `a circle${c.label ? ` labelled ${c.label}` : ''}` : `a circle with centre ${pointIn(fmt(c.a), fmt(c.b), notation ?? 'za')} and radius ${fmt(c.r)}`))
    text += `${spec.graphs?.length ? ',' : ' with'} ${sentence(said)}`
  }
  if (spec.inclination) text += `. The angle ${spec.inclination.label.trim()} between the line and the x-axis is marked${spec.points?.length ? '' : '.'}`
  if (spec.points?.length) {
    if (spec.polygon) text += `. The points are joined in order into a shape`
    if (q) {
      const named = spec.points.filter((p) => p.label).map((p) => p.label!)
      const rest = unlabelled(spec).length
      text += named.length ? `. Points: ${named.join(', ')}${rest ? ` and ${rest} more` : ''}.` : `. Points: ${rest} marked.`
    } else {
      text += `. Points: ${spec.points.map((p) => `${p.label ? `${p.label} ` : ''}${pointIn(fmt(p.x), fmt(p.y), notation ?? 'za')}`).join(', ')}.`
    }
  }
  return text
}

/** A number on an axis: dark, with a white halo so that it can be read over a line of the grid. */
function Num(p: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; size?: number; weight?: number; fill?: string; extra?: Record<string, string>; rich?: boolean; children: string }) {
  // A label with a fraction in it is a box of its own, with the same white halo.
  const stacked = p.rich ? fracLabel({ text: p.children, x: r1(p.x), y: r1(p.y), size: p.size ?? 12, weight: p.weight ?? 500, fill: p.fill ?? BODY, anchor: p.anchor, halo: true, attrs: p.extra }) : null
  if (stacked) return stacked
  return (
    <text
      x={r1(p.x)}
      y={r1(p.y)}
      fontSize={p.size ?? 12}
      fontWeight={p.weight ?? 500}
      textAnchor={p.anchor}
      fill={p.fill ?? BODY}
      stroke={WHITE}
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      {...p.extra}
    >
      {p.rich ? <Rich text={p.children} size={p.size ?? 12} /> : p.children}
    </text>
  )
}

const pathOf = (piece: Pt[], px: (x: number) => number, py: (y: number) => number) => piece.map((p, i) => `${i ? 'L' : 'M'}${r1(px(p.x))} ${r1(py(p.y))}`).join(' ')

/** About how wide one letter of a graph label is (bold, 14 px), with the halo: enough to keep the words inside the grid, not a measurement. */
const LABEL_LETTER = 8.7
const LABEL_HALO = 6
/**
 * Where the label of a graph goes: beside the end of the curve, inside the grid. It is first put to the right of the end (or to the left, near the right side), then moved so that all of its words are inside.
 * `nudge` moves it up (minus) or down, and `mirror` puts it on the other side of the end: the places to try when the first is taken (see `Spot`).
 */
function graphLabelAt(end: { x: number; y: number }, text: string, nudge = 0, mirror = false) {
  const left = LEFT + 3
  const right = LEFT + PLOT_W - 3
  const width = text.length * LABEL_LETTER + LABEL_HALO
  const flip = (end.x > LEFT + PLOT_W * 0.7 || end.x + 6 + width > right) !== mirror
  const x = flip ? Math.min(right, Math.max(left + width, end.x - 6)) : Math.max(left, end.x + 6)
  // A label with a raised part (x squared) keeps more room above it: the 2 stands higher than the line.
  const room = raisedLabel(text) ? 18 : 12
  const y = Math.min(TOP + PLOT_H - 4, Math.max(TOP + room, end.y + (end.y < TOP + 20 ? 14 : -8) + nudge))
  return { x, y, anchor: flip ? ('end' as const) : ('start' as const) }
}

// P134: a label is never drawn on top of the numbers of an axis, or of another label. Each label has a list of places (the one it always had first); it is
// drawn at the first of them that is clear and inside its limit (the first place of a graph label is inside the grid by its own rule, so it is not checked).
// The axis numbers and the labels are boxes of a rough size (see `labelWidth`). When no place is clear, the label keeps the first and the numbers under
// it are left out: the label wins (the place that covers least is taken).
type Spot = { x: number; y: number; anchor: Anchor }
const NUMBER_SIZE = 12
const LABEL_SIZE = 14
/** P141: the numbers of an axis count by 1, 2, 5, 10 ... steps (of the step of the grid) when every one would crowd the next. */
const COUNT_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
/** At most this many numbers are put to the test of crowding for an axis (a frame of a thousand steps starts from a count that has about this many). */
const MOST_TESTED = 60
/** The whole drawing, and the grid (the graph labels stay inside the grid). */
const DRAWING: Box = { l: 2, r: W - 2, t: 2, b: H - 2 }
const GRID_BOX: Box = { l: LEFT + 1, r: LEFT + PLOT_W - 1, t: TOP, b: TOP + PLOT_H }
const labelBox = (s: Spot, text: string): Box => boxOf(s.x, s.y, s.anchor, labelWidth(text, LABEL_SIZE) + 3, raisedLabel(text) ? 18 : 12, 4)
/** Rows to try above and below the first place, and the two sides of the end. */
const NUDGES = [0, -14, 14, -28, 28, -42, 42]

/**
 * Graphs on a grid. The model gives the frame, the graphs by their constants and a few points; this draws it all: a light grid, the axes with
 * numbers every `step` (at most 10 numbers an axis when the step is not given), x and y named at the ends. Each graph is sampled here, and a
 * curve is broken where it has no value or leaves the frame. The axes cross at the origin, or sit on the edge of the frame when it is not in it.
 */
export function CoordinatePlane(props: CoordinatePlaneProps) {
  const { xMin, xMax, yMin, yMax, variant = 'card' } = props
  const frame = { xMin, xMax, yMin, yMax }
  const px = (x: number) => LEFT + ((x - xMin) / (xMax - xMin)) * PLOT_W
  const py = (y: number) => TOP + ((yMax - y) / (yMax - yMin)) * PLOT_H
  const xAxisY = py(yMin > 0 ? yMin : yMax < 0 ? yMax : 0)
  const yAxisX = px(xMin > 0 ? xMin : xMax < 0 ? xMax : 0)
  const xTicks = ticksOf(xMin, xMax, defaultStep(xMin, xMax, props.step))
  // P198: the numbers along x of a grid marked in π: π/2, π, 3π/2.
  const xNumeral = (v: number) => (props.radians ? piText(v) : numeral(v, props.notation))
  const yTicks = ticksOf(yMin, yMax, defaultStep(yMin, yMax, props.step))
  const origin = xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0
  /** One id for each drawing, so that two planes on one page never share a clipPath. */
  const clipId = `${useId()}-plot`
  const graphs = (props.graphs ?? []).map((g, i) => {
    const pieces = sampleGraph(g, frame)
    const longest = pieces.reduce<Pt[] | null>((best, p) => (!best || p.length > best.length ? p : best), null)
    return { g, i, pieces, end: longest?.at(-1), colour: GRAPH[Math.min(i, GRAPH.length - 1)]! }
  })
  const points = (props.points ?? []).filter((p) => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax)

  // Where each label goes (P134): clear of the axis numbers and of the labels placed before it, graphs first.
  // P198: a number in π (3π/4) is written as plain text, as wide as its characters (the width of a label takes π over 4 as a stacked fraction).
  const numberWidth = (text: string) => (text.includes('\u03c0') ? [...text].length * NUMBER_SIZE * 0.72 : labelWidth(text, NUMBER_SIZE))
  const numberBox = (x: number, y: number, anchor: Anchor, text: string) => boxOf(x, y, anchor, numberWidth(text) + 2, 10, 3)
  // P141: the numbers of an axis that are written. A long axis counts by 2, 5, 10 ... steps of its grid (from 0): the first count at which no number is over another
  // number, over a number of the other axis, or over the 0 at the origin. The grid lines and the ticks stay at every step.
  const xGrid = defaultStep(xMin, xMax, props.step)
  const yGrid = defaultStep(yMin, yMax, props.step)
  const countOf = (v: number, grid: number) => Math.round(v / grid)
  const written = (ticks: number[], grid: number, every: number) => ticks.filter((v) => v !== 0 && countOf(v, grid) % every === 0)
  /** The box a number takes up when it is written (digits sit on the baseline: nothing hangs below it but the halo). */
  const crowdBox = (x: number, y: number, anchor: Anchor, text: string): Box => boxOf(x, y, anchor, numberWidth(text), 9, 2)
  /** Two numbers of one axis keep a pixel between them. */
  const apart = (b: Box): Box => ({ l: b.l - 0.5, r: b.r + 0.5, t: b.t - 0.5, b: b.b + 0.5 })
  const everyOf = (ticks: number[], grid: number) => COUNT_STEPS.find((k) => written(ticks, grid, k).length <= MOST_TESTED) ?? COUNT_STEPS[COUNT_STEPS.length - 1]!
  const crowded = (kx: number, ky: number): 'x' | 'y' | null => {
    const items = [
      ...written(xTicks, xGrid, kx).map((v) => ({ axis: 'x' as const, box: crowdBox(px(v), xAxisY + 17, 'middle', xNumeral(v)) })),
      ...written(yTicks, yGrid, ky).map((v) => ({ axis: 'y' as const, box: crowdBox(yAxisX - 7, py(v) + 4, 'end', numeral(v, props.notation)) })),
      ...(origin ? [{ axis: 'zero' as const, box: crowdBox(yAxisX - 7, xAxisY + 17, 'end', '0') }] : []),
    ]
    const nx = items.filter((i) => i.axis === 'x').length
    const ny = items.filter((i) => i.axis === 'y').length
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!
        const b = items[j]!
        if (!(a.axis === b.axis ? hits(apart(a.box), apart(b.box)) : hits(a.box, b.box))) continue
        if (a.axis === 'zero') return b.axis as 'x' | 'y'
        if (b.axis === 'zero') return a.axis as 'x' | 'y'
        return a.axis === b.axis ? (a.axis as 'x' | 'y') : nx >= ny ? 'x' : 'y'
      }
    }
    return null
  }
  let everyX = everyOf(xTicks, xGrid)
  let everyY = everyOf(yTicks, yGrid)
  const nextCount = (k: number) => COUNT_STEPS[COUNT_STEPS.indexOf(k) + 1] ?? k
  for (let guard = 0; guard < 40; guard++) {
    const c = crowded(everyX, everyY)
    if (!c) break
    const next = c === 'x' ? nextCount(everyX) : nextCount(everyY)
    if (next === (c === 'x' ? everyX : everyY)) break
    if (c === 'x') everyX = next
    else everyY = next
  }
  const xWritten = written(xTicks, xGrid, everyX)
  const yWritten = written(yTicks, yGrid, everyY)
  const numbers = [
    ...xWritten.map((v) => ({ key: `x${v}`, box: numberBox(px(v), xAxisY + 17, 'middle', xNumeral(v)) })),
    ...yWritten.map((v) => ({ key: `y${v}`, box: numberBox(yAxisX - 7, py(v) + 4, 'end', numeral(v, props.notation)) })),
    ...(origin ? [{ key: 'zero', box: numberBox(yAxisX - 7, xAxisY + 17, 'end', '0') }] : []),
  ]
  const taken: Box[] = []
  const hidden = new Set<string>()
  const settle = (text: string, spots: Spot[], limit: Box, checkFirst: boolean): Spot => {
    const covers = (s: Spot) => {
      const b = labelBox(s, text)
      return { numbers: numbers.filter((n) => hits(b, n.box)), labels: taken.filter((o) => hits(b, o)).length }
    }
    const inside = (s: Spot, i: number) => !(checkFirst || i > 0) || within(labelBox(s, text), limit)
    const clear = (s: Spot, i: number) => {
      const c = covers(s)
      return inside(s, i) && c.numbers.length === 0 && c.labels === 0
    }
    let at = spots.findIndex(clear)
    if (at < 0) {
      // No place is clear: the one that covers least (outside the limit counts most, then another label, then a number).
      const cost = (s: Spot, i: number) => {
        const c = covers(s)
        return (inside(s, i) ? 0 : 1000) + c.labels * 10 + c.numbers.length
      }
      at = spots.reduce((best, s, i) => (cost(s, i) < cost(spots[best]!, best) ? i : best), 0)
      for (const n of covers(spots[at]!).numbers) hidden.add(n.key)
    }
    const spot = spots[at]!
    taken.push(labelBox(spot, text))
    return spot
  }
  const graphSpot = new Map<number, Spot>()
  for (const { g, i, end } of graphs) {
    if (!g.label || !end) continue
    const e = { x: px(end.x), y: py(end.y) }
    const spots = NUDGES.flatMap((nudge) => [false, true].map((mirror) => graphLabelAt(e, g.label!, nudge, mirror)))
    graphSpot.set(i, settle(g.label, spots, GRID_BOX, false))
  }
  const pointSpot = new Map<number, Spot>()
  points.forEach((p, i) => {
    if (!p.label) return
    const near = px(p.x) > LEFT + PLOT_W - 44
    // The place it always had (above, to the right, or to the left near the right side), then the other side, then below the point, then further out.
    const spots = [-8, 16, -24, 28].flatMap((dy) =>
      (near ? [-8, 8] : [8, -8]).map((dx): Spot => ({ x: px(p.x) + dx, y: py(p.y) + dy, anchor: dx > 0 ? 'start' : 'end' })),
    )
    pointSpot.set(i, settle(p.label, spots, DRAWING, true))
  })

  // P195: the angle the first line makes with the x-axis: a red arc at the point where it crosses the x-axis, from the axis on the right up to the line, and its label.
  const inclination = (() => {
    const line = props.graphs?.find((g) => g.type === 'line')
    if (!props.inclination || !line || line.type !== 'line' || line.m === 0) return null
    const x0 = -line.c / line.m
    const cx = px(x0)
    const cy = py(0)
    // The angle on the screen, measured anticlockwise from the axis to the right (the plane may be stretched one way).
    const dx = px(x0 + 1) - cx
    const dy = cy - py(line.m)
    const screen = Math.atan2(dy, dx)
    const a = screen < 0 ? screen + Math.PI : screen
    const r = 30
    const end = { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }
    const mid = { x: cx + (r + 14) * Math.cos(a / 2), y: cy - (r + 14) * Math.sin(a / 2) }
    return (
      <g data-inclination="">
        <path d={`M${r1(cx + r)},${r1(cy)} A${r},${r} 0 0 0 ${r1(end.x)},${r1(end.y)}`} fill="none" stroke="#E03C31" strokeWidth={2.5} />
        <Num x={mid.x} y={mid.y + 5} anchor="middle" size={15} weight={700} fill="#B8281E">
          {props.inclination.label.trim()}
        </Num>
      </g>
    )
  })()

  return (
    <Svg width={W} height={H} label={describeCoordinatePlane(props, variant, props.notation)}>
      <defs>
        <clipPath id={clipId}>
          <rect x={LEFT} y={TOP} width={PLOT_W} height={PLOT_H} />
        </clipPath>
      </defs>
      <rect x={LEFT} y={TOP} width={PLOT_W} height={PLOT_H} fill={WHITE} stroke={GRID} strokeWidth={1} />
      {xTicks.map((v) => (
        <line key={`gx${v}`} data-grid="x" x1={r1(px(v))} y1={TOP} x2={r1(px(v))} y2={TOP + PLOT_H} stroke={GRID} strokeWidth={1} />
      ))}
      {yTicks.map((v) => (
        <line key={`gy${v}`} data-grid="y" x1={LEFT} y1={r1(py(v))} x2={LEFT + PLOT_W} y2={r1(py(v))} stroke={GRID} strokeWidth={1} />
      ))}
      <line data-axis-line="x" x1={LEFT} y1={r1(xAxisY)} x2={LEFT + PLOT_W} y2={r1(xAxisY)} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      <line data-axis-line="y" x1={r1(yAxisX)} y1={TOP} x2={r1(yAxisX)} y2={TOP + PLOT_H} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      {xTicks.filter((v) => v !== 0).map((v) => (
        <Line key={`tx${v}`} x1={r1(px(v))} y1={r1(xAxisY - 3)} x2={r1(px(v))} y2={r1(xAxisY + 3)} stroke={INK} w={1.4} />
      ))}
      {yTicks.filter((v) => v !== 0).map((v) => (
        <Line key={`ty${v}`} x1={r1(yAxisX - 3)} y1={r1(py(v))} x2={r1(yAxisX + 3)} y2={r1(py(v))} stroke={INK} w={1.4} />
      ))}
      {/* The graphs and the markers are clipped to the plot area, so that nothing is drawn past the grid (the end of a line is as wide as its stroke). */}
      <g clipPath={`url(#${clipId})`}>
        {/* P195: the points joined into a shape, under the graphs. */}
        {props.polygon && points.length >= 3 ? (
          <polygon data-polygon="" points={points.map((p) => `${r1(px(p.x))},${r1(py(p.y))}`).join(' ')} fill="#EAF2FF" stroke="#001489" strokeWidth={2.5} strokeLinejoin="round" />
        ) : null}
        {(props.circles ?? []).map((c, k) => (
          <ellipse
            key={`c${k}`}
            data-circle={k}
            cx={r1(px(c.a))}
            cy={r1(py(c.b))}
            rx={r1((c.r / (xMax - xMin)) * PLOT_W)}
            ry={r1((c.r / (yMax - yMin)) * PLOT_H)}
            fill="none"
            stroke="#001489"
            strokeWidth={2.8}
          />
        ))}
        {(props.circles ?? []).map((c, k) => (
          <circle key={`cc${k}`} cx={r1(px(c.a))} cy={r1(py(c.b))} r={3.5} fill="#001489" />
        ))}
        {graphs.map(({ i, pieces, colour }) => (
          <g key={`g${i}`}>
            {pieces.map((piece, k) => (
              <path
                key={k}
                data-graph={i}
                d={pathOf(piece, px, py)}
                fill="none"
                stroke={colour.stroke}
                strokeWidth={2.8}
                strokeDasharray={graphs[i]!.g.type === 'line' && (graphs[i]!.g as { dashed?: boolean }).dashed ? '7 5' : colour.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        ))}
        {points.map((p, i) => (
          <circle key={`p${i}`} data-point={i} cx={r1(px(p.x))} cy={r1(py(p.y))} r={4.8} fill={INK} stroke={WHITE} strokeWidth={1.6} />
        ))}
      </g>
      {inclination}
      {/* The numbers, the axis names and the labels are not clipped, and sit over the graphs (their white halo keeps them readable where a line crosses). */}
      {xWritten.filter((v) => !hidden.has(`x${v}`)).map((v) => (
        <Num key={`nx${v}`} x={px(v)} y={xAxisY + 17} anchor="middle" extra={{ 'data-tick': 'x' }}>{xNumeral(v)}</Num>
      ))}
      {yWritten.filter((v) => !hidden.has(`y${v}`)).map((v) => (
        <Num key={`ny${v}`} x={yAxisX - 7} y={py(v) + 4} anchor="end" extra={{ 'data-tick': 'y' }}>{numeral(v, props.notation)}</Num>
      ))}
      {origin && !hidden.has('zero') && (
        <Num x={yAxisX - 7} y={xAxisY + 17} anchor="end" extra={{ 'data-zero': '' }}>
          0
        </Num>
      )}
      <text data-axis="x" x={LEFT + PLOT_W + 9} y={r1(xAxisY + 5)} fontSize={15} fontStyle="italic" fontWeight={600} fill={INK} textAnchor="start">
        x
      </text>
      <text data-axis="y" x={r1(yAxisX)} y={TOP - 8} fontSize={15} fontStyle="italic" fontWeight={600} fill={INK} textAnchor="middle">
        y
      </text>
      {graphs.map(({ g, i, colour }) => {
        const at = graphSpot.get(i)
        if (!g.label || !at) return null
        return (
          <Num key={`gl${i}`} x={at.x} y={at.y} anchor={at.anchor} size={14} weight={700} fill={colour.text} rich extra={{ 'data-graph-label': String(i) }}>
            {g.label}
          </Num>
        )
      })}
      {points.map((p, i) => {
        const at = pointSpot.get(i)
        if (!p.label || !at) return null
        return (
          <Num key={`pl${i}`} x={at.x} y={at.y} anchor={at.anchor} size={14} weight={700} fill={INK} rich extra={{ 'data-point-label': String(i) }}>
            {p.label}
          </Num>
        )
      })}
    </Svg>
  )
}
