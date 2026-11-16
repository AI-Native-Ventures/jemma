import { readMath, type MathNode } from '@jemma/profiling/logic'

// P125b: our plain maths notation as LaTeX, and the cut of a line of words into the words and the maths in it. Pure functions: no screen, no KaTeX here.
// The LaTeX is built from the tree the marking reads (`readMath`), never from the typed text, so only numbers, letters and fixed commands can be in it.

const inner = (n: MathNode): MathNode => (n.t === 'group' ? inner(n.a) : n)

/** The LaTeX of a tree. A command that a letter could follow ends with a space (`\pi r`), so it is never glued to the next letter. */
export function toLatex(n: MathNode): string {
  switch (n.t) {
    case 'num':
      // A decimal comma is kept and not spaced: 0{,}5 is "0,5".
      return (n.raw ?? String(n.v)).replace(/,/g, '{,}')
    case 'var':
      return n.name === 'θ' ? '\\theta ' : n.name
    case 'pi':
      return '\\pi '
    case 'deg':
      return `{${toLatex(n.a)}}^{\\circ}`
    case 'neg':
      return `-${toLatex(n.a)}`
    case 'group':
      return `\\left(${toLatex(n.a)}\\right)`
    case 'sqrt':
      return `\\sqrt{${toLatex(inner(n.a))}}`
    case 'fn':
      return `\\${n.name}\\left(${toLatex(inner(n.a))}\\right)`
    case 'pow':
      // sin squared of x is written sin^2(x): the power goes on the name.
      if (n.a.t === 'fn') return `\\${n.a.name}^{${toLatex(inner(n.b))}}\\left(${toLatex(inner(n.a.a))}\\right)`
      return `{${toLatex(n.a)}}^{${toLatex(inner(n.b))}}`
    case 'add':
      return `${toLatex(n.a)}+${toLatex(n.b)}`
    case 'sub':
      return `${toLatex(n.a)}-${toLatex(n.b)}`
    case 'mul':
      return n.explicit ? `${toLatex(n.a)}\\times ${toLatex(n.b)}` : `${toLatex(n.a)}${toLatex(n.b)}`
    case 'div':
      return n.explicit ? `${toLatex(n.a)}\\div ${toLatex(n.b)}` : `\\frac{${toLatex(inner(n.a))}}{${toLatex(inner(n.b))}}`
  }
}

const RELATION = /(<=|>=|≤|≥|≠|=|<|>)/
const RELATION_LATEX: Record<string, string> = { '=': '=', '<': '<', '>': '>', '<=': '\\leq ', '≤': '\\leq ', '>=': '\\geq ', '≥': '\\geq ', '≠': '\\neq ' }
const MIXED = /^([-−])?\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/

/** One side of an equation: a mixed number ("1 1/2") or an expression the marking can read. A plus sign in front is kept (the tree has no plus). */
function sideLatex(side: string): string | null {
  const t = side.trim()
  const mixed = MIXED.exec(t)
  if (mixed) return `${mixed[1] ? '-' : ''}${mixed[2]}\\frac{${mixed[3]}}{${mixed[4]}}`
  const plus = t.startsWith('+')
  const tree = readMath(plus ? t.slice(1) : t)
  return tree ? (plus ? '+' : '') + toLatex(tree) : null
}

/**
 * A line of maths ("x/2 + 6 = 10", "sin(30°)", "x = 3") as LaTeX, or null when it is not maths the marking can read. A relation (= < > ≤ ≥ ≠) cuts
 * the line into sides, each read on its own; a line may start or end with a relation, so "= 10" and "x +" (one piece of a line that was cut) are fine.
 */
export function toLatexRun(run: string): string | null {
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
  const binary = /^\s*([+\-−]\s+\S|[=<>≤≥≠])/.test(run)
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

const ALLOWED = /^[A-Za-z0-9+\-−×÷*/=<>≤≥≠^√πθ°⁰¹²³⁴⁵⁶⁷⁸⁹⁻()[\].,·]+$/
const FUNCTION_WORDS = new Set(['sin', 'cos', 'tan', 'sqrt', 'pi', 'PI'])

/** What a piece of text without spaces is: a word, a sign, a lone letter, or maths. A letter run of two or more that is not a function is a word. */
function classify(core: string): Kind {
  if (!core || /^R\d/.test(core) || !ALLOWED.test(core)) return 'word'
  // A comma or a point is a decimal one only between two digits.
  if (/(^|[^0-9])[.,]|[.,]($|[^0-9])/.test(core)) return 'word'
  for (const run of core.match(/[A-Za-z]+/g) ?? []) if (run.length > 1 && !FUNCTION_WORDS.has(run)) return 'word'
  if (!/[A-Za-z0-9√πθ°⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/.test(core)) return 'op'
  return /^[A-Za-z]$/.test(core) ? 'letter' : 'math'
}

const HAS_STRUCTURE = /[+\-−×÷*/=<>≤≥≠^√πθ°⁰¹²³⁴⁵⁶⁷⁸⁹⁻]|sin|cos|tan|sqrt|pi|PI/
const HAS_SYMBOL = /[\^√πθ⁰¹²³⁴⁵⁶⁷⁸⁹⁻]|sin|cos|tan|sqrt|pi|PI/

/**
 * Algebra: a power, a root, pi, theta or a function; or a letter joined to a number or a sign inside one piece (2x, x/2, (x); or a letter and a number
 * in one line (x + 3). Two letters and a minus (a - b) are words.
 */
const isAlgebra = (group: Tok[], run: string): boolean =>
  HAS_SYMBOL.test(run) || group.some((t) => t.kind === 'math' && /[A-Za-z]/.test(t.core)) || (group.some((t) => t.kind === 'letter') && /[0-9]/.test(run))
const OPENS_A_RUN = /^[(\-−+]/

function tokens(text: string): Tok[] {
  const out: Tok[] = []
  for (const m of text.matchAll(/\S+/g)) {
    const word = m[0]
    const core = word.replace(/[:;,?!.]+$/, '')
    out.push({ start: m.index!, end: m.index! + core.length, core, trail: word.slice(core.length), kind: classify(core) })
  }
  return out
}

/** The text cut into the words and the maths in it, in order. Words are kept exactly as they were, spaces too. A text with no maths is one text segment. */
export function segments(text: string, mode: TypesetMode): Segment[] {
  const groups: Tok[][] = []
  let cur: Tok[] = []
  const close = () => {
    if (cur.length > 0) groups.push(cur)
    cur = []
  }
  for (const t of tokens(text)) {
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
    if (mode !== 'force' && (!HAS_STRUCTURE.test(run) || (mode === 'algebra' && !isAlgebra(group, run)))) continue
    if (mode === 'force' && group.every((t) => t.kind === 'op')) continue
    const latex = toLatexRun(run)
    if (latex === null) continue
    const start = group[0]!.start
    const end = group[group.length - 1]!.end
    if (start > at) out.push({ kind: 'text', text: text.slice(at, start) })
    out.push({ kind: 'math', latex, plain: text.slice(start, end) })
    at = end
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out.length > 0 ? out : [{ kind: 'text', text }]
}

/** True when `segments` found maths in the text. */
export const hasTypeset = (text: string, mode: TypesetMode): boolean => segments(text, mode).some((s) => s.kind === 'math')
