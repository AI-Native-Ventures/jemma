'use client'

import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { matchAnswer } from '@jemma/profiling/logic'
import type { MatchSpec, TapSpec } from '@jemma/profiling/schemas'
import { GOLD, GOLD_TINT, GREEN, INK, WHITE } from '@/components/diagrams/shared'
import { outline } from './TapShapes'

// P178: things matched in pairs, from the "Match pairs" board ("Match each number to its name."). The learner taps one on the left, then the one it goes with on
// the right (or the other way round), and a line joins them. A tap on a line takes it off; joining a thing again moves its line. The line under the pairs counts
// them, never whether they are right. The results draw the learner's lines: a right pair in green, a wrong one in red pen.

const PEN = '#E03C31'
const W = 320
const SIDE = 12

type Shape = TapSpec['shapes'][number]['shape']
type Pick = { side: 'left' | 'right'; i: number } | null

/** What a shape to match looks like, in words that do not name it: what a learner who cannot see it is told. */
const LOOKS: Record<Shape, string> = {
  triangle: 'a shape with 3 straight sides',
  right_triangle: 'a shape with 3 straight sides and a square corner',
  square: 'a shape with 4 equal sides and 4 square corners',
  rectangle: 'a shape with 4 square corners, 2 long sides and 2 short sides',
  circle: 'a round shape',
  oval: 'a round shape that is longer than it is wide',
  pentagon: 'a shape with 5 straight sides',
  hexagon: 'a shape with 6 straight sides',
  rhombus: 'a shape with 4 equal sides and no square corners',
  kite: 'a shape with 4 sides: 2 short sides next to each other and 2 long sides',
  trapezium: 'a shape with 4 sides, 2 of them parallel',
}

/** A text cut into one line, or two at the space nearest its middle. */
function wrap(text: string, twoLines: boolean): string[] {
  const t = text.trim()
  if (!twoLines || !t.includes(' ')) return [t]
  const spaces = [...t.matchAll(/ /g)].map((m) => m.index)
  const at = spaces.reduce((best, k) => (Math.abs(k - t.length / 2) < Math.abs(best - t.length / 2) ? k : best), spaces[0]!)
  return [t.slice(0, at), t.slice(at + 1)]
}

/**
 * The size of the words of a column and the width of its cards, from the biggest size down: every thing on one line if that fits at some size, else the
 * biggest size at which the long ones fit on two lines (a short one keeps its one line).
 */
function column(texts: string[], sizes: number[], min: number, max: number) {
  const chars = (size: number) => Math.floor((max - 26) / (size * 0.6))
  const width = (lines: string[][], size: number) => Math.max(min, Math.ceil(Math.max(...lines.flat().map((l) => l.length)) * size * 0.6 + 26))
  const one = texts.map((t) => [t.trim()])
  for (const size of sizes) if (width(one, size) <= max) return { size, w: width(one, size), lines: one }
  for (const size of sizes) {
    const lines = texts.map((t) => wrap(t, t.trim().length > chars(size)))
    if (width(lines, size) <= max) return { size, w: width(lines, size), lines }
  }
  const size = sizes[sizes.length - 1]!
  return { size, w: max, lines: texts.map((t) => wrap(t, t.trim().length > chars(size))) }
}

/** Where the cards go. On paper the ones on the right are numbered ("1. twelve"), so their cards fit the numbers too. */
function layout(m: MatchSpec, numbered: boolean) {
  const pictures = m.pictures === true
  const short = !pictures && Math.max(...m.left.map((t) => t.trim().length)) <= 3
  const left = pictures ? { size: 0, w: 84, lines: m.left.map(() => ['']) } : column(m.left, short ? [26, 22] : [19, 16, 14], 80, 132)
  const right = column(numbered ? m.right.map((t, j) => `${j + 1}. ${t.trim()}`) : m.right, [19, 16, 14], 100, W - 2 * SIDE - 64 - left.w)
  const h = pictures ? 70 : 56
  const pitch = h + 22
  return { left, right, h, pitch, H: m.left.length * pitch - 22 + 2 * SIDE, lx: SIDE, rx: W - SIDE - right.w, y: (i: number) => SIDE + i * pitch }
}

export type MatchBoardProps = {
  match: MatchSpec
  /** The partner of each left one (an index into `right`), or null. */
  joined: (number | null)[]
  mode: 'answer' | 'paper' | 'results'
  picked?: Pick
  /** results: the right partner of each left one (an index into `right`). */
  right?: number[]
  onLeft?: (i: number) => void
  onRight?: (j: number) => void
  onLine?: (i: number) => void
}

export function MatchBoard({ match, joined, mode, picked = null, right = [], onLeft, onRight, onLine }: MatchBoardProps) {
  const L = layout(match, mode === 'paper')
  const press = (f?: () => void) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    f?.()
  }
  const words = (lines: string[], cx: number, cy: number, size: number) => (
    <text x={cx} y={cy + size * 0.36 - (lines.length - 1) * size * 0.58} fontSize={size} fontWeight={700} fill={INK} textAnchor="middle">
      {lines.map((l, k) => (
        <tspan key={k} x={cx} dy={k === 0 ? 0 : size * 1.16}>
          {l}
        </tspan>
      ))}
    </text>
  )
  const card = (side: 'left' | 'right', i: number, body: ReactNode, label: string) => {
    const x = side === 'left' ? L.lx : L.rx
    const w = side === 'left' ? L.left.w : L.right.w
    const on = picked?.side === side && picked.i === i
    const g = (
      <>
        <rect x={x} y={L.y(i)} width={w} height={L.h} rx={14} fill={on ? GOLD_TINT : WHITE} stroke={on ? GOLD : INK} strokeWidth={on ? 2.6 : 2} />
        {body}
      </>
    )
    const tap = side === 'left' ? onLeft : onRight
    return mode === 'answer' ? (
      <g key={`${side}${i}`} data-match={side} data-i={i} role="button" tabIndex={0} aria-pressed={on} aria-label={label} onClick={() => tap?.(i)} onKeyDown={press(() => tap?.(i))} style={{ cursor: 'pointer', outline: 'none' }}>
        {g}
      </g>
    ) : (
      <g key={`${side}${i}`} data-match={side} data-i={i}>
        {g}
      </g>
    )
  }
  const leftLabel = (i: number) => (match.pictures ? LOOKS[match.left[i]!.trim() as Shape] ?? `Shape ${i + 1}` : match.left[i]!.trim())
  const lines: ReactNode[] = []
  joined.forEach((j, i) => {
    if (j === null || j === undefined || mode === 'paper') return
    const x1 = L.lx + L.left.w
    const y1 = L.y(i) + L.h / 2
    const x2 = L.rx
    const y2 = L.y(j) + L.h / 2
    const ok = mode === 'results' ? right[i] === j : true
    const color = mode === 'results' ? (ok ? GREEN : PEN) : GOLD
    const seen = (
      <>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={ok ? undefined : '7 5'} />
        <circle cx={x1} cy={y1} r={5} fill={color} />
        <circle cx={x2} cy={y2} r={5} fill={color} />
      </>
    )
    lines.push(
      mode === 'answer' ? (
        <g key={`l${i}`} data-line={i} role="button" tabIndex={0} aria-label={`Take off the line from ${leftLabel(i)} to ${match.right[j]!.trim()}`} onClick={() => onLine?.(i)} onKeyDown={press(() => onLine?.(i))} style={{ cursor: 'pointer', outline: 'none' }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={WHITE} strokeOpacity={0} strokeWidth={22} />
          {seen}
        </g>
      ) : (
        <g key={`l${i}`} data-line={i} data-ok={ok ? 'true' : 'false'}>
          {seen}
        </g>
      ),
    )
  })
  return (
    <svg data-match-board={mode} viewBox={`0 0 ${W} ${L.H}`} width="100%" role="group" aria-label={`${match.left.length} things on the left and ${match.right.length} on the right to match.`} style={{ display: 'block', maxWidth: W, height: 'auto', userSelect: 'none', fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {match.left.map((t, i) => {
        const cx = L.lx + L.left.w / 2
        const cy = L.y(i) + L.h / 2
        const body = match.pictures
          ? (() => {
              const o = outline(t.trim() as Shape, 24)
              return <g transform={`translate(${cx} ${cy})`}>{o.kind === 'circle' ? <ellipse cx={0} cy={0} rx={o.rx} ry={o.ry} fill={WHITE} stroke={INK} strokeWidth={2.4} /> : <path d={o.d} fill={WHITE} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />}</g>
            })()
          : words(L.left.lines[i]!, cx, cy, L.left.size)
        return card('left', i, body, leftLabel(i))
      })}
      {match.right.map((t, j) => {
        return card('right', j, words(L.right.lines[j]!, L.rx + L.right.w / 2, L.y(j) + L.h / 2, L.right.size), mode === 'paper' ? `${j + 1}. ${t.trim()}` : t.trim())
      })}
      {lines}
    </svg>
  )
}

/** The words for what the learner taps first and what they join it to: "a number" and "its name" for numbers and names, as on the board. */
function nouns(m: MatchSpec): { first: string; then: string; waits: string } {
  const numbers = !m.pictures && m.left.every((t) => /^[\d\s.,]+$/.test(t.trim()))
  const names = m.pictures === true || (numbers && m.right.every((t) => /^[a-z\s-]+$/i.test(t.trim())))
  return { first: m.pictures ? 'a shape' : numbers ? 'a number' : 'one on the left', then: names ? 'its name' : 'the one it goes with', waits: names ? 'its name' : 'its match' }
}

/** The line under the pairs: how many are joined and what waits for its partner. It never says whether a pair is right. */
export function matchHint(m: MatchSpec, joined: (number | null)[], picked: Pick): ReactNode {
  const n = joined.filter((j) => j !== null).length
  const w = nouns(m)
  const count =
    n > 0 ? (
      <>
        <strong className="font-bold text-ink">{n}</strong> {n === 1 ? 'pair' : 'pairs'} joined.{' '}
      </>
    ) : null
  if (picked?.side === 'left')
    return (
      <>
        {count}
        {m.pictures ? 'The shape you picked' : <strong className="font-bold text-ink">{m.left[picked.i]!.trim()}</strong>} is waiting for {w.waits}.
      </>
    )
  if (picked?.side === 'right')
    return (
      <>
        {count}
        <strong className="font-bold text-ink">{m.right[picked.i]!.trim()}</strong> is waiting for its match.
      </>
    )
  if (n === m.left.length)
    return (
      <>
        All <strong className="font-bold text-ink">{n}</strong> pairs joined. Tap a line to take it off.
      </>
    )
  return (
    <>
      {count}
      {`Tap ${w.first}, then tap ${w.then}.`}
    </>
  )
}

/** The answer of things to match: the two columns and the line under them. `onChange` gets the partner of each left one, or '' while one is not joined. */
export function MatchAnswer({ match, onChange }: { match: MatchSpec; onChange: (text: string) => void }) {
  const [joined, setJoined] = useState<(number | null)[]>(() => match.left.map(() => null))
  const [picked, setPicked] = useState<Pick>(null)
  const write = (next: (number | null)[]) => {
    setJoined(next)
    onChange(matchAnswer(next))
  }
  const join = (i: number, j: number) => {
    write(joined.map((p, k) => (k === i ? j : p === j ? null : p)))
    setPicked(null)
  }
  const left = (i: number) => {
    if (picked?.side === 'right') return join(i, picked.i)
    setPicked(picked?.side === 'left' && picked.i === i ? null : { side: 'left', i })
  }
  const right = (j: number) => {
    if (picked?.side === 'left') return join(picked.i, j)
    setPicked(picked?.side === 'right' && picked.i === j ? null : { side: 'right', i: j })
  }
  const line = (i: number) => {
    write(joined.map((p, k) => (k === i ? null : p)))
    setPicked(null)
  }
  return (
    <div data-answer="match" className="flex w-full flex-col items-center gap-3">
      <MatchBoard match={match} joined={joined} mode="answer" picked={picked} onLeft={left} onRight={right} onLine={line} />
      <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">{matchHint(match, joined, picked)}</p>
    </div>
  )
}
