import { fractionsIn } from '@jemma/profiling/logic'
import { Fragment, type CSSProperties, type ReactNode } from 'react'

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

// ---- Powers and roots (P86) -----------------------------------------------------------------------------------------------------

/** The little digits and the little minus, as a keyboard or a model writes a power: x² x³ x¹⁰ x⁻¹. */
const SUPERSCRIPT = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'
const SUPER_MINUS = '\u207b'
const ROOT_SIGN = '\u221a'
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isLetter = (c: string | undefined) => c !== undefined && /^[A-Za-z]$/.test(c)
const isMinus = (c: string | undefined) => c === '-' || c === '\u2212'

/** True when a text holds a power or a root: a caret, a root sign, the word sqrt, or a little digit. Every other text is drawn exactly as it always was. */
export const hasMath = (text: string): boolean => /[\^\u221a\u207b\u2070\u00b9\u00b2\u00b3\u2074-\u2079]|sqrt/.test(text)

/** Where the bracket opened at `at` closes, or -1. */
function closing(text: string, at: number): number {
  let depth = 0
  for (let i = at; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

/** A number as it is typed: digits with a comma or a point and more digits. */
function numberEnd(text: string, from: number): number {
  let j = from
  while (isDigit(text[j])) j++
  if ((text[j] === '.' || text[j] === ',') && isDigit(text[j + 1])) {
    j++
    while (isDigit(text[j])) j++
  }
  return j
}

/** The raised part after a caret at `at`: an optional minus and a number, a letter or a bracket. `from` is what follows the caret. */
function exponentAt(text: string, from: number): { content: string; end: number } | null {
  let j = from
  if (isMinus(text[j])) j++
  const sign = text.slice(from, j)
  if (text[j] === '(') {
    const close = closing(text, j)
    return close < 0 ? null : { content: sign + text.slice(j + 1, close), end: close + 1 }
  }
  if (isDigit(text[j])) {
    const end = numberEnd(text, j)
    return { content: text.slice(from, end), end }
  }
  if (isLetter(text[j])) return { content: sign + text[j], end: j + 1 }
  return null
}

/** What a root covers: the one number, letter or bracket right after the root sign (a space after it ends the root: "sqrt of 16" is words). */
function radicandAt(text: string, from: number): { content: string; end: number } | null {
  const j = from
  if (text[j] === '(') {
    const close = closing(text, j)
    return close < 0 ? null : { content: text.slice(j + 1, close), end: close + 1 }
  }
  if (isDigit(text[j])) {
    const end = numberEnd(text, j)
    return { content: text.slice(j, end), end }
  }
  if (isLetter(text[j])) return { content: text[j]!, end: j + 1 }
  return null
}

/** A raised part. It is small and sits above the line; the line of a screen reader is the whole text, so this is only the drawing. */
const raised = (content: ReactNode, key: number) => (
  <sup key={key} style={{ fontSize: '0.62em', lineHeight: 0, position: 'relative', top: '-0.55em', verticalAlign: 'baseline', fontWeight: 'inherit' }}>
    {content}
  </sup>
)

/** A root sign with a line over what is under it. */
const rooted = (content: ReactNode, key: number) => (
  <span key={key} data-root="true" style={{ whiteSpace: 'nowrap' }}>
    {ROOT_SIGN}
    <span data-radicand="true" style={{ display: 'inline-block', lineHeight: 1.05, borderTop: '0.08em solid currentColor', padding: '0 0.12em' }}>
      {content}
    </span>
  </span>
)

/** One piece of text with its powers raised and its roots lined. What cannot be read as a power or a root stays as it was typed. */
function mathParts(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let plain = ''
  let k = 0
  const flush = () => {
    if (plain) out.push(plain)
    plain = ''
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '^') {
      const e = exponentAt(text, i + 1)
      if (e) {
        flush()
        out.push(raised(mathParts(e.content), k++))
        i = e.end
        continue
      }
    } else if (SUPERSCRIPT.includes(c) || c === SUPER_MINUS) {
      let j = i
      let digits = ''
      if (text[j] === SUPER_MINUS) {
        digits = '-'
        j++
      }
      const start = j
      while (j < text.length && SUPERSCRIPT.includes(text[j]!)) {
        digits += SUPERSCRIPT.indexOf(text[j]!)
        j++
      }
      if (j > start) {
        flush()
        out.push(raised(digits, k++))
        i = j
        continue
      }
    } else if (c === ROOT_SIGN || text.startsWith('sqrt', i)) {
      const r = radicandAt(text, i + (c === ROOT_SIGN ? 1 : 4))
      if (r) {
        flush()
        out.push(rooted(mathParts(r.content), k++))
        i = r.end
        continue
      }
    }
    plain += c
    i++
  }
  flush()
  return out
}

/**
 * A line of words with its powers raised, its roots lined and its fractions stacked, for a senior class (algebra). The drawing is hidden from a screen
 * reader and the plain words are given to it instead, as `FractionText` does.
 */
export function MathText({ text, size, rule, gap, side, color, className = 'mx-1 align-middle' }: FractionTextProps) {
  const parts = withFractions(text, (n, d, k) => <Frac key={k} top={n} bottom={d} size={size} rule={rule} gap={gap} side={side} color={color} className={className} />)
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {parts.map((part, i) => (typeof part === 'string' ? <Fragment key={`m${i}`}>{mathParts(part)}</Fragment> : part))}
      </span>
    </>
  )
}

/**
 * A line of words with its fractions stacked. A screen reader gets the plain words ("3/5 = ?/15") and skips the drawing,
 * so the line is read the way it was written. Words without a fraction are returned as they are. A line with a power or a root
 * (`hasMath`) is drawn by `MathText`; a line without one is drawn exactly as it always was.
 */
export function FractionText({ text, size, rule, gap, side, color, className = 'mx-1 align-middle' }: FractionTextProps) {
  if (hasMath(text)) return <MathText text={text} size={size} rule={rule} gap={gap} side={side} color={color} className={className} />
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
