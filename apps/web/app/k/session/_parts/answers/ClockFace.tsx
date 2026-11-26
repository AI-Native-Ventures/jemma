'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { CLOCK_START, clockAnswer, clockStep, handAngles, hourAt, minuteAt, type ClockTime } from '@jemma/profiling/logic'
import type { ClockSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GOLD_TINT, GREEN, INK, WHITE } from '@/components/diagrams/shared'

// P177: a clock the learner sets by dragging its hands, from the "Move the clock hands" board ("Show half past 4 on the clock."). The clock starts at 12
// o'clock with a handle on each hand. The long hand goes round and stops every `step` minutes; the short hand stops on the hours and sits between them by
// itself, as far as the minutes have gone. The arrow keys move a hand one stop at a time. The results draw the learner's clock beside the right one.

const C = 120
const R = 100
const HOUR_LEN = R * 0.4
const MINUTE_LEN = R * 0.56

const tip = (deg: number, len: number) => ({ x: C + len * Math.sin((deg * Math.PI) / 180), y: C - len * Math.cos((deg * Math.PI) / 180) })

/** Where a hand points, said by the numbers of the face: "on the 6", "between the 4 and the 5". */
function said(deg: number): string {
  const at = (((deg % 360) + 360) % 360) / 30
  const n = (k: number) => (k % 12 === 0 ? 12 : k % 12)
  return Math.abs(at - Math.round(at)) < 1e-6 ? `on the ${n(Math.round(at))}` : `between the ${n(Math.floor(at))} and the ${n(Math.floor(at) + 1)}`
}

export type ClockFaceProps = {
  /** The time the hands show, or null for a face with no hands (paper). */
  time: ClockTime | null
  mode: 'answer' | 'paper' | 'results'
  /** results: the colour of the face's rim and hands (the right clock is green, the learner's grey). */
  tint?: string
  step?: number
  onSet?: (t: ClockTime, hand: 'hour' | 'minute') => void
  label?: string
}

export function ClockFace({ time, mode, tint, step = 5, onSet, label }: ClockFaceProps) {
  const svg = useRef<SVGSVGElement>(null)
  const grabbed = useRef<'hour' | 'minute' | null>(null)
  const angles = time ? handAngles(time) : null
  const ink = tint ?? INK
  /** The point of the face under a finger, in the face's own units. */
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return null
    return { x: ((e.clientX - box.left) / box.width) * 240, y: ((e.clientY - box.top) / box.height) * 240 }
  }
  const set = (hand: 'hour' | 'minute', p: { x: number; y: number }) => {
    if (!time || !onSet) return
    const deg = (Math.atan2(p.x - C, C - p.y) * 180) / Math.PI
    if (hand === 'minute') onSet({ hour: time.hour, minute: minuteAt(deg, step) }, 'minute')
    else onSet({ hour: hourAt(deg, time.minute), minute: time.minute }, 'hour')
  }
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (mode !== 'answer' || !angles) return
    const p = point(e)
    if (!p) return
    // The hand whose handle is nearest the finger, when one is near; else the long hand on the outside of the face and the short hand near the middle.
    const m = tip(angles.minute, MINUTE_LEN)
    const h = tip(angles.hour, HOUR_LEN)
    const dm = Math.hypot(p.x - m.x, p.y - m.y)
    const dh = Math.hypot(p.x - h.x, p.y - h.y)
    const hand = Math.min(dm, dh) <= 30 ? (dm <= dh ? 'minute' : 'hour') : Math.hypot(p.x - C, p.y - C) > (HOUR_LEN + MINUTE_LEN) / 2 ? 'minute' : 'hour'
    grabbed.current = hand
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // The hand still moves to where the finger went down.
    }
    set(hand, p)
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!grabbed.current) return
    const p = point(e)
    if (p) set(grabbed.current, p)
  }
  const up = () => (grabbed.current = null)
  const key = (hand: 'hour' | 'minute') => (e: KeyboardEvent<SVGGElement>) => {
    if (!time || !onSet) return
    const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!by) return
    e.preventDefault()
    if (hand === 'minute') onSet({ hour: time.hour, minute: (time.minute + by * step + 60) % 60 }, 'minute')
    else onSet({ hour: ((time.hour - 1 + by + 12) % 12) + 1, minute: time.minute }, 'hour')
  }
  const marks: ReactNode[] = []
  for (let k = 0; k < 60; k++) {
    const five = k % 5 === 0
    const a = tip(k * 6, R - (five ? 11 : 6))
    const b = tip(k * 6, R - 3)
    marks.push(<line key={`m${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={five ? 2 : 1} />)
  }
  for (let n = 1; n <= 12; n++) {
    const p = tip(n * 30, R - 23)
    marks.push(
      <text key={`n${n}`} x={p.x} y={p.y + 7} fontSize={19} fontWeight={700} fill={INK} textAnchor="middle">
        {n}
      </text>,
    )
  }
  const hand = (which: 'hour' | 'minute') => {
    if (!angles) return null
    const deg = which === 'hour' ? angles.hour : angles.minute
    const end = tip(deg, which === 'hour' ? HOUR_LEN : MINUTE_LEN)
    const body = (
      <>
        <line x1={C} y1={C} x2={end.x} y2={end.y} stroke={ink} strokeWidth={which === 'hour' ? 7 : 4} strokeLinecap="round" />
        {mode === 'answer' ? (
          <>
            <circle cx={end.x} cy={end.y} r={24} fill={WHITE} fillOpacity={0} />
            <circle cx={end.x} cy={end.y} r={11} fill={GOLD_TINT} stroke={GOLD} strokeWidth={2.5} />
          </>
        ) : null}
      </>
    )
    return mode === 'answer' ? (
      <g
        key={which}
        data-hand={which}
        role="slider"
        tabIndex={0}
        aria-label={which === 'hour' ? 'The short hand' : 'The long hand'}
        aria-valuetext={said(deg)}
        onKeyDown={key(which)}
        style={{ outline: 'none' }}
      >
        {body}
      </g>
    ) : (
      <g key={which} data-hand={which}>
        {body}
      </g>
    )
  }
  return (
    <svg
      ref={svg}
      data-clock={mode}
      viewBox="0 0 240 240"
      width="100%"
      role="group"
      aria-label={label ?? (angles ? `A clock. The long hand is ${said(angles.minute)}. The short hand is ${said(angles.hour)}.` : 'A clock with no hands.')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ display: 'block', maxWidth: 260, height: 'auto', touchAction: mode === 'answer' ? 'none' : undefined, cursor: mode === 'answer' ? 'grab' : 'default', userSelect: 'none', fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      <circle cx={C} cy={C} r={R} fill={WHITE} stroke={ink} strokeWidth={3} />
      {marks}
      {hand('hour')}
      {hand('minute')}
      <circle cx={C} cy={C} r={6} fill={ink} />
    </svg>
  )
}

const textButton = 'flex min-h-11 cursor-pointer items-center self-center border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'

/** The line under the clock: which hand to drag next, and why the short hand is not on a number. It never says the time. */
export function clockHint(moved: { hour: boolean; minute: boolean }, time: ClockTime): string {
  if (!moved.hour && !moved.minute) return 'Drag the long hand first, then the short hand.'
  if (!moved.hour) return 'Now drag the short hand.'
  if (!moved.minute) return 'Now drag the long hand.'
  return time.minute === 0 ? 'Drag a hand again to move it.' : 'The short hand sits between the numbers by itself.'
}

/** The answer of a clock to set: the clock at 12 o'clock with a handle on each hand, the line under it, and the time typed instead. `onChange` gets `4:30`. */
export function ClockAnswer({ clock, onChange, typed }: { clock: ClockSpec; onChange: (text: string) => void; typed: ReactNode }) {
  const [time, setTime] = useState<ClockTime>(CLOCK_START)
  const [moved, setMoved] = useState({ hour: false, minute: false })
  const [typing, setTyping] = useState(false)
  const turn = (t: ClockTime, hand: 'hour' | 'minute') => {
    setTime(t)
    setMoved((old) => ({ ...old, [hand]: true }))
    onChange(clockAnswer(t))
  }
  const toggle = () => {
    setTyping(!typing)
    setTime(CLOCK_START)
    setMoved({ hour: false, minute: false })
    onChange('')
  }
  return (
    <div data-answer="clock" className="flex w-full flex-col items-center gap-3">
      {typing ? (
        <>
          {typed}
          <button type="button" onClick={toggle} className={textButton}>Or move the clock hands instead</button>
        </>
      ) : (
        <>
          <ClockFace time={time} mode="answer" step={clockStep(clock)} onSet={turn} />
          <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">{clockHint(moved, time)}</p>
          <button type="button" onClick={toggle} className={textButton}>Or type the time instead</button>
        </>
      )}
    </div>
  )
}

/** The clocks of the results: the learner's beside the right one, or the learner's alone in green when it is right. */
export function ClockResults({ wrote, right }: { wrote: ClockTime | null; right: ClockTime | null }) {
  const same = wrote && right && wrote.hour === right.hour && wrote.minute === right.minute
  const face = (t: ClockTime, tint: string, caption: string, bold: boolean, k: string) => (
    <div key={k} data-clock-result={k} className="flex flex-col items-center gap-1">
      <div className="w-[120px]">
        <ClockFace time={t} mode="results" tint={tint} label={`${caption}: the long hand is ${said(handAngles(t).minute)}, the short hand ${said(handAngles(t).hour)}.`} />
      </div>
      <span className={`text-[13px] ${bold ? 'font-semibold' : ''}`} style={{ color: tint }}>{caption}</span>
    </div>
  )
  return (
    <div className="flex justify-center gap-3.5">
      {same ? face(wrote!, GREEN, 'Your clock', true, 'yours') : (
        <>
          {wrote ? face(wrote, BODY, 'Yours', false, 'yours') : null}
          {right ? face(right, GREEN, 'Right answer', true, 'right') : null}
        </>
      )}
    </div>
  )
}
