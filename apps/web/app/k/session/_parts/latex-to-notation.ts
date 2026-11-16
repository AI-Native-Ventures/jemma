// P132: the LaTeX of the maths editor (MathLive's getValue('latex')) as the plain notation Jemma marks and stores: (2x - 3)/17 + (18 + sin(30°))/5.
// A pure function with a small reader of its own (the LaTeX is read, never run). It writes the fewest brackets that keep the meaning: a fraction
// `\frac{a}{b}` is `a/b` when a and b are one piece, `(a + b)/c` when the top is a sum, `a/(bc)` when the bottom is a product. The text it gives is read by
// the parser of the marking (meaning.ts); a LaTeX it cannot read, or an empty box left in it, is null.

class Unreadable extends Error {}
const no = (): never => {
  throw new Unreadable('not readable')
}

type Tok = { k: 'num'; text: string } | { k: 'letter'; text: string } | { k: 'cmd'; name: string } | { k: 'sym'; c: string }

/** Cuts LaTeX into numbers, letters, commands and signs. A decimal comma written {,} between digits belongs to the number. */
function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  const digit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '~') {
      i++
    } else if (digit(c) || (c === '.' && digit(src[i + 1]))) {
      let j = i
      while (digit(src[j])) j++
      if ((src[j] === '.' && digit(src[j + 1])) || (src.startsWith('{,}', j) && digit(src[j + 3]))) {
        j += src[j] === '.' ? 1 : 3
        while (digit(src[j])) j++
      }
      out.push({ k: 'num', text: src.slice(i, j).replace('{,}', ',') })
      i = j
    } else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      out.push({ k: 'letter', text: c })
      i++
    } else if (c === '\\') {
      let j = i + 1
      while ((src[j]! >= 'a' && src[j]! <= 'z') || (src[j]! >= 'A' && src[j]! <= 'Z')) j++
      if (j === i + 1) {
        // \, \; \! \: \  are spaces, left out. \% \{ \} and the like: one character after the backslash.
        const one = src[i + 1] ?? ''
        if (!/[,;!: ]/.test(one)) out.push({ k: 'cmd', name: one })
        i += 2
      } else {
        out.push({ k: 'cmd', name: src.slice(i + 1, j) })
        i = j
      }
    } else {
      out.push({ k: 'sym', c })
      i++
    }
  }
  return out
}

// ---- The tree ------------------------------------------------------------------------------------------------------------------

type Node =
  | { t: 'atom'; s: string; /** Euler's number, from \\mathrm{e}: never glued to a letter next to it */ euler?: true }
  | { t: 'subs'; a: Node; b: Node }
  | { t: 'group'; a: Node }
  | { t: 'neg'; a: Node }
  | { t: 'pm'; a: Node }
  | { t: 'sum'; terms: { op: '+' | '-' | '\u00b1'; a: Node }[] }
  | { t: 'prod'; a: Node; op: 'times' | 'div' | 'implicit'; b: Node }
  | { t: 'frac'; a: Node; b: Node }
  | { t: 'pow'; a: Node; b: Node }
  | { t: 'root'; a: Node; n?: Node }
  | { t: 'fn'; name: string; a: Node; exp?: Node }
  | { t: 'deg'; a: Node }
  | { t: 'pct'; a: Node }
  | { t: 'rel'; parts: Node[]; ops: string[] }

/** Greek letters and signs of geometry and calculus that are one thing each. The marking reads the letters; it cannot mark the signs yet (they are kept as typed). */
const SYMBOLS: Record<string, string> = {
  pi: '\u03c0',
  theta: '\u03b8',
  alpha: '\u03b1',
  beta: '\u03b2',
  gamma: '\u03b3',
  delta: '\u03b4',
  phi: '\u03c6',
  lambda: '\u03bb',
  omega: '\u03c9',
  angle: '\u2220',
  triangle: '\u25b3',
  int: '\u222b',
  sum: '\u03a3',
  lim: 'lim',
  infty: '\u221e',
}
const ATOM_COMMANDS = new Set([...Object.keys(SYMBOLS), 'frac', 'dfrac', 'tfrac', 'sqrt', 'sin', 'cos', 'tan', 'ln', 'log', 'left', 'mathrm', 'operatorname', 'mathit'])
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'ln', 'log'])
const RELATIONS: Record<string, string> = {
  '=': '=',
  '<': '<',
  '>': '>',
  leq: '\u2264',
  le: '\u2264',
  geq: '\u2265',
  ge: '\u2265',
  neq: '\u2260',
  ne: '\u2260',
  cong: '\u2245',
  sim: '\u223c',
  perp: '\u22a5',
  parallel: '\u2225',
  to: '\u2192',
}

function read(toks: Tok[]): Node {
  let pos = 0
  const peek = () => toks[pos]
  const isSym = (t: Tok | undefined, c: string) => !!t && t.k === 'sym' && t.c === c
  const isCmd = (t: Tok | undefined, ...names: string[]) => !!t && t.k === 'cmd' && names.includes(t.name)
  const expectSym = (c: string) => (isSym(peek(), c) ? void pos++ : no())

  /** One braced argument {...}: the maths inside it. */
  const braced = (): Node => {
    expectSym('{')
    const inside = relation()
    expectSym('}')
    return inside
  }
  /** The text of a command's braced argument ({ or } and letters and spaces only): \text{ or }, \mathrm{d/dx}. */
  const plainBraces = (): string => {
    expectSym('{')
    let text = ''
    let depth = 1
    while (pos < toks.length) {
      const t = toks[pos++]!
      if (t.k === 'sym' && t.c === '{') depth++
      else if (t.k === 'sym' && t.c === '}' && --depth === 0) return text
      else if (t.k === 'letter' || t.k === 'num') text += t.text
      else if (t.k === 'sym') text += t.c
      else if (t.k === 'cmd' && (t.name === ' ' || t.name === ',')) text += ' '
      else no()
    }
    return no()
  }
  const startsAtom = (t: Tok | undefined): boolean => {
    if (!t) return false
    if (t.k === 'num' || t.k === 'letter') return true
    if (t.k === 'cmd') return ATOM_COMMANDS.has(t.name)
    return t.c === '(' || t.c === '{'
  }

  function relation(): Node {
    const parts: Node[] = [sum()]
    const ops: string[] = []
    for (;;) {
      const t = peek()
      if (t && t.k === 'sym' && RELATIONS[t.c]) {
        pos++
        ops.push(RELATIONS[t.c]!)
      } else if (t && t.k === 'cmd' && RELATIONS[t.name]) {
        pos++
        ops.push(RELATIONS[t.name]!)
      } else if (isCmd(t, 'text')) {
        // the word between two answers: x = 3 or x = -1
        pos++
        const word = plainBraces().trim().toLowerCase()
        if (word !== 'or' && word !== 'and') no()
        ops.push(word)
      } else {
        return parts.length === 1 ? parts[0]! : { t: 'rel', parts, ops }
      }
      parts.push(sum())
    }
  }

  function sum(): Node {
    const first = product()
    const terms: { op: '+' | '-' | '\u00b1'; a: Node }[] = [{ op: '+', a: first }]
    for (let t = peek(); isSym(t, '+') || isSym(t, '-') || isCmd(t, 'pm'); t = peek()) {
      pos++
      terms.push({ op: t!.k === 'cmd' ? '\u00b1' : (t as { c: '+' | '-' }).c, a: product() })
    }
    return terms.length === 1 ? first : { t: 'sum', terms }
  }

  function product(): Node {
    let left = unary()
    for (;;) {
      const t = peek()
      if (isCmd(t, 'times', 'cdot') || isSym(t, '*')) {
        pos++
        left = { t: 'prod', a: left, op: 'times', b: unary() }
      } else if (isCmd(t, 'div') || isSym(t, '/')) {
        pos++
        left = { t: 'prod', a: left, op: 'div', b: unary() }
      } else if (startsAtom(t)) {
        left = { t: 'prod', a: left, op: 'implicit', b: power() }
      } else {
        return left
      }
    }
  }

  function unary(): Node {
    const t = peek()
    if (isSym(t, '-')) {
      pos++
      return { t: 'neg', a: unary() }
    }
    if (isSym(t, '+')) {
      pos++
      return unary()
    }
    if (isCmd(t, 'pm')) {
      pos++
      return { t: 'pm', a: unary() }
    }
    return power()
  }

  /** The raised part after ^: one token or a braced group. */
  function superscript(): Node | 'degree' {
    if (isCmd(peek(), 'circ')) {
      pos++
      return 'degree'
    }
    if (isSym(peek(), '{')) {
      // ^{\circ} is a degree sign; ^{\prime} is a prime
      if (isCmd(toks[pos + 1], 'circ') && isSym(toks[pos + 2], '}')) {
        pos += 3
        return 'degree'
      }
      return braced()
    }
    const t = toks[pos++]
    if (!t) return no()
    if (t.k === 'num') return { t: 'atom', s: t.text.slice(0, 1) } // ^23 is ^2 then 3, as TeX reads it
    if (t.k === 'letter') return { t: 'atom', s: t.text }
    if (t.k === 'cmd' && t.name === 'pi') return { t: 'atom', s: '\u03c0' }
    if (t.k === 'cmd' && t.name === 'theta') return { t: 'atom', s: '\u03b8' }
    return no()
  }

  function power(): Node {
    let base = atom()
    for (;;) {
      const t = peek()
      if (isCmd(t, '%')) {
        pos++
        base = { t: 'pct', a: base }
      } else if (isSym(t, "'")) {
        pos++
        base = markPrime(base)
      } else if (isSym(t, '^')) {
        pos++
        // f^{\prime}: a prime on a letter
        if (isSym(peek(), '{') && isCmd(toks[pos + 1], 'prime') && isSym(toks[pos + 2], '}')) {
          pos += 3
          base = markPrime(base)
          continue
        }
        const sup = superscript()
        base = sup === 'degree' ? { t: 'deg', a: base } : { t: 'pow', a: base, b: sup }
      } else if (isSym(t, '_')) {
        pos++
        const sub = superscript()
        if (sub === 'degree') return no()
        base = { t: 'subs', a: base, b: sub }
      } else {
        return base
      }
    }
  }

  const markPrime = (n: Node): Node => (n.t === 'atom' ? { t: 'atom', s: `${n.s}\u2032` } : no())

  /** What sin, cos and tan work on: a bracket, or a term (30, 30°, 2x, π, √2) with an optional minus. */
  function argument(): Node {
    if (isSym(peek(), '-')) {
      pos++
      return { t: 'neg', a: argument() }
    }
    if (isCmd(peek(), 'left') || isSym(peek(), '(')) return atom()
    const term = (): Node => {
      const t = peek()
      const fine = !!t && (t.k === 'num' || t.k === 'letter' || (t.k === 'cmd' && (t.name === 'pi' || t.name === 'theta' || t.name === 'sqrt')))
      return fine ? power() : no()
    }
    let arg = term()
    for (let t = peek(); t && (t.k === 'letter' || (t.k === 'cmd' && (t.name === 'pi' || t.name === 'theta' || t.name === 'sqrt'))); t = peek()) {
      arg = { t: 'prod', a: arg, op: 'implicit', b: term() }
    }
    return arg
  }

  function atom(): Node {
    const t = toks[pos++]
    if (!t) return no()
    if (t.k === 'num') return { t: 'atom', s: t.text }
    if (t.k === 'letter') return { t: 'atom', s: t.text }
    if (t.k === 'sym') {
      if (t.c === '(') {
        const inside = relation()
        expectSym(')')
        return { t: 'group', a: inside }
      }
      if (t.c === '{') {
        pos--
        return { t: 'group', a: braced() }
      }
      return no()
    }
    if (SYMBOLS[t.name]) return { t: 'atom', s: SYMBOLS[t.name]! }
    switch (t.name) {
      case 'left': {
        const open = toks[pos++]
        if (!open || open.k !== 'sym' || (open.c !== '(' && open.c !== '[' && open.c !== '|')) return no()
        const inside = relation()
        if (!isCmd(peek(), 'right')) return no()
        pos++
        const close = toks[pos++]
        if (open.c === '|') {
          // |x| is the absolute value
          if (!close || close.k !== 'sym' || close.c !== '|') return no()
          return { t: 'fn', name: 'abs', a: inside }
        }
        if (!close || close.k !== 'sym' || (close.c !== ')' && close.c !== ']')) return no()
        return { t: 'group', a: inside }
      }
      case 'frac':
      case 'dfrac':
      case 'tfrac': {
        const a = braced()
        const b = braced()
        return { t: 'frac', a, b }
      }
      case 'sqrt': {
        let n: Node | undefined
        if (isSym(peek(), '[')) {
          pos++
          n = relation()
          expectSym(']')
        }
        return { t: 'root', a: braced(), ...(n ? { n } : {}) }
      }
      case 'mathrm':
      case 'operatorname':
      case 'mathit': {
        const text = plainBraces().replace(/\s+/g, '')
        // \mathrm{e}, the e of a book, is Euler's number.
        return text === 'e' ? { t: 'atom', s: 'e', euler: true } : { t: 'atom', s: text }
      }
      case 'sin':
      case 'cos':
      case 'tan':
      case 'ln':
      case 'log': {
        let exp: Node | undefined
        let name: string = t.name
        if (isSym(peek(), '^')) {
          pos++
          const sup = superscript()
          if (sup === 'degree') return no()
          // sin with a little -1 is the inverse function (asin), not one over sin
          if (sup.t === 'neg' && sup.a.t === 'atom' && sup.a.s === '1' && FUNCTIONS.has(name) && name !== 'ln' && name !== 'log') name = `a${name}`
          else exp = sup
        }
        const a = argument()
        return { t: 'fn', name, a, ...(exp ? { exp } : {}) }
      }
      default:
        return no()
    }
  }

  const tree = relation()
  if (pos !== toks.length) no()
  return tree
}

// ---- Writing it ----------------------------------------------------------------------------------------------------------------

/** How tightly a written piece binds: 1 a sum or a line with equals signs, 2 a product or a fraction, 3 a minus in front, 4 a power, 5 one piece. */
type Out = { s: string; prec: 1 | 2 | 3 | 4 | 5; div?: true }

const bracket = (o: Out): string => `(${o.s})`
/** A piece as an operand that must be one piece: brackets unless it is already one (a number, a letter, a bracket, a root, a function). */
const asPiece = (o: Out): string => (o.prec === 5 ? o.s : bracket(o))
const startsWithDigit = (s: string) => /^[0-9]/.test(s)
/** A power's number or letter, written without brackets: x^2, x^10, x^n. */
const ONE_PIECE = /^([0-9]+|[A-Za-z\u03c0\u03b8])$/
/** What a root covers without brackets: a number, a letter or pi. */
const RADICAND = /^([0-9]+([.,][0-9]+)?|[A-Za-z\u03c0])$/

function write(n: Node): Out {
  switch (n.t) {
    case 'atom':
      return { s: n.s, prec: 5 }
    case 'group':
      return { s: bracket(write(n.a)), prec: 5 }
    case 'neg': {
      const a = write(n.a)
      return { s: `-${a.prec < 2 ? bracket(a) : a.s}`, prec: 3 }
    }
    case 'pm': {
      const a = write(n.a)
      return { s: `\u00b1${a.prec < 2 ? bracket(a) : a.s}`, prec: 3 }
    }
    case 'sum': {
      let s = ''
      n.terms.forEach((term, i) => {
        const a = write(term.a)
        s += i === 0 ? a.s : ` ${term.op} ${a.s}`
      })
      return { s, prec: 1 }
    }
    case 'frac': {
      const a = write(n.a)
      const b = write(n.b)
      const text = `${a.prec < 2 ? bracket(a) : a.s}/${b.prec >= 4 ? b.s : bracket(b)}`
      return { s: text, prec: 2, div: true }
    }
    case 'prod': {
      const a = write(n.a)
      const b = write(n.b)
      const left = a.prec < 2 ? bracket(a) : a.s
      // A sum, a fraction or a product on the right of a sign needs its brackets: 1/2 ÷ (1/3).
      const right = b.prec < 3 || b.div || (n.op === 'div' && b.prec < 5) ? bracket(b) : b.s
      if (n.op === 'div') return { s: `${left} \u00f7 ${right}`, prec: 2 }
      if (n.op === 'times') return { s: `${left} \u00d7 ${right}`, prec: 2 }
      // Written next to each other: 2x, 3(x + 1), 2sin(x). A number after a number or a letter has a sign, or it would be read as one number.
      // Euler's number next to a letter has a sign (e times x): the two letters side by side would be read as the one word ex.
      const euler = (m: Node) => m.t === 'atom' && m.euler === true
      if ((euler(n.a) && /^[A-Za-z]/.test(right)) || (euler(n.b) && /[A-Za-z]$/.test(left))) return { s: `${left} \u00d7 ${right}`, prec: 2 }
      // A rand sign in front of an amount is not a letter times a number: R12,50.
      if (a.s === 'R' && startsWithDigit(right)) return { s: `R${right}`, prec: 2 }
      if (startsWithDigit(right)) return { s: `${left} \u00d7 ${right}`, prec: 2 }
      return { s: `${left}${right}`, prec: 2 }
    }
    case 'pow': {
      const a = write(n.a)
      const b = write(n.b)
      const exponent = b.prec === 5 && (ONE_PIECE.test(b.s) || b.s.startsWith('(')) ? b.s : bracket(b)
      return { s: `${asPiece(a)}^${exponent}`, prec: 4 }
    }
    case 'root': {
      const a = write(n.a)
      const inside = a.prec === 5 && (RADICAND.test(a.s) || a.s.startsWith('(')) ? a.s : bracket(a)
      if (!n.n) return { s: `\u221a${inside}`, prec: 5 }
      const index = write(n.n)
      // The cube root has its own sign; any other root is a power of one over its number.
      if (index.s === '3') return { s: `\u221b${inside}`, prec: 5 }
      if (index.s === '2') return { s: `\u221a${inside}`, prec: 5 }
      return { s: `${a.s.startsWith('(') && a.prec === 5 ? a.s : bracket(a)}^(1/${index.s})`, prec: 4 }
    }
    case 'fn': {
      const a = write(n.a)
      const arg = a.prec === 5 && a.s.startsWith('(') ? a.s : bracket(a)
      if (!n.exp) return { s: `${n.name}${arg}`, prec: 5 }
      const e = write(n.exp)
      return { s: `${n.name}^${e.prec === 5 && ONE_PIECE.test(e.s) ? e.s : bracket(e)}${arg}`, prec: 5 }
    }
    case 'deg': {
      const a = write(n.a)
      return { s: `${asPiece(a)}\u00b0`, prec: 5 }
    }
    case 'subs': {
      // x_1, the limits of a sum or an integral: kept as typed (the marking cannot read them yet)
      const a = write(n.a)
      const b = write(n.b)
      return { s: `${asPiece(a)}_${b.prec === 5 && ONE_PIECE.test(b.s) ? b.s : bracket(b)}`, prec: 5 }
    }
    case 'pct': {
      const a = write(n.a)
      return { s: `${asPiece(a)}%`, prec: 5 }
    }
    case 'rel': {
      let s = write(n.parts[0]!).s
      n.ops.forEach((op, i) => {
        s += ` ${op} `
        s += write(n.parts[i + 1]!).s
      })
      return { s, prec: 1 }
    }
  }
}

/** Tidies what MathLive writes for names: \frac{d}{dx} and \frac{dy}{dx} are the Leibniz names, which the marking reads in front of an expression. */
const LEIBNIZ = (latex: string) => latex.replace(/\\[dt]?frac\{d\}\{dx\}/g, '\\mathrm{d/dx}').replace(/\\[dt]?frac\{dy\}\{dx\}/g, '\\mathrm{dy/dx}')

/**
 * The plain notation of the LaTeX of the maths editor. '' for an empty field. Null when the LaTeX cannot be read (a command Jemma has no sign for) or has an
 * empty box left in it (`\placeholder`): the answer is not finished.
 */
export function latexToNotation(latex: string): string | null {
  const src = latex.trim()
  if (!src) return ''
  if (/\\placeholder|\\mathbb\{\}/.test(src)) return null
  try {
    return write(read(lex(LEIBNIZ(src)))).s
  } catch (e) {
    if (e instanceof Unreadable) return null
    throw e
  }
}
