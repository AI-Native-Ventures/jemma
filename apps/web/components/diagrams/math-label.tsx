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
  /** A fraction: the top over the bottom, with a line between them. `text` is then the top and the bottom in a row, as they are spoken ("opposite/hypotenuse"). */
  frac?: { num: Run[]; den: Run[] }
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
    if (last && !last.frac && !r.frac && !!last.sup === !!r.sup && !!last.italic === !!r.italic && !!last.over === !!r.over) last.text += r.text
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

// ---- Fractions ----------------------------------------------------------------------------------------------------------------------------

const OPERAND = /[A-Za-z0-9.,\u00b2\u00b3\u00b9\u00b0\u03b8\u03c0\u221a^]/
const UNIT = /^(?:mm|cm|m|km|mg|g|kg|ml|l|s|ms|min|h|hr)$/
const isWord = (s: string) => /^[A-Za-z]{2,}$/.test(s) && !/^(?:sin|cos|tan|sqrt|pi|theta)$/.test(s)

/** The start of the bracket that closes at `close`, or -1. */
function opening(text: string, close: number): number {
  let depth = 0
  for (let i = close; i >= 0; i--) {
    if (text[i] === ')') depth++
    else if (text[i] === '(' && --depth === 0) return i
  }
  return -1
}

type Operand = { from: number; to: number; content: string }

/** What stands before the slash at `slash`: a bracket (taken without its brackets, unless a function name stands in front of it), or a run of letters, numbers and signs. */
function leftOperand(text: string, slash: number): Operand | null {
  let to = slash
  while (to > 0 && isSpace(text[to - 1])) to--
  if (to === 0) return null
  if (text[to - 1] === ')') {
    const open = opening(text, to - 1)
    if (open < 0) return null
    let from = open
    while (from > 0 && isLetter(text[from - 1])) from--
    return from < open ? { from, to, content: text.slice(from, to) } : { from, to, content: text.slice(open + 1, to - 1) }
  }
  let from = to
  while (from > 0 && OPERAND.test(text[from - 1]!)) from--
  return from === to ? null : { from, to, content: text.slice(from, to) }
}

/** What stands after the slash: the same, read forwards. */
function rightOperand(text: string, slash: number): Operand | null {
  let from = slash + 1
  while (from < text.length && isSpace(text[from])) from++
  if (from >= text.length) return null
  let end = from
  if (text[from] === '(') {
    const close = closing(text, from)
    return close < 0 ? null : { from, to: close + 1, content: text.slice(from + 1, close) }
  }
  while (end < text.length && OPERAND.test(text[end]!)) end++
  if (end === from) return null
  if (text[end] === '(' && isLetter(text[from])) {
    const close = closing(text, end)
    if (close >= 0) return { from, to: close + 1, content: text.slice(from, close + 1) }
  }
  return { from, to: end, content: text.slice(from, end) }
}

type Piece = { text: string } | { num: string; den: string }

/**
 * The label cut at its fractions: "x/2", "(x + 1)/(x - 1)", "opposite / hypotenuse". A fraction needs a letter, a power or a root in it (or the label to be
 * maths): "3/4" and "5 m/s" are left as they were. Two words make a fraction only when spaces stand round the slash ("and/or" is a word).
 */
function pieces(text: string, maths: boolean): Piece[] {
  const out: Piece[] = []
  let done = 0
  for (let i = text.indexOf('/'); i >= 0; i = text.indexOf('/', i + 1)) {
    const l = leftOperand(text, i)
    const r = rightOperand(text, i)
    if (!l || !r || l.from < done) continue
    const words = isWord(l.content) && isWord(r.content)
    if (words && !(isSpace(text[i - 1]) && isSpace(text[i + 1]))) continue
    // A unit is not a fraction: "5 m/s", "km/h".
    if (isLetter(l.content[0]) && /^[A-Za-z]+$/.test(l.content) && isDigit(before(text, l.from))) continue
    if (UNIT.test(l.content) && UNIT.test(r.content)) continue
    if (!maths && !/[A-Za-z\u03b8\u03c0\u221a^]/.test(l.content + r.content)) continue
    if (l.from > done) out.push({ text: text.slice(done, l.from) })
    out.push({ num: l.content, den: r.content })
    done = r.to
  }
  if (done < text.length) out.push({ text: text.slice(done) })
  return out
}

/**
 * The label cut into the runs it is drawn in, or `null` when it is words, numbers and units that are drawn as they were typed. A label is changed only
 * when it is maths: a power ("x^2", "x⁴"), a root, theta or pi, a function (sin cos tan), a fraction with a letter in it, or a sign with a letter that stands alone ("y = 2x").
 */
export function labelRuns(text: string): Run[] | null {
  const maths = isMaths(text)
  const cut = pieces(text, maths)
  if (cut.some((p) => 'num' in p)) {
    return merged(
      cut.flatMap((p): Run[] => {
        if ('num' in p) {
          const num = convert(p.num, { maths: true, inner: true })
          const den = convert(p.den, { maths: true, inner: true })
          return [{ text: `${num.map((r) => r.text).join('')}/${den.map((r) => r.text).join('')}`, frac: { num, den } }]
        }
        return convert(p.text, { maths, inner: false })
      }),
    )
  }
  const runs = convert(text, { maths, inner: false })
  const one = runs.length === 1 ? runs[0]! : null
  if (one && !one.sup && !one.italic && !one.over && one.text === text) return null
  return runs
}

/** The label as the plain text of what is drawn (the raised part follows its base with no sign between). */
export const plainLabel = (text: string): string => (labelRuns(text) ?? [{ text }]).map((r) => r.text).join('')

/** Does the label stand higher than a line of words (a raised part, a fraction)? The place of the label then keeps room above it. */
export const raisedLabel = (text: string): boolean => (labelRuns(text) ?? []).some((r) => r.sup || r.frac)
/** Is a fraction in the label? It cannot be written in an SVG text: it is drawn in a box of its own (see `fracLabel`). */
export const hasFraction = (text: string): boolean => (labelRuns(text) ?? []).some((r) => r.frac)

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

const runStyle = (r: Run) => (r.over ? { textDecoration: 'overline' } : undefined)

function htmlRuns(runs: Run[]): ReactNode {
  return runs.map((r, i) => {
    if (r.frac)
      return (
        <span key={i} data-frac="true" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.1, margin: '0 0.15em' }}>
          <span data-num="true" style={{ padding: '0 0.2em 0.1em' }}>{htmlRuns(r.frac.num)}</span>
          <span data-den="true" style={{ padding: '0.1em 0.2em 0', borderTop: '0.07em solid currentColor' }}>{htmlRuns(r.frac.den)}</span>
        </span>
      )
    const style = runStyle(r)
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

/** The same label on a page (a line under a drawing): <sup> for a power, <i> for a letter, a line over a root, a fraction stacked. A plain label is the text itself. */
export function RichHtml({ text }: { text: string }): ReactNode {
  const runs = labelRuns(text)
  return runs ? htmlRuns(runs) : text
}

/** A rough width of the runs, in px at `size`: enough to give the box of a fraction room, not a measurement (the box is aligned to the side it grows from). */
function widthOf(runs: Run[], size: number): number {
  return runs.reduce((w, r) => w + (r.frac ? Math.max(widthOf(r.frac.num, size), widthOf(r.frac.den, size)) + size * 0.5 : [...r.text].length * size * 0.62), 0)
}

/** A rough width of a label in px at `size` (the same estimate that gives a fraction its box): for keeping labels clear of the numbers and of each other, not a measurement. */
export const labelWidth = (text: string, size: number): number => widthOf(labelRuns(text) ?? [{ text }], size)

type FracLabelProps = {
  text: string
  x: number
  y: number
  size: number
  weight?: number
  fill: string
  anchor: 'start' | 'middle' | 'end'
  /** A white halo round the letters, so that the label is read over a line of the grid. */
  halo?: boolean
  attrs?: Record<string, string>
}

/**
 * A label with a fraction in it ("y = x/2", "sin θ = opposite / hypotenuse") cannot be one SVG text: it is a box of its own in the drawing (foreignObject),
 * a row that grows from the side the label is anchored to, centred on the line of the maths (a little above the line of the letters). `null` when the
 * label has no fraction: it is then drawn as a text, as it always was.
 */
export function fracLabel({ text, x, y, size, weight = 400, fill, anchor, halo, attrs }: FracLabelProps): ReactNode {
  const runs = labelRuns(text)
  if (!runs || !runs.some((r) => r.frac)) return null
  const width = Math.ceil(widthOf(runs, size) + size)
  const height = Math.ceil(size * 3.4)
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  const shadow = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff'
  return (
    <foreignObject {...attrs} x={Math.round(left * 10) / 10} y={Math.round((y - size * 0.3 - height / 2) * 10) / 10} width={width} height={height} style={{ overflow: 'visible' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: anchor === 'start' ? 'flex-start' : anchor === 'end' ? 'flex-end' : 'center',
          height: '100%',
          fontSize: size,
          fontWeight: weight,
          color: fill,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          ...(halo ? { textShadow: shadow } : {}),
        }}
      >
        <span>{htmlRuns(runs)}</span>
      </div>
    </foreignObject>
  )
}
