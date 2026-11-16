import { useId } from 'react'
import type { CoordinatePlaneSpec } from '@jemma/profiling/schemas'
import { Rich, fracLabel, raisedLabel } from './math-label'
import { BODY, CORAL, CORAL_TEXT, INK, Line, Svg, WHITE, fmt, type Variant } from './shared'
import { defaultStep, graphEquation, sampleGraph, ticksOf, type Pt } from './plane-math'

export type CoordinatePlaneProps = CoordinatePlaneSpec & { variant?: Variant }

const W = 320
const H = 300
const LEFT = 40
const RIGHT = 24
const TOP = 24
const BOTTOM = 34
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = H - TOP - BOTTOM
const GRID = '#D7D5E4'
/** One colour for each of up to three graphs: coral, ink, and a grey one that is also dashed. */
const GRAPH = [
  { stroke: CORAL, text: CORAL_TEXT, dash: undefined },
  { stroke: INK, text: INK, dash: undefined },
  { stroke: BODY, text: BODY, dash: '7 5' },
] as const

const r1 = (n: number) => Math.round(n * 10) / 10
/** A negative number with a true minus sign, and the decimal comma of the app. */
const numeral = (v: number) => (v < 0 ? `−${fmt(-v)}` : fmt(v))
const unlabelled = (spec: CoordinatePlaneSpec) => spec.points?.filter((p) => !p.label) ?? []
const sentence = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? ''))
const kindOf = (g: NonNullable<CoordinatePlaneSpec['graphs']>[number]) => (g.type === 'line' ? 'line' : 'curve')

/**
 * The spoken description. On a card it says the equation of each graph and the coordinates of each point. In a question (`variant` "question")
 * the equation or a coordinate can be the very answer, so it only says what can be seen: a straight line, a curve, the labels.
 */
export function describeCoordinatePlane(spec: CoordinatePlaneSpec, variant: Variant = 'card') {
  const q = variant === 'question'
  const same = spec.xMin === spec.yMin && spec.xMax === spec.yMax
  let text = `A grid from ${fmt(spec.xMin)} to ${fmt(spec.xMax)}${same ? '' : ` across and from ${fmt(spec.yMin)} to ${fmt(spec.yMax)} up`}`
  if (spec.graphs?.length) {
    const parts = spec.graphs.map((g) =>
      q
        ? `${g.type === 'line' ? 'a straight line' : 'a curve'}${g.label ? ` labelled ${g.label}` : ''}`
        : `the ${kindOf(g)} ${graphEquation(g)}${g.label ? ` (${g.label})` : ''}`,
    )
    text += ` with ${sentence(parts)}`
  }
  if (spec.points?.length) {
    if (q) {
      const named = spec.points.filter((p) => p.label).map((p) => p.label!)
      const rest = unlabelled(spec).length
      text += named.length ? `. Points: ${named.join(', ')}${rest ? ` and ${rest} more` : ''}.` : `. Points: ${rest} marked.`
    } else {
      text += `. Points: ${spec.points.map((p) => `${p.label ? `${p.label} ` : ''}(${fmt(p.x)}; ${fmt(p.y)})`).join(', ')}.`
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
/** Where the label of a graph goes: beside the end of the curve, inside the grid. It is first put to the right of the end (or to the left, near the right side), then moved so that all of its words are inside. */
function graphLabelAt(end: { x: number; y: number }, text: string) {
  const left = LEFT + 3
  const right = LEFT + PLOT_W - 3
  const width = text.length * LABEL_LETTER + LABEL_HALO
  const flip = end.x > LEFT + PLOT_W * 0.7 || end.x + 6 + width > right
  const x = flip ? Math.min(right, Math.max(left + width, end.x - 6)) : Math.max(left, end.x + 6)
  // A label with a raised part (x squared) keeps more room above it: the 2 stands higher than the line.
  const room = raisedLabel(text) ? 18 : 12
  const y = Math.min(TOP + PLOT_H - 4, Math.max(TOP + room, end.y + (end.y < TOP + 20 ? 14 : -8)))
  return { x, y, anchor: flip ? ('end' as const) : ('start' as const) }
}

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

  return (
    <Svg width={W} height={H} label={describeCoordinatePlane(props, variant)}>
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
                strokeDasharray={colour.dash}
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
      {/* The numbers, the axis names and the labels are not clipped, and sit over the graphs (their white halo keeps them readable where a line crosses). */}
      {xTicks.filter((v) => v !== 0).map((v) => (
        <Num key={`nx${v}`} x={px(v)} y={xAxisY + 17} anchor="middle" extra={{ 'data-tick': 'x' }}>{numeral(v)}</Num>
      ))}
      {yTicks.filter((v) => v !== 0).map((v) => (
        <Num key={`ny${v}`} x={yAxisX - 7} y={py(v) + 4} anchor="end" extra={{ 'data-tick': 'y' }}>{numeral(v)}</Num>
      ))}
      {origin && (
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
      {graphs.map(({ g, i, end, colour }) => {
        if (!g.label || !end) return null
        const at = graphLabelAt({ x: px(end.x), y: py(end.y) }, g.label)
        return (
          <Num key={`gl${i}`} x={at.x} y={at.y} anchor={at.anchor} size={14} weight={700} fill={colour.text} rich extra={{ 'data-graph-label': String(i) }}>
            {g.label}
          </Num>
        )
      })}
      {points.map((p, i) => {
        if (!p.label) return null
        const near = px(p.x) > LEFT + PLOT_W - 44
        return (
          <Num key={`pl${i}`} x={px(p.x) + (near ? -8 : 8)} y={py(p.y) - 8} anchor={near ? 'end' : 'start'} size={14} weight={700} fill={INK} rich extra={{ 'data-point-label': String(i) }}>
            {p.label}
          </Num>
        )
      })}
    </Svg>
  )
}
