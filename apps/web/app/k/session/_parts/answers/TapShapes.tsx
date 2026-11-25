'use client'

import { useState, type KeyboardEvent } from 'react'
import { tapAnswer } from '@jemma/profiling/logic'
import type { TapSpec } from '@jemma/profiling/schemas'
import { GOLD, GREEN, INK, WHITE } from '@/components/diagrams/shared'

// P173: shapes picked by tapping, from the "Tap on the picture" board ("Tap all the triangles."). A tap picks a shape (it turns gold with a tick) and a second
// tap takes it off. The line under the picture counts the picks, never whether they are right. The results draw the learner's picks, with a shape that was
// missed or picked by mistake circled in red pen.

const GOLD_TINT = '#FFEDC6'
const PEN = '#E03C31'
const W = 320

type Shape = TapSpec['shapes'][number]['shape']

/** The outline of a shape centred on 0,0 at size `r`, before it is turned. */
function outline(shape: Shape, r: number): { kind: 'path'; d: string } | { kind: 'circle'; rx: number; ry: number } {
  const poly = (pts: [number, number][]) => ({ kind: 'path' as const, d: `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} Z` })
  const regular = (n: number, start = -90) => poly(Array.from({ length: n }, (_, k) => [r * Math.cos(((start + (360 / n) * k) * Math.PI) / 180), r * Math.sin(((start + (360 / n) * k) * Math.PI) / 180)] as [number, number]))
  switch (shape) {
    case 'triangle':
      return poly([[0, -r * 0.95], [r, r * 0.75], [-r, r * 0.75]])
    case 'right_triangle':
      return poly([[-r * 0.8, -r * 0.9], [-r * 0.8, r * 0.8], [r * 0.9, r * 0.8]])
    case 'square':
      return poly([[-r * 0.8, -r * 0.8], [r * 0.8, -r * 0.8], [r * 0.8, r * 0.8], [-r * 0.8, r * 0.8]])
    case 'rectangle':
      return poly([[-r, -r * 0.55], [r, -r * 0.55], [r, r * 0.55], [-r, r * 0.55]])
    case 'circle':
      return { kind: 'circle', rx: r * 0.9, ry: r * 0.9 }
    case 'oval':
      return { kind: 'circle', rx: r, ry: r * 0.6 }
    case 'pentagon':
      return regular(5)
    case 'hexagon':
      return regular(6, 0)
    case 'rhombus':
      return poly([[0, -r], [r * 0.7, 0], [0, r], [-r * 0.7, 0]])
    case 'kite':
      return poly([[0, -r], [r * 0.65, -r * 0.25], [0, r], [-r * 0.65, -r * 0.25]])
    case 'trapezium':
      return poly([[-r * 0.5, -r * 0.6], [r * 0.5, -r * 0.6], [r, r * 0.6], [-r, r * 0.6]])
  }
}

/** The places of the shapes: 4 to a row (3 to a row for up to 6 shapes), each in its own cell. */
function cells(n: number) {
  const perRow = n <= 6 ? 3 : 4
  const rows = Math.ceil(n / perRow)
  const cw = W / perRow
  const ch = 112
  return { H: rows * ch, r: Math.min(cw, ch) * 0.34, at: (i: number) => ({ cx: cw * (i % perRow) + cw / 2, cy: ch * Math.floor(i / perRow) + ch / 2 }) }
}

export type TapPictureProps = {
  tap: TapSpec
  picked: boolean[]
  onToggle?: (i: number) => void
  /** results: the right picks (from 1); a shape missed or picked by mistake is circled. */
  right?: number[]
  label: string
}

export function TapPicture({ tap, picked, onToggle, right, label }: TapPictureProps) {
  const { H, r, at } = cells(tap.shapes.length)
  const key = (i: number) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onToggle?.(i)
  }
  return (
    <svg data-tap="" viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label={label} style={{ display: 'block', maxWidth: W, height: 'auto', userSelect: 'none' }}>
      {tap.shapes.map((s, i) => {
        const { cx, cy } = at(i)
        const on = picked[i] === true
        const o = outline(s.shape, r)
        const fill = on ? GOLD_TINT : WHITE
        const stroke = on ? GOLD : INK
        const sw = on ? 3 : 2.4
        const body = o.kind === 'circle' ? <ellipse cx={0} cy={0} rx={o.rx} ry={o.ry} fill={fill} stroke={stroke} strokeWidth={sw} /> : <path d={o.d} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        const wrong = right ? right.includes(i + 1) !== on : false
        const g = (
          <>
            <rect x={cx - W / 8} y={cy - 54} width={W / 4} height={108} fill={WHITE} fillOpacity={0} />
            <g transform={`translate(${cx} ${cy}) rotate(${s.turn ?? 0})`}>{body}</g>
            {on ? (
              <g transform={`translate(${cx + r * 0.9} ${cy - r * 0.9})`}>
                <circle r={11} fill={GREEN} stroke={WHITE} strokeWidth={2} />
                <path d="M-5,0 l3.5,3.5 l6,-7" fill="none" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ) : null}
            {wrong ? <circle data-pen="" cx={cx} cy={cy + 2} r={r * 1.3} fill="none" stroke={PEN} strokeWidth={2.8} /> : null}
          </>
        )
        return onToggle ? (
          <g key={i} data-shape={i} role="button" tabIndex={0} aria-pressed={on} aria-label={`Shape ${i + 1}`} onClick={() => onToggle(i)} onKeyDown={key(i)} style={{ cursor: 'pointer', outline: 'none' }}>
            {g}
          </g>
        ) : (
          <g key={i} data-shape={i}>{g}</g>
        )
      })}
    </svg>
  )
}

/** The answer of shapes to tap: the picture, and the line that counts the picks. `onChange` gets the numbers of the picked shapes, or '' while fewer than 2. */
export function TapAnswer({ tap, onChange }: { tap: TapSpec; onChange: (text: string) => void }) {
  const [picked, setPicked] = useState<boolean[]>(() => tap.shapes.map(() => false))
  const count = picked.filter(Boolean).length
  const toggle = (i: number) => {
    const next = picked.map((p, k) => (k === i ? !p : p))
    setPicked(next)
    onChange(tapAnswer(next))
  }
  return (
    <div data-answer="tap" className="flex w-full flex-col items-center gap-3">
      <TapPicture tap={tap} picked={picked} onToggle={toggle} label={`${tap.shapes.length} shapes, ${count} picked.`} />
      <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">
        {count > 0 ? (
          <>
            <strong className="font-bold text-ink">{count}</strong> {count === 1 ? 'shape' : 'shapes'} picked.{' '}
          </>
        ) : null}
        Tap a shape to pick it. Tap it again to take it off.
      </p>
    </div>
  )
}
