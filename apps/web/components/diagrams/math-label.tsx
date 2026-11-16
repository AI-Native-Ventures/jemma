import type { ReactNode } from 'react'

// P129: the words written on a drawing (the label of a graph, the name of a side, the angle at a corner) are maths when they say x^2 or sqrt(x + 1) or
// theta. They are SVG text, so KaTeX cannot be put in them; a small reader cuts the label into runs instead (a raised part, a slanted letter, a root with a
// line over it, a true minus) and a drawing is made of them: tspans in an SVG text, <sup> and <i> on a page. A label of plain words, numbers and units
// ("5 cm", "opposite", "3 × 4 = 12") gives back `null` and is drawn exactly as it always was. Pure functions: no screen here.

export type Run = {
  text: string
  /** Raised and smaller: a power. */
  sup?: boolean
  /** A letter that stands for a number (x, y, n), or theta and pi. */
  italic?: boolean
  /** A line over it: what is under a root sign. */
  over?: boolean
}

const MINUS = '−'
const ROOT = '√'
/** The little digits and the little minus, as a keyboard or a model writes a power. The three of the Latin-1 block (1 2 3) are real letters of every font and are left as they are. */
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUPER_MINUS = '⁻'
const LATIN_1 = '¹²³'
const FUNCTION_START = /^(?:sin|cos|tan|sqrt|pi|theta)/

const isLetter = (c: string | undefined) => c !== undefined && /^[A-Za-z]$/.test(c)
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isMinus = (c: string | undefined) => c === '-' || c === MINUS
const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c)

/** A letter with no letter either side: a name of a number, or a word of one letter. */
const alone = (text: string, i: number) => isLetter(text[i]) && !isLetter(text[i - 1]) && !isLetter(text[i + 1])

/** The place of the nearest sign that is not a space before / after `i`, or -1 / the length of the text. */
function beforeAt(text: string, i: number): number {
  let j = i - 1
  while (j >= 0 && isSpace(text[j])) j--
  return j
}
function afterAt(text: string, i: number): number {
  let j = i + 1
  while (j < text.length && isSpace(text[j])) j++
  return j
}
const before = (text: string, i: number): string | undefined => text[beforeAt(text, i)]
const after = (text: string, i: number): string | undefined => text[afterAt(text, i)]

/** The signs that make a letter next to them a name of a number and not an article. */
const MATH_NEIGHBOUR = /[0-9=<>≤≥≠+\-−×÷*/^√()πθ°⁰¹²³⁴-⁹]/

/**
 * Is the text maths: a power, a root, a little digit, theta, pi, a function; or a sign (+ = < > a minus between things) with a letter that stands alone. Words
 * and numbers and units ("5 cm", "side a", "Area = 3 cm²") are not.
 */
const GATE_SYMBOL = /\^|√|sqrt|[πθ]|[⁰⁴-⁹⁻]|(?:^|[^A-Za-z])(?:pi|PI|theta|sin|cos|tan)(?![A-Za-z])/
const GATE_SIGN = /[=<>≤≥≠+*]|(?:^|\s)[-−]\s/
function isMaths(text: string): boolean {
  if (GATE_SYMBOL.test(text)) return true
  return GATE_SIGN.test(text) && [...text].some((_, i) => alone(text, i))
}

/** Where the bracket opened at `at` closes, or -1. */
function closing(text: string, at: number): number {
  let depth = 0
  for (let i = at; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

function numberEnd(text: string, from: number): number {
  let j = from
  while (isDigit(text[j])) j++
  if ((text[j] === '.' || text[j] === ',') && isDigit(text[j + 1])) {
    j++
    while (isDigit(text[j])) j++
  }
  return j
}

/** The raised part after a caret: an optional minus, then a number, a letter or a bracket. `from` is what follows the caret. */
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
  if (text[from] === '(') {
    const close = closing(text, from)
    return close < 0 ? null : { content: text.slice(from + 1, close), end: close + 1 }
  }
  if (isDigit(text[from])) {
    const end = numberEnd(text, from)
    return { content: text.slice(from, end), end }
  }
  if (isLetter(text[from])) return { content: text[from]!, end: from + 1 }
  return null
}

/** Is the sign at `i` a minus between things (and not the hyphen of a word)? */
function minusAt(text: string, i: number): boolean {
  const pAt = beforeAt(text, i)
  const nAt = afterAt(text, i)
  const p = text[pAt]
  const n = text[nAt]
  const fromThings = p === undefined || /[(+\u00d7\u00f7*/=<>\u2264\u2265\u2260^\u2212-]/.test(p) || isDigit(p) || p === ')' || (isLetter(p) && alone(text, pAt))
  if (!fromThings || n === undefined) return false
  if (isDigit(n) || n === '(' || n === ROOT) return true
  return isLetter(n) && (alone(text, nAt) || FUNCTION_START.test(text.slice(nAt)))
}

type Context = { maths: boolean; inner: boolean }

/** The runs of a stretch with no power and no root in it: slanted letters, theta and pi, a true minus and times. */
function plainRuns(full: string, start: number, end: number, ctx: Context): Run[] {
  if (!ctx.maths) return [{ text: full.slice(start, end) }]
  const out: Run[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) out.push({ text: buffer })
    buffer = ''
  }
  const put = (text: string, italic = false) => {
    if (italic) {
      flush()
      out.push({ text, italic: true })
    } else buffer += text
  }
  for (let i = start; i < end; ) {
    const c = full[i]!
    if (isLetter(c)) {
      let j = i
      while (j < end && isLetter(full[j])) j++
      const word = full.slice(i, j)
      if (word === 'pi' || word === 'PI') put('π', true)
      else if (word === 'theta') put('θ', true)
      else if (word.length === 1 && alone(full, i) && (ctx.inner || MATH_NEIGHBOUR.test(before(full, i) ?? '') || MATH_NEIGHBOUR.test(after(full, i) ?? ''))) put(word, true)
      else put(word)
      i = j
      continue
    }
    if (c === 'π' || c === 'θ') put(c, true)
    else if (c === '-' && minusAt(full, i)) put(MINUS)
    else if (c === '*') put('×')
    else if ((c === '<' || c === '>' || c === '!') && full[i + 1] === '=') {
      put(c === '<' ? '≤' : c === '>' ? '≥' : '≠')
      i += 2
      continue
    } else put(c)
    i++
  }
  flush()
  return out
}

/** Neighbouring runs that are drawn the same way become one. */
function merged(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    const last = out[out.length - 1]
    if (last && !!last.sup === !!r.sup && !!last.italic === !!r.italic && !!last.over === !!r.over) last.text += r.text
    else out.push({ ...r })
  }
  return out
}

function convert(text: string, ctx: Context): Run[] {
  const out: Run[] = []
  let plain = 0
  const flush = (to: number) => {
    if (to > plain) out.push(...plainRuns(text, plain, to, ctx))
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '^') {
      const e = exponentAt(text, i + 1)
      if (e) {
        flush(i)
        out.push(...convert(e.content, { maths: true, inner: true }).map((r) => ({ ...r, sup: true })))
        i = e.end
        plain = i
        continue
      }
    } else if (SUPERSCRIPT.includes(c) || c === SUPER_MINUS) {
      let j = i
      while (j < text.length && (SUPERSCRIPT.includes(text[j]!) || text[j] === SUPER_MINUS)) j++
      const group = text.slice(i, j)
      // x² and x³ are drawn by the font as they always were; a group with any other little digit or a little minus is raised here.
      if ([...group].every((g) => LATIN_1.includes(g))) {
        i = j
        continue
      }
      flush(i)
      const digits = [...group].map((g) => (g === SUPER_MINUS ? MINUS : String(SUPERSCRIPT.indexOf(g)))).join('')
      out.push({ text: digits, sup: true })
      i = j
      plain = i
      continue
    } else if (c === ROOT || (text.startsWith('sqrt', i) && !isLetter(text[i - 1]))) {
      const r = radicandAt(text, i + (c === ROOT ? 1 : 4))
      if (r) {
        flush(i)
        out.push({ text: ROOT })
        out.push(...convert(r.content, { maths: true, inner: true }).map((x) => ({ ...x, over: true })))
        i = r.end
        plain = i
        continue
      }
    }
    i++
  }
  flush(text.length)
  return merged(out)
}

/**
 * The label cut into the runs it is drawn in, or `null` when it is words, numbers and units that are drawn as they were typed. A label is changed only
 * when it is maths: a power ("x^2", "x⁴"), a root, theta or pi, a function (sin cos tan), or a sign with a letter that stands alone ("y = 2x").
 */
export function labelRuns(text: string): Run[] | null {
  const runs = convert(text, { maths: isMaths(text), inner: false })
  const one = runs.length === 1 ? runs[0]! : null
  if (one && !one.sup && !one.italic && !one.over && one.text === text) return null
  return runs
}

/** The label as the plain text of what is drawn (the raised part follows its base with no sign between). */
export const plainLabel = (text: string): string => (labelRuns(text) ?? [{ text }]).map((r) => r.text).join('')

/** Does the label have a raised part? The place of the label then keeps room above it. */
export const raisedLabel = (text: string): boolean => (labelRuns(text) ?? []).some((r) => r.sup)

// ---- The drawings --------------------------------------------------------------------------------------------------------------------------

const SUP_SIZE = 0.7
const SUP_RISE = 0.42
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * What goes inside an SVG `<text>` of font size `size`: the label itself when it is plain, tspans when it is maths. A raised run is smaller and shifted up
 * (`dy`, which every browser reads; `baseline-shift` on a tspan is not read by all of them) and the run after it comes back down by the same amount.
 */
export function Rich({ text, size }: { text: string; size: number }): ReactNode {
  const runs = labelRuns(text)
  if (!runs) return text
  let at = 0
  return runs.map((r, i) => {
    const to = r.sup ? -SUP_RISE * size : 0
    const dy = r1(to - at)
    at = to
    return (
      <tspan
        key={i}
        {...(dy !== 0 ? { dy } : {})}
        {...(r.sup ? { fontSize: r1(size * SUP_SIZE), 'data-sup': 'true' } : {})}
        {...(r.italic ? { fontStyle: 'italic' } : {})}
        {...(r.over ? { textDecoration: 'overline' } : {})}
      >
        {r.text}
      </tspan>
    )
  })
}

/** The same label on a page (a line under a drawing): <sup> for a power, <i> for a letter, a line over a root. A plain label is the text itself. */
export function RichHtml({ text }: { text: string }): ReactNode {
  const runs = labelRuns(text)
  if (!runs) return text
  return runs.map((r, i) => {
    const style = r.over ? { textDecoration: 'overline' } : undefined
    if (r.sup)
      return (
        <sup key={i} style={{ fontSize: '0.7em', lineHeight: 0, ...style }}>
          {r.italic ? <i>{r.text}</i> : r.text}
        </sup>
      )
    if (r.italic) return <i key={i} style={style}>{r.text}</i>
    return style ? <span key={i} style={style}>{r.text}</span> : r.text
  })
}
