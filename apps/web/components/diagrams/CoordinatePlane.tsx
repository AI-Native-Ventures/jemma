import type { CoordinatePlaneSpec } from '@jemma/profiling/schemas'
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
function Num(p: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; size?: number; weight?: number; fill?: string; extra?: Record<string, string>; children: string }) {
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
      {p.children}
    </text>
  )
}

const pathOf = (piece: Pt[], px: (x: number) => number, py: (y: number) => number) => piece.map((p, i) => `${i ? 'L' : 'M'}${r1(px(p.x))} ${r1(py(p.y))}`).join(' ')

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

  return (
    <Svg width={W} height={H} label={describeCoordinatePlane(props, variant)}>
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
        <g key={`tx${v}`}>
          <Line x1={r1(px(v))} y1={r1(xAxisY - 3)} x2={r1(px(v))} y2={r1(xAxisY + 3)} stroke={INK} w={1.4} />
          <Num x={px(v)} y={xAxisY + 17} anchor="middle" extra={{ 'data-tick': 'x' }}>{numeral(v)}</Num>
        </g>
      ))}
      {yTicks.filter((v) => v !== 0).map((v) => (
        <g key={`ty${v}`}>
          <Line x1={r1(yAxisX - 3)} y1={r1(py(v))} x2={r1(yAxisX + 3)} y2={r1(py(v))} stroke={INK} w={1.4} />
          <Num x={yAxisX - 7} y={py(v) + 4} anchor="end" extra={{ 'data-tick': 'y' }}>{numeral(v)}</Num>
        </g>
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
      {(props.graphs ?? []).map((g, i) => {
        const colour = GRAPH[Math.min(i, GRAPH.length - 1)]!
        const pieces = sampleGraph(g, frame)
        const longest = pieces.reduce<Pt[] | null>((best, p) => (!best || p.length > best.length ? p : best), null)
        const end = longest?.at(-1)
        return (
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
            {g.label && end && (
              <Num
                x={px(end.x) + (px(end.x) > LEFT + PLOT_W * 0.7 ? -6 : 6)}
                y={Math.max(TOP + 12, py(end.y) + (py(end.y) < TOP + 20 ? 14 : -8))}
                anchor={px(end.x) > LEFT + PLOT_W * 0.7 ? 'end' : 'start'}
                size={14}
                weight={700}
                fill={colour.text}
                extra={{ 'data-graph-label': String(i) }}
              >
                {g.label}
              </Num>
            )}
          </g>
        )
      })}
      {(props.points ?? [])
        .filter((p) => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax)
        .map((p, i) => {
          const near = px(p.x) > LEFT + PLOT_W - 44
          return (
            <g key={`p${i}`}>
              <circle data-point={i} cx={r1(px(p.x))} cy={r1(py(p.y))} r={4.8} fill={INK} stroke={WHITE} strokeWidth={1.6} />
              {p.label && (
                <Num x={px(p.x) + (near ? -8 : 8)} y={py(p.y) - 8} anchor={near ? 'end' : 'start'} size={14} weight={700} fill={INK} extra={{ 'data-point-label': String(i) }}>
                  {p.label}
                </Num>
              )}
            </g>
          )
        })}
    </Svg>
  )
}
