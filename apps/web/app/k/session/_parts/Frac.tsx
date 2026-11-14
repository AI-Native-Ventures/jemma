import { fractionsIn } from '@jemma/profiling/logic'
import type { CSSProperties, ReactNode } from 'react'

export type FracProps = {
  /** A number, anything the child types in, or `null` for the part that is not known: an empty box. */
  top: ReactNode
  bottom: ReactNode
  /** Type size in px; the numerator and denominator share it. */
  size: number
  /** Thickness of the line between them. */
  rule: number
  /** Space between the line and each number. */
  gap: number
  /** Space either side of each number. */
  side: number
  color?: string
  /** Fixed width of the whole fraction (the label slot on bar rows). */
  width?: number
  className?: string
}

/** The place of a number that is not known: an empty box as tall as a number, so the fraction keeps its shape. */
function Blank({ size, color }: { size: number; color: string }) {
  return (
    <span
      data-blank="true"
      aria-hidden="true"
      style={{
        display: 'block',
        boxSizing: 'border-box',
        width: Math.round(size * 0.9),
        height: size,
        border: `${Math.max(2, Math.round(size / 16))}px solid ${color}`,
        borderRadius: Math.round(size / 6),
      }}
    />
  )
}

/** A stacked fraction drawn the way the child boards draw it: number, line, number. */
export function Frac({ top, bottom, size, rule, gap, side, color = '#1F1D36', width, className }: FracProps) {
  const style: CSSProperties = { fontSize: size, width }
  const part = (p: ReactNode) => (p === null ? <Blank size={size} color={color} /> : p)
  // A box in one part can be wider than the number in the other: the line then runs under the wider one.
  const wide = typeof top !== 'string' || typeof bottom !== 'string'
  return (
    <span
      className={`inline-flex flex-col ${wide ? 'items-stretch text-center' : 'items-center'} font-bold leading-none ${className ?? ''}`}
      style={style}
    >
      <span style={{ padding: `0 ${side}px ${gap}px` }}>{part(top)}</span>
      <span style={{ borderTop: `${rule}px solid ${color}`, padding: `${gap}px ${side}px 0` }}>{part(bottom)}</span>
    </span>
  )
}

/**
 * Text with every fraction drawn stacked, the unknown part of one ("?/15", "3 / ?", "__/8") as an empty box.
 * `render` draws each fraction; an unknown top or bottom is handed over as `null`.
 */
export function withFractions(text: string, render: (n: string | null, d: string | null, key: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  fractionsIn(text).forEach((f, k) => {
    if (f.index > last) out.push(text.slice(last, f.index))
    out.push(render(f.top, f.bottom, k))
    last = f.index + f.length
  })
  if (last < text.length) out.push(text.slice(last))
  return out
}

export type FractionTextProps = { text: string; size: number; rule: number; gap: number; side: number; color?: string; className?: string }

/**
 * A line of words with its fractions stacked. A screen reader gets the plain words ("3/5 = ?/15") and skips the drawing,
 * so the line is read the way it was written. Words without a fraction are returned as they are.
 */
export function FractionText({ text, size, rule, gap, side, color, className = 'mx-1 align-middle' }: FractionTextProps) {
  const parts = withFractions(text, (n, d, k) => (
    <Frac key={k} top={n} bottom={d} size={size} rule={rule} gap={gap} side={side} color={color} className={className} />
  ))
  if (parts.every((p) => typeof p === 'string')) return <>{text}</>
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{parts}</span>
    </>
  )
}

export const isFraction = (s: string) => /^\d+\/\d+$/.test(s.trim())
