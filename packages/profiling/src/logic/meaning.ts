import { MEANING_ANSWER_KINDS, type Choice, type Form, type MeaningKind } from '../schemas/lesson'
import { markAnswer } from './answers'
import { markQuantity, type QuantityFields } from './answers/quantity'
import { markRatio, asksSimplest, readRatio } from './answers/ratio'
import { markTime, readTime } from './answers/time'
import { equationFamilyReadable, expandPlusMinus, isLetteredPairKey, isSetKey, markEquationFamily, type EquationTools } from './answers/equation-family'
import { finishPicked } from './answers/pick'
import { completeAnswer } from './complete-answer'
import { isListKind, markListQuestion } from './answers/lists'
import { markLine } from './answers/line'
import { markSketch } from './answers/plot'
import { markClock } from './answers/clock'
import { markProof } from './answers/proof'
import { markGeneral } from './answers/general'

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
 *               5√2, √5 + 1, 5 + 2√6                 a surd with no letter (P133): the same value (a root with no letter is the one letterless expression)
 *   equation    x = 3 or x = -1                      the same set of values for the letter, in any order
 *   point       (2; -3)                              both coordinates
 *
 * P125: the answer box has keys for fractions, roots, pi, theta, degrees, sin, cos and tan, so this reader takes all of them: the signs
 * `\u2212 \u00d7 \u00f7 \u03c0 \u03b8 \u221a \u00b2 \u00b0 \u00b1` and the words `sin cos tan sqrt pi`, a fraction `a/b` (`(x+1)/(x-1)` too), a mixed number, a
 * rand sign and a space between thousands in a number, and in an expression the name of a function or a derivative in front (`f(x) =`, `f\u2032(x) =`,
 * `dy/dx =`, `y =`). The angle of sin, cos and tan is in degrees when it is a plain number, and in radians when it holds a letter or pi.
 *
 * P132: the cube root sign \u221b (and cbrt). P132b: Euler's number (the letter e on its own), ln and log (base 10), asin acos atan (arcsin too: the answer is
 * in degrees for a plain number), abs for |x|, the Greek letters alpha beta gamma delta phi lambda omega as letters, and in an equation the relations
 * < > <= >= != (and the signs of them): "x <= 3", "3 > x", "-2 < x <= 5", "x < -1 or x > 4" are the same when the same numbers are on the line.
 *
 * P147: an equation answer may also be an interval ((-inf; 3] is x <= 3, (-inf; -1) U (4; inf) is x < -1 or x > 4), a domain or a range (x in R, all real numbers),
 * a plus or minus with a root or a fraction (x = 1 +- sqrt(3)), a pair (x = 2 and y = 3, (2; 3)) or an equation of two letters or more (a circle, a line). That
 * reader is `answers/equation-family.ts`; this file calls it when the key or the answer is one of those, and reads everything else as it always did.
 */

export const MEANING_MAX_LENGTH = 60

const MINUS_SIGNS = /[\u2212\u2010-\u2013]/g
const SUFFIX = /\s*[%\u00b0\u00ba]\s*$/

// ---- Reading -----------------------------------------------------------------------------------------------------------------

/** sin, cos and tan; asin, acos and atan are the inverse functions (sin with a little -1 in a book); ln and log are the logarithms (log is base 10); abs is |x|. */
export type TrigName = 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'ln' | 'log' | 'abs'

type Tok =
  | { k: 'num'; v: number; raw: string }
  | { k: 'var'; c: string }
  /** A square root, or a cube root (the cube root sign, or the word cbrt). */
  | { k: 'sqrt'; cube?: true }
  | { k: 'pi' }
  /** Euler's number, written e on its own. */
  | { k: 'e' }
  | { k: 'deg' }
  | { k: 'fn'; name: TrigName }
  | { k: 'op'; c: '+' | '-' | '*' | '/' | '^'; explicit?: boolean }
  | { k: 'lp' }
  | { k: 'rp' }

export type MathNode =
  /** `raw` is the number as it was typed ("0,50"), for the line that shows it back. */
  | { t: 'num'; v: number; raw?: string }
  | { t: 'var'; name: string }
  | { t: 'pi' }
  | { t: 'e' }
  /** A degree sign after a value. It does not change the value: 30 and 30\u00b0 are the same angle. */
  | { t: 'deg'; a: MathNode }
  | { t: 'fn'; name: TrigName; a: MathNode }
  | { t: 'neg'; a: MathNode }
  | { t: 'group'; a: MathNode }
  | { t: 'sqrt'; a: MathNode; /** a cube root: it takes the root of a negative number too (the cube root of -8 is -2) */ cube?: true }
  | { t: 'pow'; a: MathNode; b: MathNode }
  | { t: 'add' | 'sub' | 'mul' | 'div'; a: MathNode; b: MathNode; /** a product typed with a sign (2 \u00d7 3), not by writing the two next to each other */ explicit?: boolean }

/** The one way a reader gives up. It never leaves this file. */
class Unreadable extends Error {}
const giveUp = (): never => {
  throw new Unreadable('not readable')
}

const SUPERSCRIPT = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'
const SUPER_MINUS = '\u207b'
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isLetter = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
const PI_SIGN = '\u03c0'
const THETA_SIGN = '\u03b8'
const DEGREE_SIGNS = '\u00b0\u00ba'
/** The words of the functions, the longest first, and the function each one is. arcsin is asin. */
const FUNCTION_WORDS: [word: string, name: TrigName][] = [
  ['arcsin', 'asin'],
  ['arccos', 'acos'],
  ['arctan', 'atan'],
  ['asin', 'asin'],
  ['acos', 'acos'],
  ['atan', 'atan'],
  ['sin', 'sin'],
  ['cos', 'cos'],
  ['tan', 'tan'],
  ['log', 'log'],
  ['abs', 'abs'],
  ['ln', 'ln'],
]
/** The letters of a variable besides a to z: theta, the angle of a trigonometry question. */
const isTheta = (c: string | undefined) => c === THETA_SIGN || c === '\u0398'
/** The Greek letters a geometry answer names an angle or a length with, besides theta: alpha beta gamma delta phi lambda omega. */
const GREEK = '\u03b1\u03b2\u03b3\u03b4\u03c6\u03bb\u03c9'
const isGreek = (c: string | undefined) => c !== undefined && GREEK.includes(c)

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
      out.push({ k: 'num', v: Number(s.slice(i, j).replace(',', '.')), raw: s.slice(i, j) })
      i = j
    } else if (isLetter(c)) {
      let j = i
      while (isLetter(s[j])) j++
      const word = s.slice(i, j)
      const run = word.toLowerCase()
      // The word pi is pi only when it stands alone (2pi, pi r, pi/2), and not "Pi" or a longer run: P i n is a product of three letters
      // (simple interest), not pi times n.
      if (word === 'pi' || word === 'PI') {
        out.push({ k: 'pi' })
      } else if (word === 'e') {
        // The letter e on its own is Euler's number (e^x, 2e). A longer run is letters: ex is e times x as two letters.
        out.push({ k: 'e' })
      } else {
        for (let at = 0; at < run.length; ) {
          const found = FUNCTION_WORDS.find(([w]) => run.startsWith(w, at))
          if (run.startsWith('sqrt', at)) {
            out.push({ k: 'sqrt' })
            at += 4
          } else if (run.startsWith('cbrt', at)) {
            out.push({ k: 'sqrt', cube: true })
            at += 4
          } else if (found) {
            out.push({ k: 'fn', name: found[1] })
            at += found[0].length
          } else {
            out.push({ k: 'var', c: run[at]! })
            at++
          }
        }
      }
      i = j
    } else if (c === PI_SIGN) {
      out.push({ k: 'pi' })
      i++
    } else if (isTheta(c)) {
      out.push({ k: 'var', c: THETA_SIGN })
      i++
    } else if (isGreek(c)) {
      out.push({ k: 'var', c })
      i++
    } else if (DEGREE_SIGNS.includes(c)) {
      out.push({ k: 'deg' })
      i++
    } else if (c === '\u221a') {
      out.push({ k: 'sqrt' })
      i++
    } else if (c === '\u221b') {
      out.push({ k: 'sqrt', cube: true })
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
      out.push({ k: 'num', v: Number(digits), raw: digits })
      i = j
    } else if (c === '+' || c === '-' || c === '^') {
      out.push({ k: 'op', c })
      i++
    } else if (c === '*' || c === '\u00d7' || c === '\u00b7' || c === '\u22c5') {
      out.push({ k: 'op', c: '*', explicit: true })
      i++
    } else if (c === '/' || c === '\u00f7' || c === '\u2044') {
      // A division sign is remembered, so the line that shows an answer back can draw it as a sign and not as a fraction.
      out.push(c === '\u00f7' ? { k: 'op', c: '/', explicit: true } : { k: 'op', c: '/' })
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
 *   power    := atom '°'* ('^' exponent)?                 x^2, x^(n+1), x², 30°, and a power of a power goes from the right
 *   atom     := number | letter | 'π' | '(' sum ')' | root | trig
 *   root     := ('√' | 'sqrt' | '∛' | 'cbrt') (number | letter | 'π' | '(' sum ')')      the root covers the one number, letter or bracket right after it
 *   trig     := ('sin' | 'cos' | 'tan') ('^' exponent)? argument         sin(30°), sin 30, sin²x, sin^2(x), sin 2x
 *   argument := '(' sum ')' | '-'? term                   a term is numbers, letters, π and roots written next to each other, with their powers and degree signs
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
        left =
          (t as { c: string }).c === '*'
            ? { t: 'mul', a: left, b: unary(), ...((t as { explicit?: boolean }).explicit ? { explicit: true } : {}) }
            : { t: 'div', a: left, b: unary(), ...((t as { explicit?: boolean }).explicit ? { explicit: true } : {}) }
      } else if (t && (t.k === 'var' || t.k === 'lp' || t.k === 'sqrt' || t.k === 'pi' || t.k === 'e' || t.k === 'fn')) {
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
    let base = atom()
    while (peek()?.k === 'deg') {
      pos++
      base = { t: 'deg', a: base }
    }
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
  /** What a trig name works on: a bracket, or a term (2x, 30°, π, √2) with an optional minus in front. A name inside another needs a bracket. */
  const argument = (): MathNode => {
    const t = peek()
    if (opIs(t, '-')) {
      pos++
      return { t: 'neg', a: argument() }
    }
    if (t?.k === 'lp') {
      pos++
      return bracket()
    }
    const term = (): MathNode => {
      const k = peek()?.k
      return k === 'num' || k === 'var' || k === 'pi' || k === 'e' || k === 'sqrt' ? power() : giveUp()
    }
    let arg = term()
    for (let k = peek()?.k; k === 'var' || k === 'pi' || k === 'e' || k === 'sqrt'; k = peek()?.k) arg = { t: 'mul', a: arg, b: term() }
    return arg
  }
  const atom = (): MathNode => {
    const t = toks[pos++]
    if (!t) return giveUp()
    if (t.k === 'num') return { t: 'num', v: t.v, raw: t.raw }
    if (t.k === 'var') return { t: 'var', name: t.c }
    if (t.k === 'pi') return { t: 'pi' }
    if (t.k === 'e') return { t: 'e' }
    if (t.k === 'lp') return bracket()
    if (t.k === 'fn') {
      let to: MathNode | null = null
      if (opIs(peek(), '^')) {
        pos++
        to = exponent()
      }
      const call: MathNode = { t: 'fn', name: t.name, a: argument() }
      return to ? { t: 'pow', a: call, b: to } : call
    }
    if (t.k === 'sqrt') {
      const r = toks[pos++]
      if (!r) return giveUp()
      const cube = t.cube ? { cube: true as const } : {}
      if (r.k === 'num') return { t: 'sqrt', a: { t: 'num', v: r.v, raw: r.raw }, ...cube }
      if (r.k === 'var') return { t: 'sqrt', a: { t: 'var', name: r.c }, ...cube }
      if (r.k === 'pi') return { t: 'sqrt', a: { t: 'pi' }, ...cube }
      if (r.k === 'e') return { t: 'sqrt', a: { t: 'e' }, ...cube }
      if (r.k === 'lp') return { t: 'sqrt', a: bracket(), ...cube }
    }
    return giveUp()
  }

  const tree = sum()
  if (pos !== toks.length) giveUp()
  return tree
}

/**
 * The name of a function or of a derivative that may stand in front of an expression answer, with its equals sign: y =, f(x) =, f\u2032(x) =, f'(x) =, y\u2032 =,
 * dy/dx =, d/dx =. The keys of a function question and of a derivative question type it. A letter of an answer is never taken away: x = 3 is not one.
 */
const NAMED = /^\s*(?:dy\s*\/\s*dx|d\s*\/\s*dx|[fgh]\s*['\u2032\u2019]*\s*\(\s*[a-z\u03b8]\s*\)|y\s*['\u2032\u2019]*)\s*=\s*/i

/** An expression as it is marked: with the name in front of it taken off. */
export const readExpression = (text: string): MathNode | null => readMath(text.replace(NAMED, ''))

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

/** True when a tree has no letter and no pi in it: a plain angle, which sin, cos and tan take in degrees. With a letter or pi in it the angle is in radians. */
const inDegrees = (n: MathNode): boolean => {
  switch (n.t) {
    case 'num':
      return true
    case 'var':
    case 'pi':
    case 'e':
      return false
    case 'neg':
    case 'group':
    case 'sqrt':
    case 'deg':
    case 'fn':
      return inDegrees(n.a)
    default:
      return inDegrees(n.a) && inDegrees(n.b)
  }
}

/** The value of a tree, or NaN where it is not defined (a division by zero, a root of a negative number, a number too large to hold). */
const valueOf = (n: MathNode, env: Env): number => {
  switch (n.t) {
    case 'num':
      return n.v
    case 'var':
      return env[n.name] ?? NaN
    case 'pi':
      return Math.PI
    case 'e':
      return Math.E
    case 'deg':
    case 'group':
      return valueOf(n.a, env)
    case 'fn': {
      const v = valueOf(n.a, env)
      if (Number.isNaN(v)) return NaN
      if (n.name === 'ln') return v > 0 ? defined(Math.log(v)) : NaN
      if (n.name === 'log') return v > 0 ? defined(Math.log10(v)) : NaN
      if (n.name === 'abs') return Math.abs(v)
      // The inverse functions give an angle: in degrees when what they are given is a plain number (sin^-1 of 0,5 is 30), in radians when it holds a letter.
      if (n.name === 'asin' || n.name === 'acos' || n.name === 'atan') {
        if (n.name !== 'atan' && Math.abs(v) > 1) return NaN
        const radians = n.name === 'asin' ? Math.asin(v) : n.name === 'acos' ? Math.acos(v) : Math.atan(v)
        return defined(inDegrees(n.a) ? (radians * 180) / Math.PI : radians)
      }
      const angle = inDegrees(n.a) ? (v * Math.PI) / 180 : v
      if (n.name === 'sin') return defined(Math.sin(angle))
      if (n.name === 'cos') return defined(Math.cos(angle))
      // The tangent of an angle with no cosine (90 degrees) is not defined.
      return Math.abs(Math.cos(angle)) < 1e-12 ? NaN : defined(Math.tan(angle))
    }
    case 'neg':
      return -valueOf(n.a, env)
    case 'sqrt': {
      const a = valueOf(n.a, env)
      if (n.cube) return defined(Math.cbrt(a))
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
  else if (n.t === 'num' || n.t === 'pi' || n.t === 'e') return into
  else if (n.t === 'neg' || n.t === 'group' || n.t === 'sqrt' || n.t === 'deg' || n.t === 'fn') lettersOf(n.a, into)
  else {
    lettersOf(n.a, into)
    lettersOf(n.b, into)
  }
  return into
}

/**
 * P176: the graph of the equation in a text ("Sketch y = x² − 4. Tap where it cuts the x-axis."), as a function of x, or null when the text has none that can
 * be read. The equation is the first `y =` (or `f(x) =`) followed by maths of x alone: the longest piece after it that reads, up to a space or the end, with
 * the full stop or comma after it left off.
 */
export function graphEquationOf(text: string): ((x: number) => number) | null {
  for (const m of text.matchAll(/(?:^|[^a-z0-9])(?:y|[fgh]\s*\(\s*x\s*\))\s*=\s*/gi)) {
    const rest = text.slice(m.index + m[0].length)
    const ends = [rest.length, ...[...rest.matchAll(/\s/g)].map((w) => w.index)].sort((a, b) => b - a)
    for (const end of ends) {
      const piece = rest.slice(0, end).replace(/[\s.,;:!?]+$/, '')
      if (!piece || piece.length > MEANING_MAX_LENGTH) continue
      const tree = readMath(piece)
      if (!tree) continue
      const letters = lettersOf(tree)
      if (letters.size === 1 && letters.has('x')) return (x: number) => valueOf(tree, { x })
    }
  }
  return null
}

/** A tree with a letter put in as a number: the angle of a trig equation in degrees, so sin, cos and tan take it in degrees (a plain angle, as `inDegrees` says). */
const putIn = (n: MathNode, letter: string, v: number): MathNode => {
  switch (n.t) {
    case 'var':
      return n.name === letter ? { t: 'num', v } : n
    case 'num':
    case 'pi':
    case 'e':
      return n
    case 'deg':
    case 'fn':
    case 'neg':
    case 'group':
      return { ...n, a: putIn(n.a, letter, v) }
    case 'sqrt':
      return { ...n, a: putIn(n.a, letter, v) }
    default:
      return { ...n, a: putIn(n.a, letter, v), b: putIn(n.b, letter, v) }
  }
}

/**
 * P180: the trig equation in a text ("Find the general solution of sin θ = 0,5."), as the difference of its two sides for an angle in degrees (0 at a solution), or
 * null when the text has none that can be read. The left side is the longest piece before the first equals sign that reads as maths with `letter` in it; the
 * right side the longest piece after it that reads, up to a space or the end, with no other letter.
 */
export function degreeEquationOf(text: string, letter: string): ((degrees: number) => number) | null {
  const at = text.indexOf('=')
  if (at < 0) return null
  const before = text.slice(0, at)
  const after = text.slice(at + 1)
  const only = (tree: MathNode, needed: boolean) => {
    const letters = lettersOf(tree)
    return [...letters].every((l) => l === letter) && (!needed || letters.has(letter))
  }
  const starts = [0, ...[...before.matchAll(/\s/g)].map((w) => w.index + 1)].sort((x, y) => x - y)
  let left: MathNode | null = null
  for (const start of starts) {
    const piece = before.slice(start).trim()
    if (!piece || piece.length > MEANING_MAX_LENGTH) continue
    const tree = readMath(piece)
    if (tree && only(tree, true)) {
      left = tree
      break
    }
  }
  if (!left) return null
  const ends = [after.length, ...[...after.matchAll(/\s/g)].map((w) => w.index)].sort((x, y) => y - x)
  let right: MathNode | null = null
  for (const end of ends) {
    const piece = after.slice(0, end).replace(/[\s.,;:!?]+$/, '')
    if (!piece || piece.length > MEANING_MAX_LENGTH) continue
    const tree = readMath(piece)
    if (tree && only(tree, false)) {
      right = tree
      break
    }
  }
  if (!right) return null
  const l = left
  const r = right
  return (degrees: number) => valueOf(putIn(l, letter, degrees), {}) - valueOf(putIn(r, letter, degrees), {})
}

/** Two values are the same when they differ by less than a billionth of their size (and of 1). */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/**
 * P179: true when two expressions have the same value at the same points, whichever letters each one has (a line of a proof and the line before it:
 * sin²x + cos²x and 1), as `agreeAtPoints` compares a key and an answer; null when one cannot be read.
 */
export function sameExpression(a: string, b: string): boolean | null {
  const x = readExpression(a)
  const y = readExpression(b)
  if (!x || !y) return null
  const letters = [...new Set([...lettersOf(x), ...lettersOf(y)])]
  let agree = 0
  for (let point = 0; point < POINTS; point++) {
    if (point === BASE_POINTS && agree >= ENOUGH) return true
    const env: Env = {}
    for (const letter of letters) env[letter] = letterValue(letter, point)
    const p = valueOf(x, env)
    const q = valueOf(y, env)
    if (Number.isNaN(p) || Number.isNaN(q)) continue
    if (!close(p, q)) return false
    agree++
  }
  return agree >= ENOUGH
}

// ---- A root (P133) -----------------------------------------------------------------------------------------------------------

/** True when a tree holds a root (a surd such as 5√2, or √5 + 1). A letter or a number next to a root is already a product: the reader needed no change for it. */
const hasRoot = (n: MathNode): boolean => /^(sqrt|cbrt)$/.test(n.t) || ('a' in n && hasRoot(n.a)) || ('b' in n && hasRoot(n.b))

/** A decimal of three places or more: 7.071, 7,0711. Two places or fewer is not enough to say which surd it is a rounding of. */
const ROUNDED_DECIMAL = /^-?\d*[.,](\d{3,})$/

/**
 * True when `answer` is a decimal of at least three places that is `value` rounded to that many places, and `key` holds a root: 7.071 for 5√2
 * (7.0710678), 3.464 for 2√3. A key with no root is compared exactly, as it always was, and a decimal that is rounded the wrong way stays wrong.
 */
const roundedSurd = (key: string, answer: string, value: number): boolean => {
  const tree = readMath(key)
  if (!tree || !hasRoot(tree)) return false
  const typed = ROUNDED_DECIMAL.exec(answer.replace(MINUS_SIGNS, '-').trim())
  if (!typed) return false
  const places = typed[1]!.length
  return close(Number(answer.replace(MINUS_SIGNS, '-').trim().replace(',', '.')), Number(value.toFixed(places)))
}

// ---- A number ----------------------------------------------------------------------------------------------------------------

/** The value of a text made of numbers only (no letter), or null. `suffix` drops a % or a ° at the end. A mixed number "1 1/2" is one and a half. */
const numeric = (text: string, suffix: boolean): number | null => {
  let s = text.replace(MINUS_SIGNS, '-').replace(/[\u00a0\u2009\u202f]/g, ' ').trim()
  // A long text is not read at all (no pattern below is run on it).
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  if (suffix) s = s.replace(SUFFIX, '')
  // A rand sign in front of the amount (the R key), and a space between the thousands: R1 250,50 is 1250,5.
  s = s.replace(/^(-?)\s*R\s*(?=[\d.,])/, '$1')
  if (/^-?\d{1,3}( \d{3})+([.,]\d+)?$/.test(s)) s = s.replace(/ /g, '')
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
    case 'pi':
    case 'e':
      return false
    case 'group':
      return !allowed || bracketLeft(n.a, allowed)
    case 'neg':
    case 'deg':
      return bracketLeft(n.a, allowed)
    case 'sqrt':
    case 'fn':
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
      case 'pi':
      case 'e':
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

export type Equation = { letter: string | null; values: number[] }

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

/** The label a paper sheet prints for each answer of a question with several ("Answer 1: ____  Answer 2: ____", P146): not part of the answer. */
const FIRST_LABEL = /^\s*answers?\s*\d+\s*[:.)]?/i
const LABEL = /\banswers?\s*\d+\s*[:.)]?/gi

/** The values of several readings of an equation put together: they must all read, and name the same letter (or none). */
const mergeEquations = (parts: (Equation | null)[]): Equation | null => {
  let letter: string | null = null
  const values: number[] = []
  for (const part of parts) {
    if (!part) return null
    if (part.letter !== null) {
      if (letter !== null && letter !== part.letter) return null
      letter = part.letter
    }
    values.push(...part.values)
  }
  return { letter, values }
}

export const readEquation = (text: string): Equation | null => {
  // P147: x = 1 ± √3 is two values. Each text that sign stands for is read, and the values of all of them are the values of the equation.
  const expanded = expandPlusMinus(text)
  if (expanded) return mergeEquations(expanded.map(readEquation))
  const s = text.replace(MINUS_SIGNS, '-').replace(FIRST_LABEL, '').replace(LABEL, ';').trim()
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  let letter: string | null = null
  const values: number[] = []
  for (const piece of pieces(s)) {
    const sides = piece.split('=')
    if (sides.length > 2) return null
    let valueText = piece
    if (sides.length === 2) {
      const name = /^\s*([a-zA-Z\u03b8\u0398\u03b1\u03b2\u03b3\u03b4\u03c6\u03bb\u03c9])\s*$/.exec(sides[0]!)
      if (!name) return null
      const found = name[1]!.toLowerCase()
      if (letter !== null && letter !== found) return null
      letter = found
      valueText = sides[1]!
    }
    // x = \u00b12 is two values: 2 and -2.
    const both = /^\s*(?:\u00b1|\+\s*\/?\s*-)\s*/.exec(valueText)
    const v = numeric(both ? valueText.slice(both[0].length) : valueText, false)
    if (v === null) return null
    values.push(v)
    if (both) values.push(-v)
  }
  return values.length > 0 ? { letter, values } : null
}

// ---- An inequality: one letter, and the part of the number line it may be on --------------------------------------------------

type Op = '<' | '<=' | '>' | '>=' | '!=' | '='
/** All of these hold at once. */
type Branch = { op: Op; v: number }[]
export type Inequality = { letter: string; branches: Branch[] }

const RELATION = /(<=|>=|!=|≤|≥|≠|<|>|=)/
const OPS: Record<string, Op> = { '<=': '<=', '≤': '<=', '>=': '>=', '≥': '>=', '!=': '!=', '≠': '!=', '<': '<', '>': '>', '=': '=' }
const FLIPPED: Record<Op, Op> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '!=': '!=', '=': '=' }
const LETTER_ALONE = /^\s*([a-zA-ZθΘαβγδφλω])\s*$/

/**
 * "x < 3", "3 <= x", "-2 < x <= 5", "x != 0", "x < -1 or x > 4", "x > 1 and x < 5". `needed` says a sign of inequality must be in the text (the key of an
 * inequality has one); an answer may be a plain "x = 3" too. Null when it does not read: more than one letter, or a side that is not a number.
 */
export const readInequality = (text: string, needed: boolean): Inequality | null => {
  const s = text.replace(MINUS_SIGNS, '-').trim()
  if (!s || s.length > MEANING_MAX_LENGTH) return null
  if (needed && !/[<>≤≥≠]|!=/.test(s)) return null
  let letter: string | null = null
  const branches: Branch[] = []
  for (const alternative of s.split(/\bor\b/i)) {
    const branch: Branch = []
    for (const part of alternative.replace(/(\d),(\d)/g, '$1.$2').split(/\band\b|;|,/i)) {
      const items = part.split(RELATION)
      if (items.length < 3) return null
      for (let i = 1; i < items.length; i += 2) {
        const [left, right] = [items[i - 1]!, items[i + 1]!]
        const op = OPS[items[i]!]!
        const [l, r] = [LETTER_ALONE.exec(left), LETTER_ALONE.exec(right)]
        const name = (l ?? r)?.[1]?.toLowerCase()
        if (!name || (l && r)) return null
        if (letter !== null && letter !== name) return null
        letter = name
        const v = numeric(l ? right : left, false)
        if (v === null) return null
        branch.push({ op: l ? op : FLIPPED[op], v })
      }
    }
    branches.push(branch)
  }
  return letter === null ? null : { letter, branches }
}

const holds = (c: { op: Op; v: number }, x: number): boolean => {
  const same = close(x, c.v)
  switch (c.op) {
    case '=':
      return same
    case '!=':
      return !same
    case '<':
      return x < c.v && !same
    case '<=':
      return x < c.v || same
    case '>':
      return x > c.v && !same
    case '>=':
      return x > c.v || same
  }
}
const inside = (q: Inequality, x: number): boolean => q.branches.some((b) => b.every((c) => holds(c, x)))

/** Two inequalities are the same when the same numbers are on them: tried at every number they name, between each two of them, and beyond the first and the last. */
const sameInequality = (a: Inequality, b: Inequality): boolean => {
  const named = [...a.branches, ...b.branches].flat().map((c) => c.v).sort((x, y) => x - y)
  const values = named.filter((v, i) => i === 0 || !close(v, named[i - 1]!))
  const samples = [...values, values[0]! - 1, values[values.length - 1]! + 1, ...values.slice(1).map((v, i) => (v + values[i]!) / 2)]
  return samples.every((x) => inside(a, x) === inside(b, x))
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

// ---- The harder equation answers (P147) --------------------------------------------------------------------------------------

/** What `answers/equation-family.ts` reads with: it imports nothing from this file at run time, this file hands it these. */
const EQUATION_TOOLS: EquationTools = {
  max: MEANING_MAX_LENGTH,
  numeric,
  readMath,
  valueOf,
  lettersOf,
  letterValue,
  close,
  readInequality,
  readEquation,
}

/**
 * True when a key of the equation kind is an inequality: x < 4, -2 <= x < 3, x < -1 or x > 4, an interval ((-inf; 3], [2; inf), (1; 4), a union), x in R, all real
 * numbers. The screen is told this (and only this, never the values) to say "Type the answer, like x < 4 or -2 ≤ x < 3.".
 */
export const isInequalityKey = (key: string): boolean => readInequality(key, true) !== null || isSetKey(key, EQUATION_TOOLS)

/** True when a key of the equation kind is a pair written with its letters (x = 2 and y = 3): one answer, not two to choose from. */
export const isPairKey = (key: string): boolean => isLetteredPairKey(key, EQUATION_TOOLS)

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
      return k === null || a === null ? UNREAD : { correct: close(k, a) || roundedSurd(key, answer, k), comparable: true }
    }
    case 'expression': {
      const k = readExpression(key)
      const a = readExpression(answer)
      if (!k || !a) return UNREAD
      const allowed = lettersOf(k)
      for (const letter of lettersOf(a)) if (!allowed.has(letter)) return WRONG
      return { correct: agreeAtPoints(k, a) && inForm(a, form), comparable: true }
    }
    case 'equation': {
      // P147: an interval, a set of numbers, a pair or an equation of two letters, on either side: the reader of answers/equation-family.ts marks it.
      const family = markEquationFamily(key, answer, EQUATION_TOOLS)
      if (family) return family
      // An inequality (x <= 3, -2 < x < 5, x != 0): the same numbers must be on it. An answer that is not one (x = 3) is a different answer.
      const ki = readInequality(key, true)
      if (ki) {
        const ai = readInequality(answer, false)
        if (!ai) return UNREAD
        return ai.letter !== ki.letter ? WRONG : { correct: sameInequality(ki, ai), comparable: true }
      }
      if (readInequality(answer, true)) return WRONG
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
    // P148: a time (14:30 = 2:30 pm, 2 h 15 min = 135 min) and a ratio (3 : 4 = 6 : 8): logic/answers/time.ts and ratio.ts.
    case 'time':
      return markTime(key, answer)
    case 'ratio':
      return markRatio(key, answer)
  }
}

/**
 * The one place a lesson question is marked: the new kinds by meaning, every old kind by `markAnswer` exactly as it always was.
 * P148: an answer that is not right is looked at once more as a quantity (a unit, money to the cent, a percent, a rounded number: logic/answers/quantity.ts),
 * and a ratio asked in its simplest form is marked by that. An answer that was right stays right.
 */
export function markQuestion(
  q: { answer: string; answerKind: string; form?: Form; ordered?: boolean; labels?: string[]; round?: number },
  answer: string,
): MeaningMark {
  // P174: a line drawn on a grid is right when its two points are on the key's line, whichever two they are (logic/answers/line.ts).
  if ((q as { line?: unknown }).line && q.answerKind === 'list') return markLine(q.answer, answer, readNumber)
  // P176: a sketch is marked by its curve: three points of the same parabola are right, in any order (logic/answers/plot.ts). P181: and a hyperbola or a cubic graph.
  const curve = (q as { plot?: { curve?: 'parabola' | 'hyperbola' | 'cubic' } }).plot?.curve
  if (curve && q.answerKind === 'list') return markSketch(q.answer, answer, readNumber, curve)
  // P177: a clock is marked on its face: twelve hours apart is the same time (logic/answers/clock.ts).
  if ((q as { clock?: unknown }).clock && q.answerKind === 'time') return markClock(q.answer, answer)
  // P179: a proof is right when each line equals the one before it and it ends on the right side (logic/answers/proof.ts).
  const proof = (q as { proof?: { left: string; right: string } }).proof
  if (proof && q.answerKind === 'list') return markProof(proof, answer, sameExpression)
  // P180: every solution is marked by the angles its families give, however they are written (logic/answers/general.ts).
  if ((q as { general?: unknown }).general && q.answerKind === 'list') return markGeneral(q.answer, answer, readNumber)
  // P150: a list, an order and a table are several values, each read as a number or an expression (logic/answers/lists.ts).
  if (isListKind(q.answerKind)) {
    const { correct, comparable } = markListQuestion(q, answer, readNumber)
    return { correct, comparable }
  }
  // The optional fields of a whole question that P148 reads (prompt, unit) come from the same argument.
  const more = q as QuantityFields
  if (q.answerKind === 'ratio') return markRatio(q.answer, answer, asksSimplest(more.prompt))
  const plain = isMeaningKind(q.answerKind) ? markByMeaning(q.answerKind, q.answer, answer, q.form) : markAnswer(answer, q.answer)
  return plain.correct ? plain : (markQuantity(more, answer, numeric) ?? plain)
}

/** The value of one number or expression (a % or a degree sign dropped), or null: the reader the values of a list, an order and a table are marked with. */
export const readNumber = (text: string): number | null => numeric(text, true)

/**
 * Finishes and marks what a learner typed, on the screen or on paper (the server action that takes an answer and `save_practice_answers` both call
 * this one function, so the two always agree). A question of a new kind is stored as typed and marked by meaning; every other question goes through
 * `completeAnswer` exactly as it always did (a missing number put back into its fraction, then `markAnswer`).
 */
export function finishAnswer(
  q: { prompt: string; answer: string; answerKind: string; form?: Form; choices?: readonly Choice[]; ordered?: boolean; labels?: string[]; round?: number },
  typed: string,
): { stored: string; correct: boolean } {
  // P149: a question that is picked (it has choices, or is true or false, or asks for a reason) is marked by its letter or its pick, whatever kind it says it is.
  const picked = finishPicked(q, typed, (key, value) => markByMeaning('number', key, value).correct)
  if (picked) return picked
  if (isMeaningKind(q.answerKind) || isListKind(q.answerKind)) return { stored: typed.trim(), correct: markQuestion(q, typed).correct }
  const done = completeAnswer(q, typed)
  // P148: a money, decimal or whole answer with a unit or a round is looked at once more as a quantity (the unit and the round come from the same argument); a right one stays right.
  return done.correct || !markQuantity(q as QuantityFields, typed, numeric)?.correct ? done : { stored: done.stored, correct: true }
}

const ARTICLE: Record<MeaningKind, string> = { number: 'a number', expression: 'an expression', equation: 'an equation', point: 'a point', time: 'a time', ratio: 'a ratio' }

/**
 * Why a key cannot be marked by its kind, or null when it can: a `number` has no letter, an `expression` has a letter, an `equation` has at least
 * one value (and one letter at most), a `point` has two numbers. The save gate of a lesson asks this of every key of a new kind.
 */
export function meaningKeyProblem(kind: MeaningKind, key: string): string | null {
  const fine =
    kind === 'number' ? numeric(key, true) !== null
    : kind === 'expression' ? (() => {
        const tree = readExpression(key)
        if (!tree) return false
        // A letter makes it an expression. So does a root with no letter (a surd: 5√2, √5 + 1, 5 + 2√6) when it has a value: it is marked by that value.
        // A plain number, or pi alone, is the number kind's.
        return lettersOf(tree).size > 0 || (hasRoot(tree) && !Number.isNaN(valueOf(tree, {})))
      })()
    : kind === 'equation' ? readEquation(key) !== null || readInequality(key, true) !== null || equationFamilyReadable(key, EQUATION_TOOLS, true)
    : kind === 'time' ? readTime(key) !== null
    : kind === 'ratio' ? readRatio(key) !== null
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
    // An equation of two letters ("y = 2x + 3") is read by the expression reader here, which takes the name in front off: a teacher's key has always been marked so.
    if (kind === 'equation' && readEquation(key) === null && readInequality(key, true) === null && !equationFamilyReadable(key, EQUATION_TOOLS, false)) continue
    if (kind !== 'equation' && meaningKeyProblem(kind, key) !== null) continue
    if (kind === 'expression' && isPlainWord(key)) return false
    return markByMeaning(kind, key, answer).correct
  }
  return false
}
