import type { ReactNode } from 'react'
import { Rich, fracLabel } from './math-label'

export const INK = '#1F1D36'
export const CORAL = '#FF6A4D'
export const CORAL_TEXT = '#B8381F'
export const CORAL_TINT = '#FFE3DA'
export const CORAL_SOFT = '#FFD3C7'
export const BODY = '#5D5A73'
export const SOFT = '#F4F3F8'
export const SOFT_3 = '#E9E7F3'
export const EDGE = '#CFCDDC'
export const WHITE = '#FFFFFF'

export type Variant = 'card' | 'question'

/** SA number format: decimal comma. */
export const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6).replace('.', ',')

type SvgProps = { width: number; height: number; label: string; children: ReactNode; maxWidth?: number }

/** Every diagram is one role="img" SVG with a spoken description; the drawing itself is hidden from screen readers. */
export function Svg({ width, height, label, children, maxWidth }: SvgProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={label}
      style={{
        display: 'block',
        maxWidth: maxWidth ?? width,
        height: 'auto',
        fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {children}
    </svg>
  )
}

type TextProps = {
  x: number
  y: number
  size: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  /** Extra attributes on the text (a data-* name for a test to find it by). */
  attrs?: Record<string, string>
  children: ReactNode
}

export function T({ x, y, size, weight = 400, fill = INK, anchor = 'middle', attrs, children }: TextProps) {
  // A label with a fraction in it (a letter over a number) is a box of its own; every other label is a text.
  const stacked = typeof children === 'string' ? fracLabel({ text: children, x, y, size, weight, fill, anchor, attrs }) : null
  if (stacked) return stacked
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={fill} fontWeight={weight} {...attrs}>
      {typeof children === 'string' ? <Rich text={children} size={size} /> : children}
    </text>
  )
}

export function Line(p: { x1: number; y1: number; x2: number; y2: number; stroke?: string; w?: number; cap?: 'round' | 'butt' }) {
  return (
    <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke ?? INK} strokeWidth={p.w ?? 1} strokeLinecap={p.cap ?? 'butt'} />
  )
}
