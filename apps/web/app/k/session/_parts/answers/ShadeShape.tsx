'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { shadeTotal } from '@jemma/profiling/logic'
import type { ShadeSpec } from '@jemma/profiling/schemas'
import { GOLD, INK, WHITE } from '@/components/diagrams/shared'

// P172: parts of a shape shaded by tapping, from the "Shade parts" board: a circle or a bar cut into equal parts, or a grid of squares (a hundred square). A
// tap shades a part and a second tap clears it; a finger dragged over a grid or a bar shades (or clears) every part it passes. The line under the shape counts
// the shaded parts. The results draw the shape with as many parts shaded as the learner shaded.

const W = 300

/** One part of the shape: its outline as SVG, by its place. */
function parts(s: ShadeSpec): { key: string; d: string }[] {
  const total = shadeTotal(s)
  if (s.shape === 'circle') {
    const cx = W / 2
    const cy = 118
    const r = 100
    return Array.from({ length: total }, (_, k) => {
      const a0 = (k / total) * 2 * Math.PI
      const a1 = ((k + 1) / total) * 2 * Math.PI
      const p = (a: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`
      return { key: `c${k}`, d: `M${cx},${cy} L${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z` }
    })
  }
  if (s.shape === 'bar') {
    const w = (W - 20) / total
    return Array.from({ length: total }, (_, k) => ({ key: `b${k}`, d: `M${10 + k * w},40 h${w} v64 h${-w} Z` }))
  }
  const rows = s.rows ?? 1
  const cols = s.cols ?? 1
  const cell = Math.min((W - 20) / cols, 220 / rows)
  const left = (W - cols * cell) / 2
  return Array.from({ length: rows * cols }, (_, k) => {
    const r = Math.floor(k / cols)
    const c = k % cols
    return { key: `g${k}`, d: `M${left + c * cell},${10 + r * cell} h${cell} v${cell} h${-cell} Z` }
  })
}

/** The height of the drawing of a shape. */
function height(s: ShadeSpec): number {
  if (s.shape === 'circle') return 236
  if (s.shape === 'bar') return 144
  const rows = s.rows ?? 1
  const cols = s.cols ?? 1
  return Math.min((W - 20) / cols, 220 / rows) * rows + 20
}

export type ShadeShapeProps = { shade: ShadeSpec; on: boolean[]; onPaint?: (k: number, value: boolean) => void; label: string }

export function ShadeShape({ shade, on, onPaint, label }: ShadeShapeProps) {
  const svg = useRef<SVGSVGElement>(null)
  /** While a finger is down: whether it shades or clears, and the parts it has done already. */
  const paint = useRef<{ value: boolean; done: Set<number> } | null>(null)
  const list = parts(shade)
  const partAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)
    const k = el?.getAttribute('data-part')
    return k === null || k === undefined ? null : Number(k)
  }
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!onPaint) return
    const k = Number((e.target as Element).getAttribute('data-part') ?? NaN)
    if (!Number.isInteger(k)) return
    e.preventDefault()
    paint.current = { value: !on[k], done: new Set([k]) }
    onPaint(k, !on[k])
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A tap still shades the part it went down on.
    }
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const p = paint.current
    if (!p || !onPaint) return
    const k = partAt(e.clientX, e.clientY)
    if (k === null || p.done.has(k)) return
    p.done.add(k)
    onPaint(k, p.value)
  }
  const up = () => {
    paint.current = null
  }
  return (
    <svg
      ref={svg}
      data-shade={shade.shape}
      viewBox={`0 0 ${W} ${height(shade)}`}
      width="100%"
      role="group"
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ display: 'block', maxWidth: W, height: 'auto', touchAction: onPaint ? 'none' : undefined, userSelect: 'none', cursor: onPaint ? 'pointer' : 'default' }}
    >
      {list.map((p, k) => (
        <path
          key={p.key}
          data-part={k}
          data-on={on[k] ? 'true' : 'false'}
          d={p.d}
          fill={on[k] ? GOLD : WHITE}
          stroke={INK}
          strokeWidth={shade.shape === 'grid' && shadeTotal(shade) > 30 ? 1 : 2.2}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

/** The answer of a shape to shade: the shape, the count, and the line under it. `onChange` gets how many parts are shaded, or '' while none is. */
export function ShadeAnswer({ shade, onChange }: { shade: ShadeSpec; onChange: (text: string) => void }) {
  const total = shadeTotal(shade)
  const [on, setOn] = useState<boolean[]>(() => Array.from({ length: total }, () => false))
  const count = on.filter(Boolean).length
  const paint = (k: number, value: boolean) => {
    setOn((old) => {
      const next = old.map((v, i) => (i === k ? value : v))
      const n = next.filter(Boolean).length
      onChange(n > 0 ? String(n) : '')
      return next
    })
  }
  const part = shade.shape === 'grid' ? 'squares' : 'parts'
  return (
    <div data-answer="shade" className="flex w-full flex-col items-center gap-3">
      <ShadeShape shade={shade} on={on} onPaint={paint} label={`${count} of ${total} ${part} shaded.`} />
      {/* The parts are buttons for a keyboard too: one for each, in order. */}
      <div className="sr-only">
        {on.map((v, k) => (
          <button key={k} type="button" aria-pressed={v} onClick={() => paint(k, !v)}>{`Part ${k + 1}`}</button>
        ))}
      </div>
      <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">
        {count > 0 ? (
          <>
            <strong className="font-bold text-ink">{count}</strong> of <strong className="font-bold text-ink">{total}</strong> {part} shaded.{' '}
          </>
        ) : null}
        {shade.shape === 'circle' ? 'Tap a part to shade it. Tap it again to clear it.' : `Tap a ${part === 'squares' ? 'square' : 'part'} to shade it, or drag over several. Tap it again to clear it.`}
      </p>
    </div>
  )
}

/** The shape as the learner shaded it, for the results: as many parts shaded as they shaded, from the first. */
export function ShadedResult({ shade, wrote }: { shade: ShadeSpec; wrote: string }) {
  const total = shadeTotal(shade)
  const n = /^\d+$/.test(wrote.trim()) ? Math.min(total, Number(wrote.trim())) : 0
  const part = shade.shape === 'grid' ? 'squares' : 'parts'
  return (
    <div data-shaded={n} className="flex w-full justify-center">
      <div className="w-[70%]">
        <ShadeShape shade={shade} on={Array.from({ length: total }, (_, k) => k < n)} label={`Your shape: ${n} of ${total} ${part} shaded.`} />
      </div>
    </div>
  )
}
