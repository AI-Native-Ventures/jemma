import type { MathNode, MeaningMark } from '../meaning'

/**
 * P147: the harder answers of the `equation` kind, in one place. meaning.ts keeps the old reader (one letter and its values, an inequality of one letter)
 * and calls this file for the rest:
 *
 *   an interval          (-inf; 3]  [2; inf)  (1; 4)  (-inf; -1) U (4; inf)   the same answer as its inequality (x <= 3, x >= 2, 1 < x < 4, x < -1 or x > 4)
 *   a set of numbers     x in R, R, all real numbers, y >= -4, x in R and x != 2   a domain or a range
 *   a pair               x = 2 and y = 3, x = 2; y = 3, (2; 3)                    each letter once, in any order
 *   a relation           (x - 1)^2 + (y + 2)^2 = 9, x^2 + y^2 = 25, y = 2x + 3   the same relation up to a factor that is not zero
 *
 * and a plus or minus with a root or a fraction (x = 1 +- sqrt(3), x = (5 +- sqrt(17))/4) is two values: `expandPlusMinus` writes the two texts.
 *
 * Every text is read into zero or more "forms" and two texts are the same when one form of each is the same. A text that two kinds can read (a bare
 * "(2; 3)" is an interval and a pair) has both forms. A relation is only ever the last choice: "x = 3" is a value, not a relation.
 *
 * This file imports nothing at run time. meaning.ts passes in what it needs (`EquationTools`), so there is no cycle between the two.
 */

/** The parts of meaning.ts this file reads with. */
export type EquationTools = {
  /** The longest text that is read at all. */
  max: number
  numeric: (text: string, suffix: boolean) => number | null
  readMath: (text: string) => MathNode | null
  valueOf: (n: MathNode, env: Record<string, number>) => number
  lettersOf: (n: MathNode) => Set<string>
  letterValue: (letter: string, point: number) => number
  close: (a: number, b: number) => boolean
  readInequality: (text: string, needed: boolean) => { letter: string; branches: { op: string; v: number }[][] } | null
  readEquation: (text: string) => { letter: string | null; values: number[] } | null
}

// ---- A plus or minus ---------------------------------------------------------------------------------------------------------

const MAX_PLUS_MINUS = 3

/**
 * The texts a text with plus-or-minus signs stands for: "x = 1 ± √3" is "x = 1 + √3" and "x = 1 - √3". The values of all of them are the values of the text.
 * Null when there is no such sign (or more than three: eight values is not an answer).
 */
export function expandPlusMinus(text: string): string[] | null {
  const count = (text.match(/±/g) ?? []).length
  if (count === 0 || count > MAX_PLUS_MINUS) return null
  let out = [text]
  for (let i = 0; i < count; i++) out = out.flatMap((t) => [t.replace('±', '+'), t.replace('±', '-')])
  return out
}

// ---- Spans of the number line ------------------------------------------------------------------------------------------------

type Span = { lo: number; loOpen: boolean; hi: number; hiOpen: boolean }
const FULL: Span = { lo: -Infinity, loOpen: true, hi: Infinity, hiOpen: true }

const isEmpty = (s: Span) => s.lo > s.hi || (s.lo === s.hi && (s.loOpen || s.hiOpen))

/** The numbers an inequality part allows. */
function spansOfConstraint(op: string, v: number): Span[] {
  switch (op) {
    case '<':
      return [{ lo: -Infinity, loOpen: true, hi: v, hiOpen: true }]
    case '<=':
      return [{ lo: -Infinity, loOpen: true, hi: v, hiOpen: false }]
    case '>':
      return [{ lo: v, loOpen: true, hi: Infinity, hiOpen: true }]
    case '>=':
      return [{ lo: v, loOpen: false, hi: Infinity, hiOpen: true }]
    case '!=':
      return [
        { lo: -Infinity, loOpen: true, hi: v, hiOpen: true },
        { lo: v, loOpen: true, hi: Infinity, hiOpen: true },
      ]
    default:
      return [{ lo: v, loOpen: false, hi: v, hiOpen: false }]
  }
}

/** The numbers that are on both lists. */
function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  for (const x of a) {
    for (const y of b) {
      const lo = x.lo > y.lo ? x : y.lo > x.lo ? y : null
      const hi = x.hi < y.hi ? x : y.hi < x.hi ? y : null
      const span: Span = {
        lo: Math.max(x.lo, y.lo),
        loOpen: lo ? lo.loOpen : x.loOpen || y.loOpen,
        hi: Math.min(x.hi, y.hi),
        hiOpen: hi ? hi.hiOpen : x.hiOpen || y.hiOpen,
      }
      if (!isEmpty(span)) out.push(span)
    }
  }
  return out
}

/** A number as large as this stands for infinity: "-\u221e < x < 3" is read by the old reader with a big number in place of the sign. */
const HUGE = 1e12

/** The old reader's inequality: branches are alternatives, and every part of a branch holds at once. */
const spansOfBranches = (branches: { op: string; v: number }[][]): Span[] =>
  branches.flatMap((branch) =>
    branch.reduce<Span[]>((acc, c) => intersect(acc, spansOfConstraint(c.op, Math.abs(c.v) >= HUGE ? Math.sign(c.v) * Infinity : c.v)), [FULL]),
  )

/** The old reader's inequality of a text that may hold an infinity sign (x < \u221e, -\u221e < x <= 3). */
function readInequalityWithInfinity(text: string, t: EquationTools): ReturnType<EquationTools['readInequality']> {
  const plain = t.readInequality(text, false)
  if (plain || !/\u221e|\binf(?:inity)?\b/i.test(text)) return plain
  return t.readInequality(text.replace(/\u221e|\binf(?:inity)?\b/gi, String(HUGE)), false)
}

/** -1 when x is below v, 0 when it is v (to a billionth), 1 when above. An infinite v is never reached. */
const compare = (x: number, v: number, t: EquationTools): number => (v === -Infinity ? 1 : v === Infinity ? -1 : t.close(x, v) ? 0 : x < v ? -1 : 1)

const contains = (spans: Span[], x: number, t: EquationTools): boolean =>
  spans.some((s) => {
    const low = compare(x, s.lo, t)
    const high = compare(x, s.hi, t)
    return (low > 0 || (low === 0 && !s.loOpen)) && (high < 0 || (high === 0 && !s.hiOpen))
  })

/** The same numbers: tried at every end of either list, between each two ends, and beyond the first and the last. */
function sameSpans(a: Span[], b: Span[], t: EquationTools): boolean {
  const ends = [...a, ...b]
    .flatMap((s) => [s.lo, s.hi])
    .filter((v) => Number.isFinite(v))
    .sort((x, y) => x - y)
  const values = ends.filter((v, i) => i === 0 || !t.close(v, ends[i - 1]!))
  const samples = values.length === 0 ? [0] : [...values, values[0]! - 1, values[values.length - 1]! + 1, ...values.slice(1).map((v, i) => (v + values[i]!) / 2)]
  return samples.every((x) => contains(a, x, t) === contains(b, x, t))
}

// ---- Cutting a text at the top level -----------------------------------------------------------------------------------------

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isLetter = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))

/**
 * Cuts `text` where `cutAt` says so, but never inside a bracket: an interval holds a separator of its own. `cutAt(text, i)` gives the length of the separator
 * that starts at i, or 0.
 */
function splitTop(text: string, cutAt: (text: string, i: number) => number): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < text.length; ) {
    const c = text[i]!
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1)
    const cut = depth === 0 ? cutAt(text, i) : 0
    if (cut > 0) {
      out.push(cur)
      cur = ''
      i += cut
    } else {
      cur += c
      i++
    }
  }
  out.push(cur)
  return out
}

/** A word `w` that starts at i and is not a piece of a longer word. */
const wordAt = (text: string, i: number, w: string): boolean =>
  text.slice(i, i + w.length).toLowerCase() === w && !isLetter(text[i - 1]) && !isLetter(text[i + w.length])

/** A comma that is not the comma of a decimal (a comma between two digits). */
const separatorComma = (text: string, i: number) => text[i] === ',' && !(isDigit(text[i - 1]) && isDigit(text[i + 1]))

/** The union of two parts of a set: a union sign, the word union, or, and a capital U on its own. */
const unionAt = (text: string, i: number): number => {
  const c = text[i]!
  if (c === '∪') return 1
  if (c === 'U' && !isLetter(text[i - 1]) && !isLetter(text[i + 1])) return 1
  if (wordAt(text, i, 'union')) return 5
  if (wordAt(text, i, 'or')) return 2
  return 0
}

/** Two conditions that both hold: and, a semicolon, a comma (not a decimal one), the intersection sign. */
const andAt = (text: string, i: number): number => {
  const c = text[i]!
  if (c === ';' || c === '∩' || separatorComma(text, i)) return 1
  if (wordAt(text, i, 'and')) return 3
  return 0
}

// ---- An interval and a set of numbers ----------------------------------------------------------------------------------------

const LETTER = 'a-zA-Z\\u03b8\\u0398\\u03b1\\u03b2\\u03b3\\u03b4\\u03c6\\u03bb\\u03c9'
/** "x ∈ ...", "x in ...": the letter and what comes after the sign. */
const ELEMENT = new RegExp(`^\\s*([${LETTER}])\\s*(?:\\u2208|\\bin\\b|\\bis\\s+in\\b)\\s*(.+)$`, 'i')
const REAL_LINE = /^\s*(?:ℝ|r|all\s+(?:the\s+)?real\s+numbers?|all\s+reals?|(?:the\s+)?real\s+numbers?|any\s+real\s+numbers?|all\s+numbers?)\s*\.?\s*$/i
const POSITIVE_INFINITY = /^\+?\s*(?:∞|inf(?:inity)?)$/i
const NEGATIVE_INFINITY = /^-\s*(?:∞|inf(?:inity)?)$/i

/**
 * The two ends of an interval, cut at its separator: a semicolon, or a comma that is not a decimal comma. "(1,4)" has one comma between digits and nothing else:
 * that comma is the separator (a bracket with a decimal alone in it is not an interval).
 */
function ends(inner: string): [string, string] | null {
  if (inner.includes(';')) {
    const parts = inner.split(';')
    return parts.length === 2 ? [parts[0]!, parts[1]!] : null
  }
  const commas = [...inner].flatMap((c, i) => (c === ',' ? [i] : []))
  const separators = commas.filter((i) => separatorComma(inner, i))
  const at = separators.length === 1 ? separators[0]! : separators.length === 0 && commas.length === 1 ? commas[0]! : -1
  return at < 0 ? null : [inner.slice(0, at), inner.slice(at + 1)]
}

/** One end: a number (4, 1/2, √2, -3) or an infinity. */
function bound(text: string, t: EquationTools): number | null {
  const s = text.trim()
  if (POSITIVE_INFINITY.test(s)) return Infinity
  if (NEGATIVE_INFINITY.test(s)) return -Infinity
  return t.numeric(s, false)
}

/** "(1; 4)", "[2; ∞)", "(-∞; 3]": one interval. An end that is an infinity is open. Null when it does not read or its ends are the wrong way round. */
function readInterval(part: string, t: EquationTools): Span | null {
  const m = /^([([])([^()[\]]*)([)\]])$/.exec(part.trim())
  if (!m) return null
  const two = ends(m[2]!)
  if (!two) return null
  const lo = bound(two[0], t)
  const hi = bound(two[1], t)
  if (lo === null || hi === null || lo === Infinity || hi === -Infinity) return null
  const span: Span = { lo, loOpen: m[1] === '(' || lo === -Infinity, hi, hiOpen: m[3] === ')' || hi === Infinity }
  const apart = lo === -Infinity || hi === Infinity ? lo < hi : !t.close(lo, hi) && lo < hi
  return apart ? span : null
}

type SetReading = { letter: string | null; spans: Span[] }

/** One part of a set: "x ∈ ...", the real line, or intervals joined with a union. */
function readSetNotation(text: string, t: EquationTools): SetReading | null {
  let s = text.trim()
  let letter: string | null = null
  const m = ELEMENT.exec(s)
  if (m) {
    letter = m[1]!.toLowerCase()
    s = m[2]!.trim()
  }
  if (REAL_LINE.test(s)) return { letter, spans: [FULL] }
  const spans: Span[] = []
  for (const part of splitTop(s, unionAt)) {
    const span = readInterval(part, t)
    if (!span) return null
    spans.push(span)
  }
  return { letter, spans }
}

const SET_SIGNS = /∈|ℝ|\breal\b|\bin\b/i

/** "x ∈ ℝ, x ≠ 2", "x ∈ ℝ and x > 0": conditions that all hold, some of them in set notation. */
function readConjunction(text: string, t: EquationTools): SetReading | null {
  let letter: string | null = null
  let spans: Span[] = [FULL]
  for (const part of splitTop(text, andAt)) {
    const set = readSetNotation(part, t)
    const inequality = set ? null : readInequalityWithInfinity(part, t)
    const here = set ?? (inequality ? { letter: inequality.letter, spans: spansOfBranches(inequality.branches) } : null)
    if (!here) return null
    if (here.letter !== null) {
      if (letter !== null && letter !== here.letter) return null
      letter = here.letter
    }
    spans = intersect(spans, here.spans)
  }
  return { letter, spans }
}

/** A set written as set notation (an interval, a union, ∈, the real numbers), or null. */
function readSetOnly(text: string, t: EquationTools): SetReading | null {
  if (SET_SIGNS.test(text)) {
    const together = readConjunction(text, t)
    if (together) return together
  }
  return readSetNotation(text, t)
}

/** An inequality, an interval or a set of numbers: what an answer "like x < 4 or -2 ≤ x < 3" is. */
function readSet(text: string, t: EquationTools): SetReading | null {
  const notation = readSetOnly(text, t)
  if (notation) return notation
  const inequality = readInequalityWithInfinity(text, t)
  return inequality ? { letter: inequality.letter, spans: spansOfBranches(inequality.branches) } : null
}

// ---- A pair --------------------------------------------------------------------------------------------------------------------

type PairReading = { letters: [string, string] | null; values: [number, number] }

/**
 * "x = 2 and y = 3", "x = 2; y = 3", "x = 2, y = 3", "(2; 3)". Two different letters, each once; the letters are kept in alphabetical order with their values.
 * "or" between the two is not a pair.
 */
function readPair(text: string, t: EquationTools): PairReading | null {
  const s = text.trim()
  const bracket = /^\(([^()[\]]*)\)$/.exec(s)
  if (bracket) {
    const two = ends(bracket[1]!)
    if (!two) return null
    const [a, b] = [t.numeric(two[0], false), t.numeric(two[1], false)]
    return a === null || b === null ? null : { letters: null, values: [a, b] }
  }
  if (!/=/.test(s) || /\bor\b/i.test(s)) return null
  const pieces = splitTop(s, andAt)
  if (pieces.length !== 2) return null
  const named = pieces.map((piece) => {
    const sides = piece.split('=')
    if (sides.length !== 2) return null
    const name = new RegExp(`^\\s*([${LETTER}])\\s*$`).exec(sides[0]!)
    const v = name ? t.numeric(sides[1]!, false) : null
    return name && v !== null ? { letter: name[1]!.toLowerCase(), v } : null
  })
  const [first, second] = named
  if (!first || !second || first.letter === second.letter) return null
  return first.letter < second.letter
    ? { letters: [first.letter, second.letter], values: [first.v, second.v] }
    : { letters: [second.letter, first.letter], values: [second.v, first.v] }
}

// ---- A relation ----------------------------------------------------------------------------------------------------------------

type RelationReading = { left: MathNode; right: MathNode; letters: string[] }

/**
 * An equation of two letters or more, one equals sign and nothing else (no inequality, no "or"): a circle, a line, a plane. A single letter is a value, not a
 * relation, so "x + 1 = 3" and "x^2 = 9" are not read here.
 */
function readRelation(text: string, t: EquationTools): RelationReading | null {
  const s = text.trim()
  if (/[<>≤≥≠;]|!=/.test(s)) return null
  const sides = s.split('=')
  if (sides.length !== 2 || !sides[0]!.trim() || !sides[1]!.trim()) return null
  const left = t.readMath(sides[0]!)
  const right = t.readMath(sides[1]!)
  if (!left || !right) return null
  const letters = [...new Set([...t.lettersOf(left), ...t.lettersOf(right)])]
  return letters.length >= 2 ? { left, right, letters } : null
}

/** How many points must agree for two relations to be the same. */
const ENOUGH_POINTS = 5
const POINTS = 21

/**
 * The same relation: what is left when one side is taken from the other is the same at every point up to one factor that is not zero (x^2 + y^2 = 25 and
 * 2x^2 + 2y^2 = 50 and 25 = x^2 + y^2 are the same circle). A point where either is not defined is skipped.
 */
function sameRelation(a: RelationReading, b: RelationReading, t: EquationTools): boolean {
  const letters = [...new Set([...a.letters, ...b.letters])]
  let factor: number | null = null
  let agree = 0
  for (let point = 0; point < POINTS; point++) {
    const env: Record<string, number> = {}
    for (const letter of letters) env[letter] = t.letterValue(letter, point)
    const x = t.valueOf(a.left, env) - t.valueOf(a.right, env)
    const y = t.valueOf(b.left, env) - t.valueOf(b.right, env)
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    const [sx, sy] = [Math.abs(x) < 1e-9, Math.abs(y) < 1e-9]
    if (sx && sy) continue
    if (sx || sy) return false
    const ratio = y / x
    if (factor === null) factor = ratio
    else if (!t.close(ratio, factor)) return false
    agree++
  }
  return agree >= ENOUGH_POINTS
}

// ---- The forms of a text -------------------------------------------------------------------------------------------------------

type Form =
  | ({ kind: 'set' } & SetReading)
  | ({ kind: 'pair' } & PairReading)
  | ({ kind: 'relation' } & RelationReading)

const MINUS_SIGNS = /[−‐-–]/g
const clean = (text: string, t: EquationTools): string | null => {
  const s = text.replace(MINUS_SIGNS, '-').trim()
  return s && s.length <= t.max ? s : null
}

/** A value or values of one letter (or none), as the points of the number line. */
const pointsOf = (values: number[]): Span[] => values.map((v) => ({ lo: v, loOpen: false, hi: v, hiOpen: false }))

/** Every way a text reads. A relation is read only when nothing else reads it. */
function formsOf(text: string, t: EquationTools): Form[] {
  const s = clean(text, t)
  if (!s) return []
  const forms: Form[] = []
  const set = readSet(s, t)
  if (set) forms.push({ kind: 'set', ...set })
  else {
    const eq = t.readEquation(s)
    if (eq) forms.push({ kind: 'set', letter: eq.letter, spans: pointsOf(eq.values) })
  }
  const pair = readPair(s, t)
  if (pair) forms.push({ kind: 'pair', ...pair })
  if (forms.length === 0) {
    const relation = readRelation(s, t)
    if (relation) forms.push({ kind: 'relation', ...relation })
  }
  return forms
}

/** Two pairs are the same when each letter has the same value; a pair with no letters is x then y, in the alphabetical order of the letters of the other. */
function samePair(a: PairReading, b: PairReading, t: EquationTools): boolean {
  if (a.letters && b.letters && (a.letters[0] !== b.letters[0] || a.letters[1] !== b.letters[1])) return false
  return t.close(a.values[0], b.values[0]) && t.close(a.values[1], b.values[1])
}

function sameForm(a: Form, b: Form, t: EquationTools): boolean {
  if (a.kind === 'set' && b.kind === 'set') {
    if (a.letter !== null && b.letter !== null && a.letter !== b.letter) return false
    return sameSpans(a.spans, b.spans, t)
  }
  if (a.kind === 'pair' && b.kind === 'pair') return samePair(a, b, t)
  if (a.kind === 'relation' && b.kind === 'relation') return sameRelation(a, b, t)
  return false
}

// ---- What meaning.ts asks ------------------------------------------------------------------------------------------------------

/** A sign or a bracket that the old reader of an equation does not know: an infinity, an element sign, a union, a real line, a square bracket. */
const NEW_SIGNS = /∞|∈|ℝ|∪|[[\]]|\binf(?:inity)?\b|\breal\b|\bunion\b|\bin\b|^\s*r\s*$/i
const BRACKETED = /[([][^()[\]]*[;,][^()[\]]*[)\]]/

/** True when this text is one of the new forms, so that the old reader should not be the one to read it. */
function isNewForm(text: string, t: EquationTools): boolean {
  const s = clean(text, t)
  if (!s) return false
  if (NEW_SIGNS.test(s) || BRACKETED.test(s)) return true
  if (readPair(s, t)) return true
  return readRelation(s, t) !== null && t.readEquation(s) === null
}

/**
 * The mark of an equation answer when the key or the answer is one of the new forms, or null when both are old ones (meaning.ts marks those, as it always did).
 * A text that does not read is not comparable.
 */
export function markEquationFamily(key: string, answer: string, t: EquationTools): MeaningMark | null {
  if (!isNewForm(key, t) && !isNewForm(answer, t)) return null
  const k = formsOf(key, t)
  const a = formsOf(answer, t)
  if (k.length === 0 || a.length === 0) return { correct: false, comparable: false }
  return { correct: k.some((kf) => a.some((af) => sameForm(kf, af, t))), comparable: true }
}

/**
 * True when a key is readable by one of the new forms. `relations` says whether an equation of two letters counts (the save gate says yes; the class test
 * path says no, because it has the expression reader for "y = 2x + 3").
 */
export function equationFamilyReadable(key: string, t: EquationTools, relations: boolean): boolean {
  const forms = formsOf(key, t)
  return relations ? forms.length > 0 : forms.some((f) => f.kind !== 'relation')
}

/** True when a key is an inequality written as a set: an interval, a union, ∈, the real numbers. (An inequality of one letter is read by meaning.ts.) */
export function isSetKey(key: string, t: EquationTools): boolean {
  const s = clean(key, t)
  return s !== null && readSetOnly(s, t) !== null
}

/** True when a key is two letters with a value each (x = 2 and y = 3): a pair that is written with its letters. */
export function isLetteredPairKey(key: string, t: EquationTools): boolean {
  const s = clean(key, t)
  const pair = s === null ? null : readPair(s, t)
  return pair !== null && pair.letters !== null
}
