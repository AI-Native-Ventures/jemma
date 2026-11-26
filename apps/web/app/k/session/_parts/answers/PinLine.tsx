'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { pinAnswer, pinMarks } from '@jemma/profiling/logic'
import type { PinSpec } from '@jemma/profiling/schemas'
import { BODY, GOLD, GREEN, INK, WHITE } from '@/components/diagrams/shared'

// P175: a pin put on a number line, from the "Mark a number line" board. The pin waits at the start; the learner drags it along the line and it stops on the
// marks. The line shows no number but its two ends, and the pin shows none either. The arrow keys move it one mark at a time. The results draw the right pin in
// green and the learner's pin dashed beside it.

const W = 320
const X0 = 34
const X1 = 286
const Y = 90

const fmt = (n: number) => (n < 0 ? `−${-n}` : String(n))

function Pin({ x, tone = 'gold' }: { x: number; tone?: 'gold' | 'right' | 'yours' }) {
  const fill = tone === 'gold' ? GOLD : tone === 'right' ? GREEN : 'none'
  const stroke = tone === 'yours' ? BODY : INK
  return (
    <g>
      <path d={`M${x},${Y - 2} L${x - 11},${Y - 30} A14,14 0 1 1 ${x + 11},${Y - 30} Z`} fill={fill} stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" strokeDasharray={tone === 'yours' ? '4 3' : undefined} />
      {tone === 'yours' ? null : <circle cx={x} cy={Y - 40} r={5} fill={WHITE} stroke={INK} strokeWidth={1.6} />}
    </g>
  )
}

export type PinLineProps = {
  pin: PinSpec
  /** The mark the pin is on (0 is the start), or null for no pin (paper). */
  at: number | null
  right?: number | null
  mode: 'answer' | 'paper' | 'results'
  onMove?: (k: number) => void
}

export function PinLine({ pin, at, right = null, mode, onMove }: PinLineProps) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const marks = pinMarks(pin)
  const X = (k: number) => X0 + (k / marks) * (X1 - X0)
  const markAt = (clientX: number): number | null => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return null
    const vx = ((clientX - box.left) / box.width) * W
    return Math.max(0, Math.min(marks, Math.round(((vx - X0) / (X1 - X0)) * marks)))
  }
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (mode !== 'answer') return
    dragging.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // The pin still moves to where the finger went down.
    }
    const k = markAt(e.clientX)
    if (k !== null) onMove?.(k)
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const k = markAt(e.clientX)
    if (k !== null) onMove?.(k)
  }
  const key = (e: KeyboardEvent<SVGGElement>) => {
    const k = at ?? 0
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(marks, k + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, k - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? marks : null
    if (next === null) return
    e.preventDefault()
    onMove?.(next)
  }
  const ticks: ReactNode[] = []
  for (let k = 0; k <= marks; k++) {
    const end = k === 0 || k === marks
    ticks.push(<line key={k} x1={X(k)} y1={Y - (end ? 13 : 9)} x2={X(k)} y2={Y + (end ? 13 : 9)} stroke={INK} strokeWidth={end ? 2.2 : 1.8} />)
  }
  return (
    <svg
      ref={svg}
      data-pin={mode}
      viewBox={`0 0 ${W} 140`}
      width="100%"
      role="group"
      aria-label={`A number line from ${pin.min} to ${pin.max} with ${marks - 1} marks between.`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      style={{ display: 'block', maxWidth: W, height: 'auto', touchAction: mode === 'answer' ? 'none' : undefined, cursor: mode === 'answer' ? 'ew-resize' : 'default', userSelect: 'none', fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      <line x1={X0 - 14} y1={Y} x2={X1 + 14} y2={Y} stroke={INK} strokeWidth={2.5} />
      {ticks}
      <text x={X0} y={Y + 34} fontSize={18} fontWeight={700} fill={INK} textAnchor="middle">{fmt(pin.min)}</text>
      <text x={X1} y={Y + 34} fontSize={18} fontWeight={700} fill={INK} textAnchor="middle">{fmt(pin.max)}</text>
      {mode === 'results' ? (
        <>
          {right !== null ? <g data-right=""><Pin x={X(right)} tone="right" /></g> : null}
          {at !== null && at !== right ? (
            <g data-yours="">
              <Pin x={X(at)} tone="yours" />
              <text x={X(at)} y={26} fontSize={12} fontWeight={600} fill={BODY} textAnchor="middle">yours</text>
            </g>
          ) : null}
        </>
      ) : null}
      {mode === 'answer' && at !== null ? (
        <g role="slider" tabIndex={0} aria-label="The pin" aria-valuemin={0} aria-valuemax={marks} aria-valuenow={at} aria-valuetext={`mark ${at} of ${marks}`} onKeyDown={key} style={{ outline: 'none' }}>
          <Pin x={X(at)} />
        </g>
      ) : null}
    </svg>
  )
}

const textButton = 'flex min-h-11 cursor-pointer items-center self-center border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'

/** The answer of a pin on a number line: the line with its pin at the start, and the same answer typed instead. `onChange` gets the pin as the key's kind. */
export function PinAnswer({ pin, as, onChange, typed }: { pin: PinSpec; as: string; onChange: (text: string) => void; typed: ReactNode }) {
  const [at, setAt] = useState(0)
  const [moved, setMoved] = useState(false)
  const [typing, setTyping] = useState(false)
  const move = (k: number) => {
    setAt(k)
    setMoved(true)
    // The pin at the start is no answer yet: every key is after the start.
    onChange(k > 0 ? pinAnswer(pin, k, as) : '')
  }
  const toggle = () => {
    setTyping(!typing)
    setAt(0)
    setMoved(false)
    onChange('')
  }
  const word = as === 'decimal' ? 'decimal' : as === 'whole' ? 'number' : 'fraction'
  return (
    <div data-answer="pin" className="flex w-full flex-col items-center gap-3">
      {typing ? (
        <>
          <PinLine pin={pin} at={null} mode="paper" />
          {typed}
          <button type="button" onClick={toggle} className={textButton}>Or put the pin on the line instead</button>
        </>
      ) : (
        <>
          <PinLine pin={pin} at={at} mode="answer" onMove={move} />
          <p className="m-0 text-center text-[16px] leading-[1.4] text-body">{moved ? (at > 0 ? 'Drag the pin again to move it.' : 'The pin stops on each mark.') : 'Drag the pin along the line.'}</p>
          <button type="button" onClick={toggle} className={textButton}>{`Or type the ${word} instead`}</button>
        </>
      )}
    </div>
  )
}
