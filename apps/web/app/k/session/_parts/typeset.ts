import { readMath, type MathNode } from '@jemma/profiling/logic'

// P125b: our plain maths notation as LaTeX, and the cut of a line of words into the words and the maths in it. Pure functions: no screen, no KaTeX here.
// The LaTeX is built from the tree the marking reads (`readMath`), never from the typed text, so only numbers, letters and fixed commands can be in it.

const inner = (n: MathNode): MathNode => (n.t === 'group' ? inner(n.a) : n)

/** The Greek letters a variable can be, and their LaTeX. */
const GREEK_LATEX: Record<string, string> = { θ: '\\theta ', α: '\\alpha ', β: '\\beta ', γ: '\\gamma ', δ: '\\delta ', φ: '\\phi ', λ: '\\lambda ', ω: '\\omega ' }

/** A function drawn as a book draws it: sin cos tan ln log upright, the inverse functions with a little -1, the absolute value between two bars. */
const functionLatex = (name: string, arg: string): string => {
  if (name === 'abs') return `\\left|${arg}\\right|`
  if (name === 'asin' || name === 'acos' || name === 'atan') return `\\${name.slice(1)}^{-1}\\left(${arg}\\right)`
  return `\\${name}\\left(${arg}\\right)`
}

/**
 * The plus-minus and minus-plus signs of one side of a line, in the order they are written (P135). The marking cannot read them, so `readMath` is given a
 * plain + or - in their place, and the tree it makes is walked in the order the signs were written: each sign that is a sign of something (a binary
 * one after a term, a unary one in front of a term) takes the next place in this list, a `\pm` or `\mp` where the writer had one and null where not.
 */
type Marks = { list: (string | null)[]; at: number }
const next = (q: Marks | null): string | null => (q ? (q.list[q.at++] ?? null) : null)

/** `\pm` or `\mp` between two terms: a space is added only where a letter follows, so the command is never glued to it. */
const joined = (a: string, mark: string | null, plain: string, b: string): string => (mark ? `${a}${mark}${/^[A-Za-z]/.test(b) ? ' ' : ''}${b}` : `${a}${plain}${b}`)

function latexOf(n: MathNode, q: Marks | null): string {
  switch (n.t) {
    case 'num':
      // A decimal comma is kept and not spaced: 0{,}5 is "0,5".
      return (n.raw ?? String(n.v)).replace(/,/g, '{,}')
    case 'var':
      return GREEK_LATEX[n.name] ?? n.name
    case 'pi':
      return '\\pi '
    case 'e':
      return '\\mathrm{e}'
    case 'deg':
      return `{${latexOf(n.a, q)}}^{\\circ}`
    case 'neg': {
      const mark = next(q)
      return `${mark ? `${mark} ` : '-'}${latexOf(n.a, q)}`
    }
    case 'group':
      return `\\left(${latexOf(n.a, q)}\\right)`
    case 'sqrt':
      return n.cube ? `\\sqrt[3]{${latexOf(inner(n.a), q)}}` : `\\sqrt{${latexOf(inner(n.a), q)}}`
    case 'fn':
      return functionLatex(n.name, latexOf(inner(n.a), q))
    case 'pow':
      // sin squared of x is written sin^2(x): the power goes on the name.
      if (n.a.t === 'fn' && (n.a.name === 'sin' || n.a.name === 'cos' || n.a.name === 'tan')) return `\\${n.a.name}^{${latexOf(inner(n.b), q)}}\\left(${latexOf(inner(n.a.a), q)}\\right)`
      return `{${latexOf(n.a, q)}}^{${latexOf(inner(n.b), q)}}`
    case 'add': {
      const a = latexOf(n.a, q)
      const mark = next(q)
      return joined(a, mark, '+', latexOf(n.b, q))
    }
    case 'sub': {
      const a = latexOf(n.a, q)
      const mark = next(q)
      return joined(a, mark, '-', latexOf(n.b, q))
    }
    case 'mul':
      return n.explicit ? `${latexOf(n.a, q)}\\times ${latexOf(n.b, q)}` : `${latexOf(n.a, q)}${latexOf(n.b, q)}`
    case 'div':
      return n.explicit ? `${latexOf(n.a, q)}\\div ${latexOf(n.b, q)}` : `\\frac{${latexOf(inner(n.a), q)}}{${latexOf(inner(n.b), q)}}`
  }
}

/** The LaTeX of a tree. A command that a letter could follow ends with a space (`\pi r`), so it is never glued to the next letter. */
export function toLatex(n: MathNode): string {
  return latexOf(n, null)
}

const RELATION = /(<=|>=|≤|≥|≠|=|<|>)/
const RELATION_LATEX: Record<string, string> = { '=': '=', '<': '<', '>': '>', '<=': '\\leq ', '≤': '\\leq ', '>=': '\\geq ', '≥': '\\geq ', '≠': '\\neq ' }
const MIXED = /^([-−])?\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/

const PM = /[±∓]/
/** What a sign follows when it is a binary one: a number, a letter, a closing bracket, a degree sign or a little digit. Anything else (the start, an opening bracket, another sign, a relation, a caret, a root) makes it a sign in front of a term. */
const ENDS_A_TERM = /[0-9A-Za-zπθαβγδφλω°⁰¹²³⁴⁵⁶⁷⁸⁹)\]]/

/**
 * The sign list of a side that has a plus-minus or a minus-plus in it (P135), and the side with each of those two signs swapped for a plain + or - that the
 * marking can read: a binary ± is a +, a binary ∓ is a -, and one in front of a term is a - (a minus in front of a term is a node of the tree; a plus is not).
 */
function readSigns(side: string): { text: string; list: (string | null)[] } {
  let text = ''
  let prev = ''
  const list: (string | null)[] = []
  for (const ch of side) {
    if (ch === ' ') {
      text += ch
      continue
    }
    if ('+-−±∓'.includes(ch)) {
      const binary = ENDS_A_TERM.test(prev)
      if (ch === '±' || ch === '∓') {
        list.push(ch === '±' ? '\\pm' : '\\mp')
        text += binary && ch === '±' ? '+' : '-'
      } else {
        // A plus in front of a term is not a node of the tree: it takes no place in the list.
        if (binary || ch !== '+') list.push(null)
        text += ch
      }
    } else {
      text += ch
    }
    prev = ch
  }
  return { text, list }
}

/** One side of an equation: a mixed number ("1 1/2") or an expression the marking can read. A plus sign in front is kept (the tree has no plus). */
function sideLatex(side: string): string | null {
  const t = side.trim()
  const mixed = MIXED.exec(t)
  if (mixed) return `${mixed[1] ? '-' : ''}${mixed[2]}\\frac{${mixed[3]}}{${mixed[4]}}`
  if (PM.test(t)) {
    // P135: the signs are found in the order they were written; if the tree does not hold exactly that many, it is not drawn (it stays text).
    const { text, list } = readSigns(t)
    const tree = readMath(text)
    if (!tree) return null
    const q: Marks = { list, at: 0 }
    const latex = latexOf(tree, q)
    return q.at === list.length ? latex : null
  }
  const plus = t.startsWith('+')
  const tree = readMath(plus ? t.slice(1) : t)
  return tree ? (plus ? '+' : '') + toLatex(tree) : null
}

/**
 * A line of maths ("x/2 + 6 = 10", "sin(30°)", "x = 3") as LaTeX, or null when it is not maths the marking can read. A relation (= < > ≤ ≥ ≠) cuts
 * the line into sides, each read on its own; a line may start or end with a relation, so "= 10" and "x +" (one piece of a line that was cut) are fine.
 */
export function toLatexRun(run: string): string | null {
  // P129: a letter with a digit after it (x1, y2, a1) is a letter with a small number below it, as a textbook writes it. The marking reads the letter alone, so each is
  // swapped for a letter that is not in the line while it is read (the reader does not tell capitals from small letters), and given back as x_{1} in the LaTeX.
  const subs: string[] = []
  const pool = [...'qwzjkhvu'].filter((c) => !run.toLowerCase().includes(c))
  const swapped = run.replace(SUBSCRIPT, (m, letter: string, digit: string) => {
    const key = pool[subs.length]
    if (!key) return m
    subs.push(`${letter}_{${digit}}`)
    return key
  })
  const latex = latexOfRun(swapped)
  return latex === null ? null : restoreCase(run, subs.reduce((t, sub, i) => t.replace(new RegExp(`(?<![A-Za-z\\\\])${pool[i]!}(?![A-Za-z])`, 'g'), sub), latex))
}

/** A letter standing alone (not part of a word or of a LaTeX command). */
const LONE_LETTER = /(?<![A-Za-z\\])[A-Za-z](?![A-Za-z])/g

/**
 * P165: the reader of the maths does not tell capitals from small letters, so "P(A) = 0,4" came back as p(a). The letters that stand alone in the line are
 * given back as they were written, in order, but only when every one of them is found in the same order: anything else keeps the LaTeX as it was.
 */
function restoreCase(run: string, latex: string): string {
  if (!/[A-Z]/.test(run)) return latex
  const want = [...run.matchAll(LONE_LETTER)].map((m) => m[0])
  let at = 0
  const out = latex.replace(LONE_LETTER, (found) => {
    const letter = want[at]
    if (letter !== undefined && letter.toLowerCase() === found.toLowerCase()) {
      at++
      return letter
    }
    return found
  })
  return at === want.length ? out : latex
}

const SUBSCRIPT = /(?<![A-Za-z0-9])([a-z])([0-9])(?![A-Za-z0-9])/g

function latexOfRun(run: string): string | null {
  const parts = run.split(RELATION)
  let out = ''
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out += RELATION_LATEX[parts[i]!]
    } else if (parts[i]!.trim() === '') {
      if (i !== 0 && i !== parts.length - 1) return null
    } else {
      const side = sideLatex(parts[i]!)
      if (side === null) return null
      out += side
    }
  }
  if (!out) return null
  // A sign or a relation at the start of a piece that was cut from a longer line ("+ 6", "= 10") is spaced as a sign between two things: {} stands before it.
  const binary = /^\s*([+\-−±∓]\s+\S|[=<>≤≥≠])/.test(run)
  return `\\displaystyle ${binary ? '{}' : ''}${out}`
}

export type Segment = { kind: 'text'; text: string } | { kind: 'math'; latex: string; plain: string }

/**
 * Which lines are drawn as maths.
 * - `force`: it is known to be maths (an answer, a worked step, the line under the box): everything that reads is drawn, a lone number too.
 * - `all`: a question of a senior class: a run is maths when it has a sign, a power, a root, a function, pi, theta or a degree sign in it.
 * - `algebra`: any other text (a warm-up, a caption, a primary question): the same, and it also needs algebra in it (a letter joined to a number or a sign,
 *   a power, a root): "12 + 7" and "a - b" stay words.
 */
export type TypesetMode = 'force' | 'all' | 'algebra'

type Kind = 'word' | 'op' | 'letter' | 'math'
type Tok = { start: number; end: number; core: string; trail: string; kind: Kind }

const ALLOWED = /^[A-Za-z0-9+\-−±∓×÷*/=<>≤≥≠^√∛πθαβγδφλω°⁰¹²³⁴⁵⁶⁷⁸⁹⁻()[\].,·]+$/
const FUNCTION_WORDS = new Set(['sin', 'cos', 'tan', 'sqrt', 'cbrt', 'pi', 'PI', 'ln', 'log', 'abs', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan'])

/** The letters that follow a number as the name of a unit or as an ordinal ("20cm", "3rd", "5pm"): words, never the product of two letters. */
const UNIT_LETTERS = new Set(['cm', 'mm', 'km', 'kg', 'mg', 'ml', 'ms', 'hr', 'hrs', 'am', 'pm', 'st', 'nd', 'rd', 'th', 'min', 'mins', 'sec', 'secs', 'kph', 'mph', 'ha', 'cl', 'dl', 'lb', 'lbs', 'oz', 'ft', 'yd', 'mi', 'cc'])

/**
 * Two or three letters straight after a number or a bracket ("4ac", "2ab", "3xy") are letters multiplied, in a senior class (P135): the quadratic formula has
 * 4ac in it. Letters that are a unit or an ordinal are words. Two letters with no number before them ("ab", "and/or") are words in every class.
 */
const isProduct = (core: string, run: string): boolean => run.length <= 3 && /^[a-z]+$/.test(run) && !UNIT_LETTERS.has(run) && new RegExp(`[0-9)]${run}(?![A-Za-z])`).test(core)

/** What a piece of text without spaces is: a word, a sign, a lone letter, or maths. A letter run of two or more that is not a function is a word. */
function classify(core: string, products = false): Kind {
  if (!core || /^R\d/.test(core) || !ALLOWED.test(core)) return 'word'
  // A comma or a point is a decimal one only between two digits.
  if (/(^|[^0-9])[.,]|[.,]($|[^0-9])/.test(core)) return 'word'
  for (const run of core.match(/[A-Za-z]+/g) ?? []) if (run.length > 1 && !FUNCTION_WORDS.has(run) && !(products && isProduct(core, run))) return 'word'
  if (!/[A-Za-z0-9√∛πθαβγδφλω°⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/.test(core)) return 'op'
  return /^[A-Za-zθαβγδφλω]$/.test(core) ? 'letter' : 'math'
}

const HAS_STRUCTURE = /[+\-−±∓×÷*/=<>≤≥≠^√∛πθαβγδφλω°⁰¹²³⁴⁵⁶⁷⁸⁹⁻]|sin|cos|tan|sqrt|cbrt|pi|PI|ln|log|abs|asin|acos|atan/
const HAS_SYMBOL = /[\^√∛πθαβγδφλω⁰¹²³⁴⁵⁶⁷⁸⁹⁻]|sin|cos|tan|sqrt|cbrt|pi|PI|ln|log|abs|asin|acos|atan/

/**
 * Algebra: a power, a root, pi, theta or a function; or a letter joined to a number or a sign inside one piece (2x, x/2, (x); or a letter and a number
 * in one line (x + 3). Two letters and a minus (a - b) are words.
 */
const isAlgebra = (group: Tok[], run: string): boolean =>
  HAS_SYMBOL.test(run) || group.some((t) => t.kind === 'math' && /[A-Za-z]/.test(t.core)) || (group.some((t) => t.kind === 'letter') && /[0-9]/.test(run))
/**
 * A bare algebra term (P135): a number with one letter after it (2x, 5a, 3y), alone in a sentence of a senior class. It is maths there ("Subtract 2x from both
 * sides") and is not in any other class. A letter that is the unit of a measure (5m, 3s, 2h, 4g, 6l, 3d) and a capital letter are words, so are "Step 2" and "Grade 11".
 */
const BARE_TERM = /^[0-9]+(?:[.,][0-9]+)?[a-ce-fi-kn-rt-zθαβγδφλω]$/
const OPENS_A_RUN = /^[(\-−+±∓]/
/**
 * A lone variable (P141): x, y, z or n standing as a word of its own ("for every x, so", "Solve for x.", "(x)"), in a senior line. It is maths there, like the
 * equations around it. Another letter is text: a capital, the article "a", a letter that is part of a word ("x-axis" is one word, so it never gets here).
 */
const LONE_VARIABLE = /^\(?[xyzn]\)?$/

const PM_TYPED = /^\+\/?[-−](?=$|[0-9A-Za-z√(πθ])/

function tokens(text: string, products: boolean): Tok[] {
  const out: Tok[] = []
  for (const m of text.matchAll(/\S+/g)) {
    const word = m[0]
    const typed = word.replace(/[:;,?!.]+$/, '')
    // P135: "+/-" and "+-" typed on a keyboard, alone or in front of a term, are a plus-minus sign ("x = +/-3"). In the middle of a token ("3+-2") they are not.
    // The place of the token in the text is that of what was typed; the core is what is read.
    const core = typed.replace(PM_TYPED, '\u00b1')
    out.push({ start: m.index!, end: m.index! + typed.length, core, trail: word.slice(typed.length), kind: classify(core, products) })
  }
  // P129: an x between two numbers is a times sign ("3 x 4"), drawn as one. A letter next to a letter or a sign is still a letter.
  out.forEach((t, i) => {
    const before = out[i - 1]
    const after = out[i + 1]
    if (t.kind === 'letter' && /^[xX]$/.test(t.core) && before && after && before.kind === 'math' && !before.trail && /[0-9)]$/.test(before.core) && after.kind === 'math' && /^[0-9(]/.test(after.core)) {
      t.core = '\u00d7'
      t.kind = 'op'
    }
  })
  return out
}

/** A star standing alone between words of a line that has maths in it is a times sign (a leftover piece: "* 4" after the sum of numbers before it). */
const starsToTimes = (text: string) => text.replace(/(^|\s)\*(?=\s|$)/g, '$1\u00d7')

/** The text cut into the words and the maths in it, in order. Words are kept exactly as they were, spaces too. A text with no maths is one text segment. */
export function segments(text: string, mode: TypesetMode): Segment[] {
  const groups: Tok[][] = []
  let cur: Tok[] = []
  const close = () => {
    if (cur.length > 0) groups.push(cur)
    cur = []
  }
  for (const t of tokens(text, mode !== 'algebra')) {
    if (t.kind === 'word') {
      close()
      continue
    }
    cur.push(t)
    // A sign of punctuation after a piece ends the line of maths there: "x = 3?" is the maths x = 3 and a question mark.
    if (t.trail) close()
  }
  close()

  const out: Segment[] = []
  let at = 0
  for (const group of groups) {
    // A sign at the edge that cannot start or end maths is words (a dash, a stray plus): a minus or a bracket may start a line, a bracket may end one.
    while (group.length > 0 && group[0]!.kind === 'op' && !OPENS_A_RUN.test(group[0]!.core)) group.shift()
    while (group.length > 0 && group[group.length - 1]!.kind === 'op' && !/\)$/.test(group[group.length - 1]!.core)) group.pop()
    if (group.length === 0) continue
    const run = group.map((t) => t.core).join(' ')
    const loneVariable = mode === 'all' && group.length === 1 && LONE_VARIABLE.test(run)
    if (mode !== 'force' && ((!HAS_STRUCTURE.test(run) && !loneVariable && !(mode === 'all' && group.length === 1 && BARE_TERM.test(run))) || (mode === 'algebra' && !isAlgebra(group, run)))) continue
    if (mode === 'force' && group.every((t) => t.kind === 'op')) continue
    const latex = toLatexRun(run)
    if (latex === null) continue
    const start = group[0]!.start
    const end = group[group.length - 1]!.end
    if (start > at) out.push({ kind: 'text', text: starsToTimes(text.slice(at, start)) })
    out.push({ kind: 'math', latex, plain: text.slice(start, end) })
    at = end
  }
  if (at < text.length) out.push({ kind: 'text', text: out.length > 0 ? starsToTimes(text.slice(at)) : text.slice(at) })
  return out.length > 0 ? out : [{ kind: 'text', text }]
}

/** True when `segments` found maths in the text. */
export const hasTypeset = (text: string, mode: TypesetMode): boolean => segments(text, mode).some((s) => s.kind === 'math')

// ---- A piece of maths that does not fit its box (P135) -----------------------------------------------------------------------------------

/** The smallest a typeset piece is scaled to when it is wider than its box: about 70 percent of the size it was given. */
export const FIT_MIN = 0.7

/** How a piece of maths is shown in its box: as it is, scaled down to fit, or cut in two after its equals sign (the right side on a line of its own). */
export type FitPlan = { kind: 'full' | 'scaled' | 'broken'; scale: number; wrap: boolean }

/**
 * What to do with a piece of maths that is `natural` px wide when it has `available` px. A piece that fits is left alone. One that is too wide is scaled
 * down to fit, to `FIT_MIN` at the least. Only a piece that is still too wide at that size is cut after its equals sign (`canBreak`), each half then
 * scaled on its own (the caller measures the halves). A piece with no sign to cut at stays one piece at the smallest size and may wrap at its own signs,
 * as a last resort. A width that is not known (0: no layout yet) leaves the piece alone.
 */
export function fitPlan(natural: number, available: number, canBreak: boolean): FitPlan {
  if (!(natural > 0) || !(available > 0) || natural <= available + 0.5) return { kind: 'full', scale: 1, wrap: false }
  // Rounded down to a hundredth so that the scaled piece is never a pixel wider than its box.
  const scale = Math.floor((available / natural) * 100) / 100
  if (scale >= FIT_MIN) return { kind: 'scaled', scale, wrap: false }
  if (canBreak) return { kind: 'broken', scale: FIT_MIN, wrap: false }
  return { kind: 'scaled', scale: FIT_MIN, wrap: true }
}

const RELATION_LATEX_AT = /^(=|<|>|\\leq |\\geq |\\neq )/

/**
 * A line of LaTeX cut after its first top-level relation (an equals sign, or <, >, \leq, \geq, \neq): the left side with its sign, and the right side. "Top-level"
 * is outside every brace, so an equals sign inside a fraction or a root is never cut at. Null when there is none, or nothing after it.
 */
export function splitAtRelation(latex: string): { left: string; right: string } | null {
  const prefix = latex.startsWith('\\displaystyle ') ? '\\displaystyle ' : ''
  const body = latex.slice(prefix.length)
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (c === '\\') {
      // A command (\frac, \left, \leq ...) is read whole; \leq \geq \neq are relations.
      const rel = RELATION_LATEX_AT.exec(body.slice(i))
      if (rel && depth === 0 && rel[1]!.startsWith('\\')) {
        const end = i + rel[1]!.length
        return end < body.length ? { left: prefix + body.slice(0, end), right: prefix + body.slice(end) } : null
      }
      i += 1
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && (c === '=' || c === '<' || c === '>')) {
      const end = i + 1
      return end < body.length ? { left: prefix + body.slice(0, end), right: prefix + body.slice(end) } : null
    }
  }
  return null
}
