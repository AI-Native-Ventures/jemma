'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { blankBars, graphTop, graphUnit, snapGraphValue, GRAPH_MAX_PICTURES } from '@jemma/profiling/logic'
import type { DataGraphSpec } from '@jemma/profiling/schemas'
import { BODY, EDGE, GOLD, GREEN, INK, SOFT_3, WHITE, fmt } from '@/components/diagrams/shared'

// P167: a graph of data the learner draws, from the "Draw a graph of data" board. A bar graph: each empty bar has a handle the learner drags up, and the bar
// stops on the lines of the scale (or the arrow keys move it, one line at a time). A picture graph: + adds a picture to an empty row and a tap on a picture
// takes one off; each picture stands for `per`. The same drawing is the paper sheet (an empty bar is a "?") and the results (the right bar in green, and the
// learner's bar dashed beside it when it was not right).

export type GraphMode = 'answer' | 'paper' | 'results'

export type DataGraphProps = {
  graph: DataGraphSpec
  /** The values of the empty bars, in order: what the learner drew so far (answer), or what they drew (results). Null: not drawn. */
  values: (number | null)[]
  mode: GraphMode
  /** results: the right values of the empty bars, in order. */
  right?: number[]
  /** answer: a bar or a row was set to a value. `blank` is its place among the empty bars. */
  onSet?: (blank: number, value: number | null) => void
}

const GREEN_TINT = '#DDEFE6'
/** The bar graph: 320 x 236, the scale from y 46 (the top) to y 206 (0), the bars between x 44 and 312. */
const W = 320
const H = 236
const X0 = 44
const X1 = 312
const TOP = 46
const BASE = 206

export function DataGraph(props: DataGraphProps) {
  return props.graph.kind === 'pictures' ? <PictureGraph {...props} /> : <BarGraph {...props} />
}

/** The words a screen reader says for the whole graph: the given bars with their numbers, and the empty ones. */
export function describeDataGraph(graph: DataGraphSpec, values: (number | null)[]): string {
  const blanks = blankBars(graph)
  const parts = graph.bars.map((b, i) => {
    const k = blanks.indexOf(i)
    if (k < 0) return `${b.label} ${fmt(b.value ?? 0)}`
    const v = values[k]
    return v === null || v === undefined ? `${b.label} not drawn yet` : `${b.label} ${fmt(v)}, drawn`
  })
  return `${graph.kind === 'pictures' ? 'Picture graph' : 'Bar graph'}${graph.counts ? ` of ${graph.counts}` : ''}: ${parts.join(', ')}.`
}

// ---- The bar graph -------------------------------------------------------------------------------------------------------------------

function Grip({ cx, y, w, focused }: { cx: number; y: number; w: number; focused: boolean }) {
  const gw = Math.min(44, w + 4)
  return (
    <g data-grip="">
      {focused ? <rect x={cx - gw / 2 - 4} y={y - 11} width={gw + 8} height={22} rx={11} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="3 3" /> : null}
      <rect x={cx - gw / 2} y={y - 7} width={gw} height={14} rx={7} fill={GOLD} stroke={INK} strokeWidth={1.6} />
      <line x1={cx - 6} y1={y - 2} x2={cx + 6} y2={y - 2} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <line x1={cx - 6} y1={y + 2} x2={cx + 6} y2={y + 2} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
    </g>
  )
}

function BarGraph({ graph, values, mode, right, onSet }: DataGraphProps) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const unit = graphUnit(graph)
  const top = graphTop(graph) || unit
  const lines = Math.max(1, Math.round(top / unit))
  const u = (BASE - TOP) / lines
  const labelEvery = lines <= 10 ? 1 : 2
  const heightOf = (v: number) => (Math.max(0, Math.min(top, v)) / unit) * u
  const n = Math.max(1, graph.bars.length)
  const slot = (X1 - X0 - 8) / n
  const bw = Math.min(44, Math.floor(slot * 0.62))
  const cx = (i: number) => X0 + 4 + slot * (i + 0.5)
  const nameSize = n <= 4 ? 13 : n <= 6 ? 12 : 11
  const blanks = blankBars(graph)

  /** The value under a finger: where it is on the scale, held to a line. Null when the drawing has no size (no screen). */
  const valueAt = (clientY: number): number | null => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.height <= 0) return null
    const y = ((clientY - box.top) / box.height) * H
    return snapGraphValue(graph, ((BASE - y) / u) * unit)
  }
  const down = (k: number) => (e: PointerEvent<SVGRectElement>) => {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A pointer that is gone already: the bar still moves to where it went down.
    }
    dragging.current = k
    const v = valueAt(e.clientY)
    if (v !== null) onSet?.(k, v)
  }
  const move = (k: number) => (e: PointerEvent<SVGRectElement>) => {
    if (dragging.current !== k) return
    const v = valueAt(e.clientY)
    if (v !== null) onSet?.(k, v)
  }
  const up = () => {
    dragging.current = null
  }
  const key = (k: number) => (e: KeyboardEvent<SVGGElement>) => {
    const v = values[k] ?? null
    const next =
      e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? Math.min(top, (v ?? 0) + unit)
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
          ? Math.max(0, (v ?? unit) - unit)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? top
              : null
    if (next === null) return
    e.preventDefault()
    onSet?.(k, next)
  }

  return (
    <svg
      ref={svg}
      data-graph="bars"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="group"
      aria-label={describeDataGraph(graph, values)}
      style={{ display: 'block', maxWidth: W, height: 'auto', fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif", userSelect: 'none' }}
    >
      {graph.counts ? (
        <text x={8} y={22} fontSize={11} fontWeight={600} fill={BODY} textAnchor="start">
          {graph.counts}
        </text>
      ) : null}
      {Array.from({ length: lines + 1 }, (_, v) => {
        const y = BASE - v * u
        return (
          <g key={`l${v}`}>
            <line x1={X0} y1={y} x2={X1} y2={y} stroke={v === 0 ? INK : '#ECE9E2'} strokeWidth={v === 0 ? 1.6 : 1} />
            {v % labelEvery === 0 ? (
              <text data-scale="" x={X0 - 8} y={y + 4} fontSize={11} fontWeight={500} fill={BODY} textAnchor="end">
                {fmt(v * unit)}
              </text>
            ) : null}
          </g>
        )
      })}
      <line x1={X0} y1={BASE} x2={X0} y2={TOP - 8} stroke={INK} strokeWidth={1.6} />
      {graph.bars.map((b, i) => {
        const x = cx(i)
        const k = blanks.indexOf(i)
        const name = (
          <text x={x} y={BASE + 20} fontSize={nameSize} fontWeight={600} fill={INK} textAnchor="middle">
            {b.label}
          </text>
        )
        if (k < 0) {
          const h = heightOf(b.value ?? 0)
          return (
            <g key={i} data-bar="given">
              <rect x={x - bw / 2} y={BASE - h} width={bw} height={h} fill={SOFT_3} stroke={INK} strokeWidth={1.6} />
              {name}
            </g>
          )
        }
        const v = values[k] ?? null
        if (mode === 'paper') {
          return (
            <g key={i} data-bar="blank">
              <rect x={x - bw / 2} y={TOP} width={bw} height={BASE - TOP} fill="none" stroke={EDGE} strokeWidth={1.6} strokeDasharray="5 4" />
              <text x={x} y={BASE - 12} fontSize={18} fontWeight={700} fill={BODY} textAnchor="middle">
                ?
              </text>
              {name}
            </g>
          )
        }
        if (mode === 'results') {
          const r = right?.[k] ?? 0
          const rh = heightOf(r)
          const missed = v !== null && v !== r
          return (
            <g key={i} data-bar="checked">
              <rect data-right="" x={x - bw / 2} y={BASE - rh} width={bw} height={rh} fill={GREEN_TINT} stroke={GREEN} strokeWidth={2.5} />
              {missed ? (
                <>
                  <rect data-yours="" x={x - bw / 2} y={BASE - heightOf(v)} width={bw} height={heightOf(v)} fill="none" stroke={BODY} strokeWidth={2} strokeDasharray="5 4" />
                  <text x={x - bw / 2 - 5} y={BASE - heightOf(v) + 4} fontSize={11} fontWeight={600} fill={BODY} textAnchor="end">
                    yours
                  </text>
                </>
              ) : null}
              {name}
            </g>
          )
        }
        const h = v === null ? 0 : heightOf(v)
        return (
          <g key={i} data-bar="draw">
            {v === null ? (
              <path d={`M${x - 7},${BASE - 22} l7,-7 l7,7`} fill="none" stroke={BODY} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <rect data-drawn="" x={x - bw / 2} y={BASE - h} width={bw} height={h} fill={GOLD} stroke={INK} strokeWidth={1.6} />
            )}
            <g
              role="slider"
              tabIndex={0}
              aria-label={`Bar for ${b.label}`}
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={top}
              aria-valuenow={v ?? 0}
              aria-valuetext={v === null ? 'not drawn yet' : fmt(v)}
              onKeyDown={key(k)}
              onFocus={() => setFocused(k)}
              onBlur={() => setFocused((f) => (f === k ? null : f))}
              style={{ outline: 'none' }}
            >
              <Grip cx={x} y={BASE - h} w={bw} focused={focused === k} />
            </g>
            {/* The whole column is the place to touch: a finger anywhere in it sets the bar, and dragging moves it. */}
            <rect
              data-touch=""
              x={x - slot / 2}
              y={TOP - 14}
              width={slot}
              height={BASE - TOP + 28}
              fill={WHITE}
              fillOpacity={0}
              style={{ touchAction: 'none', cursor: 'ns-resize' }}
              onPointerDown={down(k)}
              onPointerMove={move(k)}
              onPointerUp={up}
              onPointerCancel={up}
            />
            {name}
          </g>
        )
      })}
    </svg>
  )
}

// ---- The picture graph ---------------------------------------------------------------------------------------------------------------

/** One picture of a picture graph: a round fruit with a leaf. Gold when it is drawn or given, green with an outline in the results. */
function Picture({ tone = 'gold', size = 24 }: { tone?: 'gold' | 'right' | 'yours'; size?: number }) {
  const fill = tone === 'gold' ? GOLD : tone === 'right' ? GREEN_TINT : 'none'
  const stroke = tone === 'right' ? GREEN : tone === 'yours' ? BODY : INK
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="block flex-none">
      <circle cx={12} cy={14} r={9} fill={fill} stroke={stroke} strokeWidth={tone === 'right' ? 2 : 1.6} strokeDasharray={tone === 'yours' ? '3 2.5' : undefined} />
      <line x1={12} y1={5} x2={13.5} y2={1.8} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      {tone === 'yours' ? null : <ellipse cx={17} cy={3.6} rx={3.6} ry={1.9} fill={GREEN} transform="rotate(-25 17 3.6)" />}
    </svg>
  )
}

/** One place in a row of pictures: 26 px wide (7 pictures and the + fit a phone), as tall as a touch target. A tap anywhere on a row's pictures takes one off. */
const CELL = 'flex h-11 w-[26px] flex-none items-center justify-center'

function PictureGraph({ graph, values, mode, right, onSet }: DataGraphProps) {
  const per = graphUnit(graph)
  const blanks = blankBars(graph)
  const count = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Math.max(0, Math.round(v / per)))
  const set = (k: number, pictures: number) => onSet?.(k, pictures > 0 ? Math.min(GRAPH_MAX_PICTURES, pictures) * per : null)
  return (
    <div data-graph="pictures" role="group" aria-label={describeDataGraph(graph, values)} className="flex w-full max-w-[320px] flex-col gap-1.5 self-center">
      {graph.bars.map((b, i) => {
        const k = blanks.indexOf(i)
        const given = k < 0
        const drawn = given ? count(b.value) : count(values[k])
        return (
          <div key={i} data-row={given ? 'given' : 'blank'} className="flex min-h-12 items-center gap-2 border-b border-line py-1">
            <span className="w-16 flex-none text-[15px] leading-[1.2] font-semibold break-words">{b.label}</span>
            <span className="flex flex-1 flex-wrap items-center">
              {given ? (
                Array.from({ length: drawn }, (_, p) => (
                  <span key={p} className={CELL}>
                    <Picture size={22} />
                  </span>
                ))
              ) : mode === 'paper' ? (
                <span className="flex h-9 w-12 items-center justify-center rounded-12 border-2 border-dashed border-edge text-[18px] font-bold text-body">?</span>
              ) : mode === 'results' ? (
                <PictureResult right={count(right?.[k])} yours={values[k] === null || values[k] === undefined ? null : count(values[k])} />
              ) : (
                <>
                  {Array.from({ length: drawn }, (_, p) => (
                    <button
                      key={p}
                      type="button"
                      aria-label={`Take a picture off ${b.label}`}
                      onClick={() => set(k, drawn - 1)}
                      className={`${CELL} cursor-pointer rounded-12 border-0 bg-transparent p-0`}
                    >
                      <Picture size={22} />
                    </button>
                  ))}
                  {drawn < GRAPH_MAX_PICTURES ? (
                    <button
                      type="button"
                      aria-label={`Add a picture to ${b.label}`}
                      onClick={() => set(k, drawn + 1)}
                      className="ml-1 flex size-11 cursor-pointer items-center justify-center rounded-pill border-2 border-dashed border-green bg-green-tint p-0 text-[24px] leading-none font-bold text-green"
                    >
                      +
                    </button>
                  ) : null}
                </>
              )}
            </span>
          </div>
        )
      })}
      <p className="m-0 flex items-center gap-2 pt-1 text-[15px] font-semibold text-body">
        <Picture size={22} />
        <span>
          = {fmt(per)} {graph.counts ?? ''}
        </span>
      </p>
    </div>
  )
}

/** The results of one row: the right pictures in green, and under them the learner's, dashed, when there were not as many. */
function PictureResult({ right, yours }: { right: number; yours: number | null }) {
  return (
    <span className="flex flex-col gap-1">
      <span data-right={right} className="flex flex-wrap items-center">
        {Array.from({ length: right }, (_, p) => (
          <span key={p} className={CELL}>
            <Picture tone="right" size={22} />
          </span>
        ))}
      </span>
      {yours !== null && yours !== right ? (
        <span data-yours={yours} className="flex flex-wrap items-center gap-1 text-[12px] font-semibold text-body">
          {Array.from({ length: yours }, (_, p) => <Picture key={p} tone="yours" size={18} />)}
          <span className="ml-1">yours</span>
        </span>
      ) : null}
    </span>
  )
}
