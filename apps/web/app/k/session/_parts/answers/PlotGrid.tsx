'use client'

import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { CURVE_NAME, curveThrough, curveWords, plotAnswer, sameCurve, sketchCurve, sketchName, turningPoints, type Curve } from '@jemma/profiling/logic'
import type { PlotSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GREEN, INK, WHITE } from '@/components/diagrams/shared'

// P171: points placed on a grid, from the "Plot points on a grid" board (on the grid of the v1 design). A tap on the grid places the next point on the nearest
// corner; a tap on a placed point picks it, and the next tap moves it. Undo takes the last point off. When every point of a shape is placed, they are joined
// with a dashed line. The results draw the right points (and shape) in green, and a point the learner placed somewhere else dashed beside it.
//
// P176: a sketch ("Sketch a graph" board): the learner taps 3 key points of a parabola in any order, each written where it is ("(−2 ; 0)"), and Jemma joins
// them into the curve. The results draw the right graph in green with its turning point, and the learner's graph dashed, turning where it turned.
// P181: a hyperbola (3 points; its asymptotes are drawn dashed) and a cubic graph (4 points; its turning points are marked) are sketched the same way.

const GOLD_TINT = '#FFEDC6'
const GREEN_TINT = '#DDEFE6'
const GRID = '#ECE9E2'
const W = 320
const M = 26

type Point = { x: number; y: number }

/** The size of a square and of the drawing, so the grid fits 320 across and at most 300 up. */
function geometry(p: PlotSpec) {
  const sx = p.xMax - p.xMin
  const sy = p.yMax - p.yMin
  const u = Math.min((W - 2 * M) / sx, (300 - 2 * M) / sy)
  const left = (W - sx * u) / 2
  const H = sy * u + 2 * M
  return { u, H, X: (x: number) => left + (x - p.xMin) * u, Y: (y: number) => M + (p.yMax - y) * u }
}

const name = (p: Point) => `(${p.x}; ${p.y})`

export type PlotGridProps = {
  plot: PlotSpec
  mode: 'answer' | 'paper' | 'results'
  /** The points placed so far (answer) or placed (results), in the order of `place`. */
  points?: (Point | null)[]
  right?: Point[]
  picked?: number | null
  /** A sketch: the point placed last, the one still written once the curve is drawn. */
  last?: number | null
  onTap?: (pt: Point) => void
  onPick?: (i: number) => void
}

/** The curve through the placed points of a sketch, or null while one is not placed or when they make none. */
export const sketchOf = (plot: PlotSpec, points: (Point | null)[]): Curve | null =>
  plot.curve && points.length > 0 && points.every((q) => q !== null) ? curveThrough(plot.curve, points as Point[]) : null

export function PlotGrid({ plot, mode, points = [], right = [], picked = null, last = null, onTap, onPick }: PlotGridProps) {
  const svg = useRef<SVGSVGElement>(null)
  const { u, H, X, Y } = geometry(plot)
  const every = Math.max(plot.xMax - plot.xMin, plot.yMax - plot.yMin) > 12 ? 2 : 1
  const given = plot.given ?? []
  const tap = (e: MouseEvent<SVGSVGElement>) => {
    if (mode !== 'answer' || !svg.current) return
    const box = svg.current.getBoundingClientRect()
    if (box.width <= 0) return
    const vx = ((e.clientX - box.left) / box.width) * W
    const vy = ((e.clientY - box.top) / box.height) * H
    const x = Math.round(plot.xMin + (vx - X(plot.xMin)) / u)
    const y = Math.round(plot.yMax - (vy - M) / u)
    if (x < plot.xMin || x > plot.xMax || y < plot.yMin || y > plot.yMax) return
    onTap?.({ x, y })
  }
  const lines: ReactNode[] = []
  for (let x = plot.xMin; x <= plot.xMax; x++) lines.push(<line key={`vx${x}`} x1={X(x)} y1={Y(plot.yMin)} x2={X(x)} y2={Y(plot.yMax)} stroke={GRID} strokeWidth={1} />)
  for (let y = plot.yMin; y <= plot.yMax; y++) lines.push(<line key={`hy${y}`} x1={X(plot.xMin)} y1={Y(y)} x2={X(plot.xMax)} y2={Y(y)} stroke={GRID} strokeWidth={1} />)
  const axisY = plot.yMin <= 0 && plot.yMax >= 0 ? 0 : plot.yMin
  const axisX = plot.xMin <= 0 && plot.xMax >= 0 ? 0 : plot.xMin
  const ticks: ReactNode[] = []
  for (let x = plot.xMin; x <= plot.xMax; x++)
    if (x !== axisX && x % every === 0)
      ticks.push(<text key={`tx${x}`} x={X(x)} y={Y(axisY) + 14} fontSize={10} fill={BODY} textAnchor="middle">{x < 0 ? `−${-x}` : x}</text>)
  for (let y = plot.yMin; y <= plot.yMax; y++)
    if (y !== axisY && y % every === 0)
      ticks.push(<text key={`ty${y}`} x={X(axisX) - 5} y={Y(y) + 3.5} fontSize={10} fill={BODY} textAnchor="end">{y < 0 ? `−${-y}` : y}</text>)
  const poly = (pts: Point[]) => pts.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')
  const placed = points.filter((q): q is Point => q !== null)
  const joined = plot.shape && given.length === plot.place.length && placed.length === plot.place.length
  const label = (q: Point, text: string, color: string, k: string) => (
    <text key={k} x={X(q.x) + 9} y={Y(q.y) - 8} fontSize={13} fontWeight={700} fill={color} textAnchor="start">{text}</text>
  )
  // P176: a sketch writes where each point is, away from the middle of the grid (a point on the left has its words on its left), unless they would not fit.
  // Once the curve is drawn the words go on the outside of it: under the point when it opens up, over it when it opens down. A white edge keeps them clear
  // of the lines under them.
  const sketch = plot.curve !== undefined
  const where = (q: Point, color: string, k: string, under = false) => {
    const text = sketchName(q)
    const wide = text.length * 7.4
    const x = X(q.x)
    let left = q.x < (plot.xMin + plot.xMax) / 2
    if (left && x - 10 - wide < 2) left = false
    else if (!left && x + 10 + wide > W - 2) left = true
    const y = under && Y(q.y) + 24 <= H - 2 ? Y(q.y) + 24 : Y(q.y) - 12
    return (
      <text key={k} x={x + (left ? -10 : 10)} y={y} fontSize={13} fontWeight={700} fill={color} textAnchor={left ? 'end' : 'start'} stroke={WHITE} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">
        {text}
      </text>
    )
  }
  const curve = (c: Curve, color: string, width: number, k: string, dash?: string) =>
    sketchCurve(plot, c).map((piece, i) => (
      <polyline key={`${k}${i}`} data-curve={k} points={poly(piece)} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" />
    ))
  const inside = (q: Point) => q.x >= plot.xMin && q.x <= plot.xMax && q.y >= plot.yMin && q.y <= plot.yMax
  // P181: the asymptotes of a hyperbola, thin and dashed, where they cross the grid.
  const asymptotes = (c: Curve, color: string, k: string) => {
    if (c.kind !== 'hyperbola') return null
    const { p, q } = c.f
    return (
      <g data-asymptotes={k}>
        {p > plot.xMin && p < plot.xMax ? <line x1={X(p)} y1={Y(plot.yMin)} x2={X(p)} y2={Y(plot.yMax)} stroke={color} strokeWidth={1.6} strokeDasharray="5 4" /> : null}
        {q > plot.yMin && q < plot.yMax ? <line x1={X(plot.xMin)} y1={Y(q)} x2={X(plot.xMax)} y2={Y(q)} stroke={color} strokeWidth={1.6} strokeDasharray="5 4" /> : null}
      </g>
    )
  }
  const mine = sketch ? sketchOf(plot, points) : null
  const theRight = sketch && plot.curve && right.length === plot.place.length ? curveThrough(plot.curve, right) : null
  const same = mine && theRight ? sameCurve(mine, theRight) : false
  // Where the learner's "yours" goes: their curve's first turning point on the grid, or where its asymptotes cross.
  const yoursAt = (c: Curve): Point | null => (c.kind === 'hyperbola' ? (inside({ x: c.f.p, y: c.f.q }) ? { x: c.f.p, y: c.f.q } : null) : (turningPoints(c).find(inside) ?? null))
  const opensUp = (c: Curve) => c.kind === 'parabola' && c.f.a > 0
  return (
    <svg
      ref={svg}
      data-plot={mode}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="group"
      aria-label={`A grid from ${plot.xMin} to ${plot.xMax} across and from ${plot.yMin} to ${plot.yMax} up${given.length ? `, with ${given.map((q) => `${q.label.trim()} at ${name(q)}`).join(', ')}` : ''}.${
        sketch && mode === 'answer' && placed.length ? ` Points at ${placed.map(sketchName).join(', ')}.${mine ? ` Joined into a graph that ${curveWords(mine)}.` : ''}` : ''
      }`}
      onClick={tap}
      style={{ display: 'block', maxWidth: W, height: 'auto', cursor: mode === 'answer' ? 'crosshair' : 'default', userSelect: 'none', fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      {lines}
      <line x1={X(plot.xMin)} y1={Y(axisY)} x2={X(plot.xMax)} y2={Y(axisY)} stroke={INK} strokeWidth={1.6} />
      <line x1={X(axisX)} y1={Y(plot.yMin)} x2={X(axisX)} y2={Y(plot.yMax)} stroke={INK} strokeWidth={1.6} />
      <text x={X(plot.xMax) + 8} y={Y(axisY) + 4} fontSize={12} fontWeight={700} fill={INK}>x</text>
      <text x={X(axisX)} y={Y(plot.yMax) - 8} fontSize={12} fontWeight={700} fill={INK} textAnchor="middle">y</text>
      {ticks}
      {plot.shape && given.length >= 3 ? <polygon points={poly(given)} fill={mode === 'results' ? '#F3F1EC' : GOLD_TINT} stroke={mode === 'results' ? BODY : INK} strokeWidth={2} /> : null}
      {given.map((q, i) => (
        <g key={`g${i}`}>
          <circle cx={X(q.x)} cy={Y(q.y)} r={4.5} fill={INK} />
          {label(q, q.label.trim(), INK, `gl${i}`)}
        </g>
      ))}
      {mode === 'results' && sketch ? (
        <>
          {theRight ? asymptotes(theRight, GREEN, 'right') : null}
          {theRight ? curve(theRight, GREEN, 3, 'right') : null}
          {theRight ? turningPoints(theRight).filter(inside).map((t, i) => <circle key={`rt${i}`} data-right="" cx={X(t.x)} cy={Y(t.y)} r={6} fill={GREEN} />) : null}
          {mine && !same ? (
            <g data-yours="">
              {asymptotes(mine, BODY, 'yours')}
              {curve(mine, BODY, 2.4, 'yours', '6 5')}
              {(() => {
                const top = yoursAt(mine)
                if (!top) return null
                return (
                  <>
                    <circle cx={X(top.x)} cy={Y(top.y)} r={8} fill="none" stroke={BODY} strokeWidth={2} strokeDasharray="3 3" />
                    <text x={X(top.x) + 12} y={Y(top.y) - 6} fontSize={12} fontWeight={600} fill={BODY} stroke={WHITE} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">yours</text>
                  </>
                )
              })()}
            </g>
          ) : null}
          {!mine && placed.length > 0 ? (
            <g data-yours="">
              {placed.map((q, i) => (
                <circle key={`ny${i}`} cx={X(q.x)} cy={Y(q.y)} r={8} fill="none" stroke={BODY} strokeWidth={2} strokeDasharray="3 3" />
              ))}
              <text x={X(placed[0]!.x) + 12} y={Y(placed[0]!.y) - 10} fontSize={12} fontWeight={600} fill={BODY} stroke={WHITE} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">yours</text>
            </g>
          ) : null}
        </>
      ) : null}
      {mode === 'results' && !sketch ? (
        <>
          {plot.shape && right.length >= 3 ? <polygon points={poly(right)} fill={GREEN_TINT} stroke={GREEN} strokeWidth={2.5} /> : null}
          {right.map((q, i) => (
            <g key={`r${i}`} data-right="">
              <circle cx={X(q.x)} cy={Y(q.y)} r={6} fill={GREEN} />
              {label(q, plot.place[i]!.trim(), GREEN, `rl${i}`)}
            </g>
          ))}
          {points.map((q, i) =>
            q && right[i] && (q.x !== right[i]!.x || q.y !== right[i]!.y) ? (
              <g key={`y${i}`} data-yours="">
                <circle cx={X(q.x)} cy={Y(q.y)} r={9} fill="none" stroke={BODY} strokeWidth={2} strokeDasharray="3 3" />
                <text x={X(q.x) + 12} y={Y(q.y) - 8} fontSize={12} fontWeight={600} fill={BODY}>yours</text>
              </g>
            ) : null,
          )}
        </>
      ) : null}
      {mode === 'answer' ? (
        <>
          {joined ? <polygon points={poly(points as Point[])} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="6 4" /> : null}
          {mine ? asymptotes(mine, GOLD, 'drawn') : null}
          {mine ? curve(mine, GOLD, 3.5, 'drawn') : null}
          {points.map((q, i) =>
            q ? (
              <g
                key={`p${i}`}
                data-placed={i}
                onClick={(e) => {
                  e.stopPropagation()
                  onPick?.(i)
                }}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={X(q.x)} cy={Y(q.y)} r={14} fill={WHITE} fillOpacity={0} />
                {picked === i ? <circle cx={X(q.x)} cy={Y(q.y)} r={11} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="3 3" /> : null}
                <circle cx={X(q.x)} cy={Y(q.y)} r={7} fill={GOLD} stroke={INK} strokeWidth={2} />
                {!sketch ? label(q, plot.place[i]!.trim(), '#B8281E', `pl${i}`) : !mine ? where(q, '#B8281E', `pl${i}`) : i === (picked ?? last) ? where(q, '#B8281E', `pl${i}`, opensUp(mine)) : null}
              </g>
            ) : null,
          )}
        </>
      ) : null}
    </svg>
  )
}

const textButton = 'flex min-h-11 cursor-pointer items-center self-center border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'

/** The line under the grid: the point to place next, then what was placed. It never says whether a point is right. */
export function plotHint(plot: PlotSpec, points: (Point | null)[], last: number | null): ReactNode {
  const next = points.findIndex((q) => q === null)
  const names = plot.place.map((n) => n.trim())
  if (next < 0) {
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    return <>You placed <strong className="font-bold text-ink">{list}</strong>. Tap a point to move it.</>
  }
  if (last === null || !points[last]) return `Tap the grid to place ${names[next]}.`
  return (
    <>
      You placed <strong className="font-bold text-ink">{names[last]}</strong> at <strong className="font-bold text-ink">{name(points[last]!)}</strong>. Now {names[next]}.
    </>
  )
}

/** P176: the line under a sketch: the points placed so far and how many are still to place, then that Jemma joined them. It never says whether they are right. */
export function sketchHint(points: (Point | null)[], plot?: PlotSpec): ReactNode {
  const placed = points.filter((q): q is Point => q !== null)
  if (placed.length === 0) return 'Tap the grid to place a point.'
  const left = points.length - placed.length
  if (left > 0) {
    const list = placed.map((q, i) => (
      <span key={i}>
        {i > 0 ? (i === placed.length - 1 ? ' and ' : ', ') : null}
        <strong className="font-bold text-ink">{sketchName(q)}</strong>
      </span>
    ))
    return <>You placed {list}. {left === 1 ? 'One more point to go.' : `${['Two', 'Three'][left - 2] ?? left} more points to go.`}</>
  }
  const spec: PlotSpec = plot ?? { xMin: 0, xMax: 1, yMin: 0, yMax: 1, place: points.map(() => ''), curve: 'parabola' }
  return sketchOf(spec, points) ? (
    <>Jemma joined your <strong className="font-bold text-ink">{placed.length}</strong> points into a graph. Tap a point to move it.</>
  ) : (
    `Jemma cannot join these ${placed.length} points into a ${CURVE_NAME[spec.curve ?? 'parabola']}. Tap a point to move it.`
  )
}

/** The answer of a grid question: the grid to tap, Undo, the line under it, and the coordinates typed instead. `onChange` gets the x and the y of each point. */
export function PlotAnswer({ plot, onChange, typed }: { plot: PlotSpec; onChange: (text: string) => void; typed: ReactNode }) {
  const [points, setPoints] = useState<(Point | null)[]>(() => plot.place.map(() => null))
  const [picked, setPicked] = useState<number | null>(null)
  const [last, setLast] = useState<number | null>(null)
  const [order, setOrder] = useState<number[]>([])
  const [typing, setTyping] = useState(false)
  const write = (next: (Point | null)[]) => {
    setPoints(next)
    onChange(plotAnswer(next))
  }
  const tap = (pt: Point) => {
    const at = picked ?? points.findIndex((q) => q === null)
    if (at < 0) return
    write(points.map((q, i) => (i === at ? pt : q)))
    setPicked(null)
    setLast(at)
    setOrder([...order.filter((i) => i !== at), at])
  }
  const undo = () => {
    const at = order[order.length - 1]
    if (at === undefined) return
    write(points.map((q, i) => (i === at ? null : q)))
    setOrder(order.slice(0, -1))
    setLast(order[order.length - 2] ?? null)
    setPicked(null)
  }
  const toggle = () => {
    setTyping(!typing)
    write(plot.place.map(() => null))
    setOrder([])
    setLast(null)
    setPicked(null)
  }
  return (
    <div data-answer="plot" className="flex w-full flex-col items-center gap-3">
      {typing ? (
        <>
          <PlotGrid plot={plot} mode="paper" />
          {typed}
          <button type="button" onClick={toggle} className={textButton}>Or tap the grid instead</button>
        </>
      ) : (
        <>
          <div className="flex w-full justify-end">
            <button type="button" onClick={undo} disabled={order.length === 0} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-pill border-2 border-line bg-card px-4 text-[15px] font-semibold text-ink disabled:cursor-default disabled:opacity-40">
              Undo
            </button>
          </div>
          <PlotGrid plot={plot} mode="answer" points={points} picked={picked} last={last} onTap={tap} onPick={(i) => setPicked(picked === i ? null : i)} />
          <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">{plot.curve ? sketchHint(points, plot) : plotHint(plot, points, last)}</p>
          <button type="button" onClick={toggle} className={textButton}>{plot.curve ? 'Or type the points instead' : 'Or type the coordinates instead'}</button>
        </>
      )}
    </div>
  )
}
