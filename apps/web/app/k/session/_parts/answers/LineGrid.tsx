'use client'

import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { lineAnswer, lineEnds, pointIn, type Notation } from '@jemma/profiling/logic'
import type { LineSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GREEN, INK } from '@/components/diagrams/shared'
import { useNotation } from '@/lib/notation'

// P174: a straight line drawn on a grid, from the "Draw on the picture" board (the v1 Line tool). The learner taps the first point; the line follows the finger
// until the second tap; then the line runs across the grid, and a point can be dragged to move it. Undo takes the last point off. The results draw the right
// line in green and the learner's line dashed when it is not the same line.

const GRID = '#ECE9E2'
const W = 320
const M = 24

type Point = { x: number; y: number }

function geometry(g: LineSpec) {
  const sx = g.xMax - g.xMin
  const sy = g.yMax - g.yMin
  const u = Math.min((W - 2 * M) / sx, (300 - 2 * M) / sy)
  const left = (W - sx * u) / 2
  return { u, H: sy * u + 2 * M, X: (x: number) => left + (x - g.xMin) * u, Y: (y: number) => M + (g.yMax - y) * u, left }
}

/** A point as it is said: (2; 3), and P187 (2, 3) in the US. */
const name = (p: Point, n: Notation = 'za') => pointIn(String(p.x), String(p.y), n)

export type LineGridProps = {
  line: LineSpec
  mode: 'answer' | 'paper' | 'results'
  a?: Point | null
  b?: Point | null
  /** answer: where the finger is, while the second point is not placed (the line follows it). */
  follow?: Point | null
  right?: [Point, Point] | null
  onDown?: (pt: Point, e: PointerEvent<SVGSVGElement>) => void
  onMove?: (pt: Point) => void
  onUp?: (pt: Point) => void
}

export function LineGrid({ line, mode, a = null, b = null, follow = null, right = null, onDown, onMove, onUp }: LineGridProps) {
  const svg = useRef<SVGSVGElement>(null)
  const notation = useNotation()
  const { u, H, X, Y, left } = geometry(line)
  const every = Math.max(line.xMax - line.xMin, line.yMax - line.yMin) > 12 ? 2 : 1
  const at = (clientX: number, clientY: number): Point | null => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return null
    const vx = ((clientX - box.left) / box.width) * W
    const vy = ((clientY - box.top) / box.height) * H
    const x = Math.max(line.xMin, Math.min(line.xMax, Math.round(line.xMin + (vx - left) / u)))
    const y = Math.max(line.yMin, Math.min(line.yMax, Math.round(line.yMax - (vy - M) / u)))
    return { x, y }
  }
  const grid: ReactNode[] = []
  for (let x = line.xMin; x <= line.xMax; x++) grid.push(<line key={`v${x}`} x1={X(x)} y1={Y(line.yMin)} x2={X(x)} y2={Y(line.yMax)} stroke={GRID} />)
  for (let y = line.yMin; y <= line.yMax; y++) grid.push(<line key={`h${y}`} x1={X(line.xMin)} y1={Y(y)} x2={X(line.xMax)} y2={Y(y)} stroke={GRID} />)
  const ay = line.yMin <= 0 && line.yMax >= 0 ? 0 : line.yMin
  const ax = line.xMin <= 0 && line.xMax >= 0 ? 0 : line.xMin
  const num = (v: number) => (v < 0 ? `−${-v}` : String(v))
  const ticks: ReactNode[] = []
  for (let x = line.xMin; x <= line.xMax; x++) if (x !== ax && x % every === 0) ticks.push(<text key={`tx${x}`} x={X(x)} y={Y(ay) + 14} fontSize={10} fill={BODY} textAnchor="middle">{num(x)}</text>)
  for (let y = line.yMin; y <= line.yMax; y++) if (y !== ay && y % every === 0) ticks.push(<text key={`ty${y}`} x={X(ax) - 5} y={Y(y) + 3.5} fontSize={10} fill={BODY} textAnchor="end">{num(y)}</text>)
  const across = (p: Point, q: Point, color: string, width: number, dash?: string, k?: string) => {
    const ends = lineEnds(line, p, q)
    return ends ? <line key={k} data-line={k} x1={X(ends[0].x)} y1={Y(ends[0].y)} x2={X(ends[1].x)} y2={Y(ends[1].y)} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" /> : null
  }
  const dot = (p: Point, k: string) => <circle key={k} cx={X(p.x)} cy={Y(p.y)} r={8} fill={GOLD} stroke={INK} strokeWidth={2} />
  const same = right && a && b ? lineEnds(line, a, b) !== null && [a, b].every((r) => Math.abs((right[1].x - right[0].x) * (r.y - right[0].y) - (right[1].y - right[0].y) * (r.x - right[0].x)) < 1e-9) : false
  return (
    <svg
      ref={svg}
      data-line-grid={mode}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="group"
      aria-label={`A grid from ${line.xMin} to ${line.xMax} across and from ${line.yMin} to ${line.yMax} up.${a ? ` A point at ${name(a, notation)}.` : ''}${b ? ` A point at ${name(b, notation)}.` : ''}`}
      onPointerDown={(e) => {
        const p = at(e.clientX, e.clientY)
        if (p && onDown) onDown(p, e)
      }}
      onPointerMove={(e) => {
        const p = at(e.clientX, e.clientY)
        if (p && onMove) onMove(p)
      }}
      onPointerUp={(e) => {
        const p = at(e.clientX, e.clientY)
        if (p && onUp) onUp(p)
      }}
      style={{ display: 'block', maxWidth: W, height: 'auto', touchAction: mode === 'answer' ? 'none' : undefined, cursor: mode === 'answer' ? 'crosshair' : 'default', userSelect: 'none', fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      {grid}
      <line x1={X(line.xMin)} y1={Y(ay)} x2={X(line.xMax)} y2={Y(ay)} stroke={INK} strokeWidth={1.6} />
      <line x1={X(ax)} y1={Y(line.yMin)} x2={X(ax)} y2={Y(line.yMax)} stroke={INK} strokeWidth={1.6} />
      <text x={X(line.xMax) + 8} y={Y(ay) + 4} fontSize={12} fontWeight={700} fill={INK}>x</text>
      <text x={X(ax)} y={Y(line.yMax) - 8} fontSize={12} fontWeight={700} fill={INK} textAnchor="middle">y</text>
      {ticks}
      {mode === 'results' && right ? (
        <>
          {across(right[0], right[1], GREEN, 3, undefined, 'right')}
          <circle cx={X(right[0].x)} cy={Y(right[0].y)} r={5} fill={GREEN} />
          <circle cx={X(right[1].x)} cy={Y(right[1].y)} r={5} fill={GREEN} />
          {a && b && !same ? across(a, b, BODY, 2.4, '6 5', 'yours') : null}
        </>
      ) : null}
      {mode === 'answer' ? (
        <>
          {a && b ? across(a, b, GOLD, 3.5, undefined, 'drawn') : null}
          {a && !b && follow ? <line x1={X(a.x)} y1={Y(a.y)} x2={X(follow.x)} y2={Y(follow.y)} stroke={GOLD} strokeWidth={3} strokeDasharray="6 5" /> : null}
          {a ? dot(a, 'a') : null}
          {b ? dot(b, 'b') : null}
          {a && !b ? <text x={X(a.x) + 12} y={Y(a.y) + 18} fontSize={13} fontWeight={700} fill="#B8281E">{name(a, notation)}</text> : null}
        </>
      ) : null}
    </svg>
  )
}

const textButton = 'flex min-h-11 cursor-pointer items-center self-center border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'

/** The answer of a line to draw: the grid, Undo, the line under it and two points typed instead. `onChange` gets the two points (`x1; y1; x2; y2`). */
export function LineAnswer({ line, onChange, typed }: { line: LineSpec; onChange: (text: string) => void; typed: ReactNode }) {
  const notation = useNotation()
  const [a, setA] = useState<Point | null>(null)
  const [b, setB] = useState<Point | null>(null)
  const [follow, setFollow] = useState<Point | null>(null)
  const [dragging, setDragging] = useState<'a' | 'b' | null>(null)
  const [typing, setTyping] = useState(false)
  const set = (na: Point | null, nb: Point | null) => {
    setA(na)
    setB(nb)
    onChange(lineAnswer(na, nb))
  }
  const near = (p: Point, q: Point | null) => q !== null && p.x === q.x && p.y === q.y
  const down = (p: Point, e: PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A tap still places the point.
    }
    // A finger down on a placed point drags it; anywhere else places the next point.
    if (a && b && near(p, a)) return setDragging('a')
    if (a && b && near(p, b)) return setDragging('b')
    if (!a) return set(p, null)
    if (!b && !near(p, a)) return set(a, p)
  }
  const move = (p: Point) => {
    if (dragging === 'a' && !near(p, b)) set(p, b)
    else if (dragging === 'b' && !near(p, a)) set(a, p)
    else if (a && !b) setFollow(p)
  }
  const up = () => setDragging(null)
  const undo = () => (b ? set(a, null) : set(null, null))
  const toggle = () => {
    setTyping(!typing)
    set(null, null)
    setFollow(null)
  }
  const hint = !a ? (
    'Tap the first point of your line.'
  ) : !b ? (
    <>Your first point is at <strong className="font-bold text-ink">{name(a, notation)}</strong>. Now tap the second point.</>
  ) : (
    <>Your line goes through <strong className="font-bold text-ink">{name(a, notation)}</strong> and <strong className="font-bold text-ink">{name(b, notation)}</strong>. Drag a point to move your line.</>
  )
  return (
    <div data-answer="line" className="flex w-full flex-col items-center gap-3">
      {typing ? (
        <>
          <LineGrid line={line} mode="paper" />
          {typed}
          <button type="button" onClick={toggle} className={textButton}>Or draw the line instead</button>
        </>
      ) : (
        <>
          <div className="flex w-full justify-end">
            <button type="button" onClick={undo} disabled={!a} className="flex min-h-11 cursor-pointer items-center rounded-pill border-2 border-line bg-card px-4 text-[15px] font-semibold text-ink disabled:cursor-default disabled:opacity-40">
              Undo
            </button>
          </div>
          <LineGrid line={line} mode="answer" a={a} b={b} follow={follow} onDown={down} onMove={move} onUp={up} />
          <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">{hint}</p>
          <button type="button" onClick={toggle} className={textButton}>Or type two points instead</button>
        </>
      )}
    </div>
  )
}
