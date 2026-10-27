import type { CSSProperties, ReactNode } from 'react'

export type FracProps = {
  top: string
  bottom: string
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

/** A stacked fraction drawn the way the child boards draw it: number, line, number. */
export function Frac({ top, bottom, size, rule, gap, side, color = '#1F1D36', width, className }: FracProps) {
  const style: CSSProperties = { fontSize: size, width }
  return (
    <span
      className={`inline-flex flex-col items-center font-bold leading-none ${className ?? ''}`}
      style={style}
    >
      <span style={{ padding: `0 ${side}px ${gap}px` }}>{top}</span>
      <span style={{ borderTop: `${rule}px solid ${color}`, padding: `${gap}px ${side}px 0` }}>{bottom}</span>
    </span>
  )
}

const FRACTION = /(\d+)\/(\d+)/g

/** Text with every `a/b` drawn as a stacked fraction. `render` styles each fraction. */
export function withFractions(text: string, render: (n: string, d: string, key: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(FRACTION)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    out.push(render(m[1]!, m[2]!, k++))
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export const isFraction = (s: string) => /^\d+\/\d+$/.test(s.trim())
