'use client'

import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { plotAnswer } from '@jemma/profiling/logic'
import type { PlotSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GREEN, INK, WHITE } from '@/components/diagrams/shared'

// P171: points placed on a grid, from the "Plot points on a grid" board (on the grid of the v1 design). A tap on the grid places the next point on the nearest
// corner; a tap on a placed point picks it, and the next tap moves it. Undo takes the last point off. When every point of a shape is placed, they are joined
// with a dashed line. The results draw the right points (and shape) in green, and a point the learner placed somewhere else dashed beside it.

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
  onTap?: (pt: Point) => void
  onPick?: (i: number) => void
}

export function PlotGrid({ plot, mode, points = [], right = [], picked = null, onTap, onPick }: PlotGridProps) {
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
  return (
    <svg
      ref={svg}
      data-plot={mode}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="group"
      aria-label={`A grid from ${plot.xMin} to ${plot.xMax} across and from ${plot.yMin} to ${plot.yMax} up${given.length ? `, with ${given.map((q) => `${q.label.trim()} at ${name(q)}`).join(', ')}` : ''}.`}
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
      {mode === 'results' ? (
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
                {label(q, plot.place[i]!.trim(), '#B8281E', `pl${i}`)}
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
          <PlotGrid plot={plot} mode="answer" points={points} picked={picked} onTap={tap} onPick={(i) => setPicked(picked === i ? null : i)} />
          <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">{plotHint(plot, points, last)}</p>
          <button type="button" onClick={toggle} className={textButton}>Or type the coordinates instead</button>
        </>
      )}
    </div>
  )
}
