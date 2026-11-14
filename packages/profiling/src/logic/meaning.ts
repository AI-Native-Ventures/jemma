import { MEANING_ANSWER_KINDS, type Form, type MeaningKind } from '../schemas/lesson'
import { markAnswer } from './answers'
import { completeAnswer } from './complete-answer'

/**
 * Marking by meaning, for the senior classes (Mathematics, Grades 7 to 12): a learner types algebra, a negative number, a point, a percent or an
 * angle, and code reads both the key and the answer and compares what they MEAN, not how they are spelt.
 *
 * It sits beside `markAnswer` and `parseAnswer`, which do not change: `markQuestion` sends the four new answer kinds here and every old kind to
 * `markAnswer` exactly as before. The reader is small and written by hand: it never runs text as code and it uses no library. A text over 60
 * characters, or one that does not read, is "not readable" (wrong), never an error.
 *
 *   number      -3, 15%, 30°, √8, 0,5, 1/2           the value; a % or a ° at the end is dropped from both
 *   expression  2x + 3, x², (x+2)(x-2)               the same value at the same points, and the form when the question asks for one
 *   equation    x = 3 or x = -1                      the same set of values for the letter, in any order
 *   point       (2; -3)                              both coordinates
 */

export const MEANING_MAX_LENGTH = 60

const MINUS_SIGNS = /[\u2212\u2010-\u2013]/g
const SUFFIX = /\s*[%\u00b0\u00ba]\s*$/

// ---- Reading -----------------------------------------------------------------------------------------------------------------

type Tok = { k: 'num'; v: number } | { k: 'var'; c: string } | { k: 'sqrt' } | { k: 'op'; c: '+' | '-' | '*' | '/' | '^' } | { k: 'lp' } | { k: 'rp' }

export type MathNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: MathNode }
  | { t: 'group'; a: MathNode }
  | { t: 'sqrt'; a: MathNode }
  | { t: 'pow'; a: MathNode; b: MathNode }
  | { t: 'add' | 'sub' | 'mul' | 'div'; a: MathNode; b: MathNode }

/** The one way a reader gives up. It never leaves this file. */
class Unreadable extends Error {}
const giveUp = (): never => {
  throw new Unreadable('not readable')
}

const SUPERSCRIPT = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'
const SUPER_MINUS = '\u207b'
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isLetter = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))

/** Cuts a text into tokens. A character that means nothing here makes the whole text unreadable. */
const tokenize = (text: string): Tok[] => {
  const s = text.replace(MINUS_SIGNS, '-')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (c === ' ' || c === '\t' || c === '\u00a0') {
      i++
    } else if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let j = i
      while (isDigit(s[j])) j++
      if ((s[j] === '.' || s[j] === ',') && isDigit(s[j + 1])) {
        j++
        while (isDigit(s[j])) j++
      }
      out.push({ k: 'num', v: Number(s.slice(i, j).replace(',', '.')) })
      i = j
    } else if (isLetter(c)) {
      let j = i
      while (isLetter(s[j])) j++
      const run = s.slice(i, j).toLowerCase()
      for (let at = 0; at < run.length; ) {
        if (run.startsWith('sqrt', at)) {
          out.push({ k: 'sqrt' })
          at += 4
        } else {
          out.push({ k: 'var', c: run[at]! })
          at++
        }
      }
      i = j
    } else if (c === '\u221a') {
      out.push({ k: 'sqrt' })
      i++
    } else if (SUPERSCRIPT.includes(c) || c === SUPER_MINUS) {
      let j = i
      const negative = s[j] === SUPER_MINUS
      if (negative) j++
      let digits = ''
      while (j < s.length && SUPERSCRIPT.includes(s[j]!)) {
        digits += SUPERSCRIPT.indexOf(s[j]!)
        j++
      }
      if (!digits) giveUp()
      out.push({ k: 'op', c: '^' })
      if (negative) out.push({ k: 'op', c: '-' })
      out.push({ k: 'num', v: Number(digits) })
      i = j
    } else if (c === '+' || c === '-' || c === '^') {
      out.push({ k: 'op', c })
      i++
    } else if (c === '*' || c === '\u00d7' || c === '\u00b7' || c === '\u22c5') {
      out.push({ k: 'op', c: '*' })
      i++
    } else if (c === '/' || c === '\u00f7' || c === '\u2044') {
      out.push({ k: 'op', c: '/' })
      i++
    } else if (c === '(' || c === '[') {
      out.push({ k: 'lp' })
      i++
    } else if (c === ')' || c === ']') {
      out.push({ k: 'rp' })
      i++
    } else {
      return giveUp()
    }
  }
  return out
}

/**
 * The grammar, from the loosest to the tightest:
 *   sum      := product (('+' | '-') product)*
 *   product  := unary (('*' | '/' | nothing) power)*     nothing is a product too: 2x, 3(x+1), (x+1)(x-1), 2xy, 2√2. It never joins two numbers
 *   unary    := ('-' | '+') unary | power
 *   power    := atom ('^' exponent)?                      x^2, x^(n+1), x², and a power of a power goes from the right
 *   atom     := number | letter | '(' sum ')' | root
 *   root     := ('√' | 'sqrt') (number | letter | '(' sum ')')      the root covers the one number, letter or bracket right after it
 */
const parseTokens = (toks: Tok[]): MathNode => {
  let pos = 0
  const peek = () => toks[pos]
  const opIs = (t: Tok | undefined, ...ops: string[]) => !!t && t.k === 'op' && ops.includes(t.c)

  const sum = (): MathNode => {
    let left = product()
    for (let t = peek(); opIs(t, '+', '-'); t = peek()) {
      pos++
      left = { t: (t as { c: string }).c === '+' ? 'add' : 'sub', a: left, b: product() }
    }
    return left
  }
  const product = (): MathNode => {
    let left = unary()
    for (;;) {
      const t = peek()
      if (opIs(t, '*', '/')) {
        pos++
        left = { t: (t as { c: string }).c === '*' ? 'mul' : 'div', a: left, b: unary() }
      } else if (t && (t.k === 'var' || t.k === 'lp' || t.k === 'sqrt')) {
        left = { t: 'mul', a: left, b: power() }
      } else {
        return left
      }
    }
  }
  const unary = (): MathNode => {
    const t = peek()
    if (opIs(t, '-')) {
      pos++
      return { t: 'neg', a: unary() }
    }
    if (opIs(t, '+')) {
      pos++
      return unary()
    }
    return power()
  }
  const power = (): MathNode => {
    const base = atom()
    if (opIs(peek(), '^')) {
      pos++
      return { t: 'pow', a: base, b: exponent() }
    }
    return base
  }
  const exponent = (): MathNode => {
    const t = peek()
    if (opIs(t, '-')) {
      pos++
      return { t: 'neg', a: exponent() }
    }
    if (opIs(t, '+')) {
      pos++
      return exponent()
    }
    const e = atom()
    if (opIs(peek(), '^')) {
      pos++
      return { t: 'pow', a: e, b: exponent() }
    }
    return e
  }
  const bracket = (): MathNode => {
    const inner = sum()
    if (peek()?.k !== 'rp') giveUp()
    pos++
    return { t: 'group', a: inner }
  }
  const atom = (): MathNode => {
    const t = toks[pos++]
    if (!t) return giveUp()
    if (t.k === 'num') return { t: 'num', v: t.v }
    if (t.k === 'var') return { t: 'var', name: t.c }
    if (t.k === 'lp') return bracket()
    if (t.k === 'sqrt') {
      const r = toks[pos++]
      if (!r) return giveUp()
      if (r.k === 'num') return { t: 'sqrt', a: { t: 'num', v: r.v } }
      if (r.k === 'var') return { t: 'sqrt', a: { t: 'var', name: r.c } }
      if (r.k === 'lp') return { t: 'sqrt', a: bracket() }
    }
    return giveUp()
  }

  const tree = sum()
  if (pos !== toks.length) giveUp()
  return tree
}

/** The tree of a text, or null when it is empty, too long or not readable. */
export const readMath = (text: string): MathNode | null => {
  const s = text.trim()
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  try {
    return parseTokens(tokenize(s))
  } catch (e) {
    if (e instanceof Unreadable) return null
    throw e
  }
}

// ---- Values ------------------------------------------------------------------------------------------------------------------

type Env = Record<string, number>
const defined = (x: number) => (Number.isFinite(x) ? x : NaN)

/** The value of a tree, or NaN where it is not defined (a division by zero, a root of a negative number, a number too large to hold). */
const valueOf = (n: MathNode, env: Env): number => {
  switch (n.t) {
    case 'num':
      return n.v
    case 'var':
      return env[n.name] ?? NaN
    case 'group':
      return valueOf(n.a, env)
    case 'neg':
      return -valueOf(n.a, env)
    case 'sqrt': {
      const a = valueOf(n.a, env)
      return a < 0 ? NaN : defined(Math.sqrt(a))
    }
    case 'add':
      return defined(valueOf(n.a, env) + valueOf(n.b, env))
    case 'sub':
      return defined(valueOf(n.a, env) - valueOf(n.b, env))
    case 'mul':
      return defined(valueOf(n.a, env) * valueOf(n.b, env))
    case 'div': {
      const d = valueOf(n.b, env)
      return Math.abs(d) < 1e-12 ? NaN : defined(valueOf(n.a, env) / d)
    }
    case 'pow': {
      const a = valueOf(n.a, env)
      const b = valueOf(n.b, env)
      if (Number.isNaN(a) || Number.isNaN(b)) return NaN
      if (a === 0 && b <= 0) return NaN
      if (a < 0 && !Number.isInteger(b)) return NaN
      return defined(Math.pow(a, b))
    }
  }
}

export const lettersOf = (n: MathNode, into = new Set<string>()): Set<string> => {
  if (n.t === 'var') into.add(n.name)
  else if (n.t === 'num') return into
  else if (n.t === 'neg' || n.t === 'group' || n.t === 'sqrt') lettersOf(n.a, into)
  else {
    lettersOf(n.a, into)
    lettersOf(n.b, into)
  }
  return into
}

/** Two values are the same when they differ by less than a billionth of their size (and of 1). */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

// ---- A number ----------------------------------------------------------------------------------------------------------------

/** The value of a text made of numbers only (no letter), or null. `suffix` drops a % or a ° at the end. A mixed number "1 1/2" is one and a half. */
const numeric = (text: string, suffix: boolean): number | null => {
  let s = text.replace(MINUS_SIGNS, '-').trim()
  // A long text is not read at all (no pattern below is run on it).
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  if (suffix) s = s.replace(SUFFIX, '')
  const mixed = /^(-?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s)
  if (mixed) {
    const d = Number(mixed[4])
    if (d === 0 || s.length > MEANING_MAX_LENGTH) return null
    return (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / d)
  }
  const tree = readMath(s)
  if (!tree || lettersOf(tree).size > 0) return null
  const v = valueOf(tree, {})
  return Number.isNaN(v) ? null : v
}

// ---- An expression: the same value at the same points -------------------------------------------------------------------------

/**
 * 29 numbers with different sizes, none within 0.1 of a whole or a half, so that no common expression (x - 1, 2x + 1, 1/(x - 3)) is undefined
 * at them. A letter takes one of them at each point; two letters never take the same one at the same point.
 */
export const POINT_POOL = [
  0.31, 0.37, 0.79, 0.61, 0.73, 0.89, 1.17, 1.23, 1.37, 1.61, 1.71, 1.83, 2.11, 2.19, 2.29, 2.63, 2.77, 2.89, 3.13, 3.23, 3.37, 3.61, 3.7, 3.83, 4.13,
  4.27, 4.31, 4.67, 4.79,
]
const BASE_POINTS = 7
const POINTS = 21
const ENOUGH = 5

/** What `letter` is worth at `point`. Points 0 to 6 mix positive and negative; 7 to 13 are large and positive, 14 to 20 large and negative. */
export const letterValue = (letter: string, point: number): number => {
  const index = letter.charCodeAt(0) - 97
  const size = POINT_POOL[(index * 5 + point * 11) % POINT_POOL.length]!
  if (point < BASE_POINTS) return ((index + point) % 2 === 0 ? 1 : -1) * size
  return (point < 14 ? 1 : -1) * (5 + size)
}

/**
 * True when `answer` and `key` give the same value at the fixed points. A point where either is undefined is skipped. At least 5 points must
 * agree and none may disagree. The 7 first points are tried first; only when fewer than 5 of them are defined (a root of x, where x is negative
 * at some of them) the large points that follow are tried too, so that a root is not marked wrong for its own value.
 */
const agreeAtPoints = (key: MathNode, answer: MathNode): boolean => {
  const letters = [...lettersOf(key)]
  let agree = 0
  for (let point = 0; point < POINTS; point++) {
    if (point === BASE_POINTS && agree >= ENOUGH) return true
    const env: Env = {}
    for (const letter of letters) env[letter] = letterValue(letter, point)
    const a = valueOf(answer, env)
    const k = valueOf(key, env)
    if (Number.isNaN(a) || Number.isNaN(k)) continue
    if (!close(a, k)) return false
    agree++
    if (point >= BASE_POINTS && agree >= ENOUGH) return true
  }
  return agree >= ENOUGH
}

// ---- The form of an expression ------------------------------------------------------------------------------------------------

const MAX_FACTORS = 48
const unwrap = (n: MathNode): MathNode => (n.t === 'group' ? unwrap(n.a) : n)
const constant = (n: MathNode): number | null => (lettersOf(n).size === 0 ? valueOf(n, {}) : null)

/** The factors at the top of a text: a product, a quotient or a whole power of a bracket, each factor named once. A sum, or a lone factor, is one. */
const factorsOf = (n: MathNode): MathNode[] => {
  switch (n.t) {
    case 'group': {
      const inner = unwrap(n)
      return inner.t === 'mul' || inner.t === 'div' || inner.t === 'pow' || inner.t === 'neg' ? factorsOf(inner) : [n]
    }
    case 'neg':
      return factorsOf(n.a)
    case 'mul':
    case 'div':
      return [...factorsOf(n.a), ...factorsOf(n.b)]
    case 'pow': {
      const e = constant(n.b)
      if (e !== null && Number.isInteger(e) && e >= 2 && e <= 8) {
        const base = factorsOf(n.a)
        // A power of a power of a power would name thousands of factors: past a few dozen it is one factor.
        return base.length * e > MAX_FACTORS ? [n] : Array.from({ length: e }, () => base).flat()
      }
      return [n]
    }
    default:
      return [n]
  }
}

const isFactorised = (n: MathNode): boolean => {
  const factors = factorsOf(n)
  return factors.length >= 2 && factors.some((f) => lettersOf(f).size > 0)
}

/** True when a bracket is left that a person would have multiplied out. A bracket under a root, in an exponent or under a division line belongs there. */
const bracketLeft = (n: MathNode, allowed: boolean): boolean => {
  switch (n.t) {
    case 'num':
    case 'var':
      return false
    case 'group':
      return !allowed || bracketLeft(n.a, allowed)
    case 'neg':
      return bracketLeft(n.a, allowed)
    case 'sqrt':
      return bracketLeft(n.a, true)
    case 'pow':
      return bracketLeft(n.a, allowed) || bracketLeft(n.b, true)
    case 'div':
      return bracketLeft(n.a, allowed) || bracketLeft(n.b, true)
    default:
      return bracketLeft(n.a, allowed) || bracketLeft(n.b, allowed)
  }
}

const termsOf = (n: MathNode): MathNode[] => {
  if (n.t === 'add' || n.t === 'sub') return [...termsOf(n.a), ...termsOf(n.b)]
  if (n.t === 'neg') return termsOf(n.a)
  return [n]
}

/** The letters of a term and the power of each: 2x²y is "x^2 y^1". Parts that are not a letter to a power (a root, a sum under a line) stand for themselves. */
const signature = (n: MathNode): string => {
  const powers = new Map<string, number>()
  const add = (key: string, by: number): void => {
    powers.set(key, (powers.get(key) ?? 0) + by)
  }
  const walk = (m: MathNode, by: number): void => {
    switch (m.t) {
      case 'num':
        return
      case 'var':
        return add(m.name, by)
      case 'neg':
      case 'group':
        return walk(m.a, by)
      case 'mul':
        walk(m.a, by)
        return walk(m.b, by)
      case 'div':
        walk(m.a, by)
        return walk(m.b, -by)
      case 'pow': {
        const e = constant(m.b)
        const base = unwrap(m.a)
        if (base.t === 'var' && e !== null && Number.isInteger(e)) return add(base.name, by * e)
        if (lettersOf(m).size === 0) return
        return add(JSON.stringify(m), by)
      }
      default:
        if (lettersOf(m).size === 0) return
        return add(JSON.stringify(m), by)
    }
  }
  walk(n, 1)
  return [...powers.entries()]
    .filter(([, p]) => p !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, p]) => `${name}^${p}`)
    .join(' ')
}

/** Expanded: no bracket left, and no two terms with the same letters and powers (the constants count as one kind of term). */
const isExpanded = (n: MathNode): boolean => {
  if (bracketLeft(n, false)) return false
  const seen = new Set<string>()
  for (const term of termsOf(n)) {
    const sig = signature(term)
    if (seen.has(sig)) return false
    seen.add(sig)
  }
  return true
}

const inForm = (n: MathNode, form: Form | undefined): boolean => (form === 'factorised' ? isFactorised(n) : form === 'expanded' ? isExpanded(n) : true)

// ---- An equation: one letter, one or more values ------------------------------------------------------------------------------

type Equation = { letter: string | null; values: number[] }

/** Cuts "x = 3 or x = -1" at `;`, `or`, `and` and at a comma that is not the comma of a decimal (a comma between two digits). */
const pieces = (text: string): string[] => {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === ';' || (c === ',' && !(isDigit(text[i - 1]) && isDigit(text[i + 1])))) {
      out.push(cur)
      cur = ''
    } else if (isLetter(c)) {
      let j = i
      while (isLetter(text[j])) j++
      const run = text.slice(i, j)
      if (/^(or|and)$/i.test(run)) {
        out.push(cur)
        cur = ''
      } else {
        cur += run
      }
      i = j - 1
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

const readEquation = (text: string): Equation | null => {
  const s = text.replace(MINUS_SIGNS, '-').trim()
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  let letter: string | null = null
  const values: number[] = []
  for (const piece of pieces(s)) {
    const sides = piece.split('=')
    if (sides.length > 2) return null
    let valueText = piece
    if (sides.length === 2) {
      const name = /^\s*([a-zA-Z])\s*$/.exec(sides[0]!)
      if (!name) return null
      const found = name[1]!.toLowerCase()
      if (letter !== null && letter !== found) return null
      letter = found
      valueText = sides[1]!
    }
    const v = numeric(valueText, false)
    if (v === null) return null
    values.push(v)
  }
  return values.length > 0 ? { letter, values } : null
}

const distinct = (values: number[]): number[] => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((v, i) => i === 0 || !close(v, sorted[i - 1]!))
}

const sameSet = (a: number[], b: number[]) => {
  const x = distinct(a)
  const y = distinct(b)
  return x.length === y.length && x.every((v, i) => close(v, y[i]!))
}

// ---- A point -----------------------------------------------------------------------------------------------------------------

/** "(a; b)". Brackets are optional. A comma separates the two numbers only when the text has one comma and no semicolon (the comma is a decimal comma otherwise). */
const readPoint = (text: string): [number, number] | null => {
  let s = text.replace(MINUS_SIGNS, '-').trim()
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  if ((s.startsWith('(') && s.endsWith(')')) || (s.startsWith('[') && s.endsWith(']'))) s = s.slice(1, -1)
  let parts: string[]
  if (s.includes(';')) parts = s.split(';')
  else if (s.split(',').length === 2) parts = s.split(',')
  else return null
  if (parts.length !== 2) return null
  const x = numeric(parts[0]!, false)
  const y = numeric(parts[1]!, false)
  return x === null || y === null ? null : [x, y]
}

// ---- Marking -----------------------------------------------------------------------------------------------------------------

export type MeaningMark = { correct: boolean; comparable: boolean }
const WRONG: MeaningMark = { correct: false, comparable: true }
const UNREAD: MeaningMark = { correct: false, comparable: false }

/** True for the four answer kinds that are marked by meaning. */
export const isMeaningKind = (kind: string): kind is MeaningKind => (MEANING_ANSWER_KINDS as readonly string[]).includes(kind)

/**
 * Marks `answer` against `key` by meaning. `comparable` is false when the key or the answer could not be read (and then it is not right).
 * Only an `expression` has a `form`: `factorised` also needs a product of brackets at the top, `expanded` also needs no bracket and no like terms.
 */
export function markByMeaning(kind: MeaningKind, key: string, answer: string, form?: Form): MeaningMark {
  switch (kind) {
    case 'number': {
      const k = numeric(key, true)
      const a = numeric(answer, true)
      return k === null || a === null ? UNREAD : { correct: close(k, a), comparable: true }
    }
    case 'expression': {
      const k = readMath(key)
      const a = readMath(answer)
      if (!k || !a) return UNREAD
      const allowed = lettersOf(k)
      for (const letter of lettersOf(a)) if (!allowed.has(letter)) return WRONG
      return { correct: agreeAtPoints(k, a) && inForm(a, form), comparable: true }
    }
    case 'equation': {
      const k = readEquation(key)
      const a = readEquation(answer)
      if (!k || !a) return UNREAD
      if (k.letter !== null && a.letter !== null && k.letter !== a.letter) return WRONG
      return { correct: sameSet(k.values, a.values), comparable: true }
    }
    case 'point': {
      const k = readPoint(key)
      const a = readPoint(answer)
      if (!k || !a) return UNREAD
      return { correct: close(k[0], a[0]) && close(k[1], a[1]), comparable: true }
    }
  }
}

/** The one place a lesson question is marked: the four new kinds by meaning, every old kind by `markAnswer` exactly as it always was. */
export function markQuestion(q: { answer: string; answerKind: string; form?: Form }, answer: string): MeaningMark {
  return isMeaningKind(q.answerKind) ? markByMeaning(q.answerKind, q.answer, answer, q.form) : markAnswer(answer, q.answer)
}

/**
 * Finishes and marks what a learner typed, on the screen or on paper (the server action that takes an answer and `save_practice_answers` both call
 * this one function, so the two always agree). A question of a new kind is stored as typed and marked by meaning; every other question goes through
 * `completeAnswer` exactly as it always did (a missing number put back into its fraction, then `markAnswer`).
 */
export function finishAnswer(
  q: { prompt: string; answer: string; answerKind: string; form?: Form; choices?: string[] },
  typed: string,
): { stored: string; correct: boolean } {
  if (isMeaningKind(q.answerKind)) return { stored: typed.trim(), correct: markQuestion(q, typed).correct }
  return completeAnswer(q, typed)
}

const ARTICLE: Record<MeaningKind, string> = { number: 'a number', expression: 'an expression', equation: 'an equation', point: 'a point' }

/**
 * Why a key cannot be marked by its kind, or null when it can: a `number` has no letter, an `expression` has a letter, an `equation` has at least
 * one value (and one letter at most), a `point` has two numbers. The save gate of a lesson asks this of every key of a new kind.
 */
export function meaningKeyProblem(kind: MeaningKind, key: string): string | null {
  const fine =
    kind === 'number' ? numeric(key, true) !== null
    : kind === 'expression' ? (() => {
        const tree = readMath(key)
        return !!tree && lettersOf(tree).size > 0
      })()
    : kind === 'equation' ? readEquation(key) !== null
    : readPoint(key) !== null
  return fine ? null : `answer "${key}" is not ${ARTICLE[kind]}`
}

/** A word is not algebra: three letters or more and nothing else ("angle" and "angel" are the same product of letters, and not the same word). */
const isPlainWord = (text: string) => /^[A-Za-z\s]+$/.test(text.trim()) && text.replace(/[^A-Za-z]/g, '').length > 2

/**
 * The class test path, where today a text key or a text answer cannot be compared (`markAnswer` says `comparable: false`): when the first kind that
 * reads the key (number, point, equation, expression) also reads the answer and they are equal by its rule, the answer is right. Anything else is
 * not decided here, so it stays as it is today (a doubtful answer goes to the teacher).
 */
export function markReadAnswer(key: string, answer: string): boolean {
  for (const kind of ['number', 'point', 'equation', 'expression'] as const) {
    if (meaningKeyProblem(kind, key) !== null) continue
    if (kind === 'expression' && isPlainWord(key)) return false
    return markByMeaning(kind, key, answer).correct
  }
  return false
}
