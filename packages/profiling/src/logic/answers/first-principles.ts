import type { FirstPrinciplesSpec } from '../../schemas/lesson'

/**
 * P185: a derivative found from first principles, line by line, from the "Write steps line by line" board ("Determine f′(x) from first principles if
 * f(x) = 2x² − 3x."). Jemma gives the first line, f′(x) = lim h→0 (f(x + h) − f(x))/h, and the learner writes the lines after it, the maths only. A line with
 * h in it is still under the limit (Jemma writes "lim h→0" in front of it); the first line with no h in it is the limit taken, and the lines after it are in
 * x only. Each line is checked at the end:
 *
 *   the first line      is (f(x + h) − f(x))/h with f put in: the same value wherever h is not 0, and still no value at h = 0 (h is not cancelled yet)
 *   a line with h       has the same value as the line before it wherever h is not 0
 *   the limit taken     the first line with no h is the line before it at h = 0, so that line must have a value there (h is cancelled first);
 *                       or it is the same as that line for every h that is not 0 (lim 3h/h = 3)
 *   a line after it     has no h, and the same value as the line before it
 *   the last line       has no h, and is written as simply as the key's last line (no more pieces, signs aside): f′(x) as simply as it goes
 *
 * At least 3 lines, at most 7, each written differently from the one before it. Any way through is right. The answer is the lines with a semicolon between
 * them, as a `list`. The reading of a line is passed in (`read`: meaning.ts `workedLineOf`), so this file has no cycle with it. Pure.
 */

export const FIRST_PRINCIPLES_MIN_LINES = 3
export const FIRST_PRINCIPLES_MAX_LINES = 7

/** A line of maths read as a function of its letters, or null when it cannot be read. A point where it has no value gives not a number. */
export type LineReader = (text: string) => { letters: string[]; at: (env: Record<string, number>) => number } | null

/** Why a line does not follow: the first line is not (f(x + h) − f(x))/h, a line is not equal to the one before, the limit is taken before h can be 0, h comes back after the limit, or a letter that is not x or h. */
export type FirstPrinciplesWhy = 'start' | 'equal' | 'soon' | 'back' | 'letter'

/** The letter of the function: f, unless the question names another. */
export const functionName = (spec: Pick<FirstPrinciplesSpec, 'name'>): string => {
  const name = spec.name?.trim() ?? ''
  return /^[a-z]$/.test(name) ? name : 'f'
}

/** The first line, the one Jemma gives, in words: f′(x) = lim h→0 (f(x + h) − f(x))/h. */
export const definitionText = (name: string): string => `${name}′(x) = lim h→0 (${name}(x + h) − ${name}(x))/h`

/**
 * The points the lines are compared at: an x and an h, h never 0, of both signs and different sizes. x and x + h are never 0, a whole number or a half, so a
 * function like 2/x or 1/(2x − 1) has a value at each of them.
 */
const POINTS: readonly (readonly [x: number, h: number])[] = [
  [1.37, 0.29],
  [2.11, -0.31],
  [-1.61, 0.17],
  [2.89, 0.41],
  [0.73, -0.19],
  [-2.37, 0.31],
  [3.13, -0.17],
  [1.83, 0.11],
  [-0.89, -0.19],
  [2.63, 0.23],
]
/** How many points must agree (and none disagree) for two lines to be the same. */
const ENOUGH = 5

/** Two values are the same when they differ by less than a hundred millionth of their size (and of 1): a line that cancels terms loses a little on the way. */
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))

type Line = (x: number, h: number) => number

/** Whether two lines have the same value at the points (h as at each point, or 0 for all of them): the same, different, or too few points where both have one. */
function compare(a: Line, b: Line, atZero = false): 'same' | 'different' | 'unknown' {
  let agree = 0
  for (const [x, h] of POINTS) {
    const p = a(x, atZero ? 0 : h)
    const q = b(x, atZero ? 0 : h)
    if (!Number.isFinite(p) || !Number.isFinite(q)) continue
    if (!near(p, q)) return 'different'
    agree++
  }
  return agree >= ENOUGH ? 'same' : 'unknown'
}

/** True when a line has a value at h = 0 at most of the points: 4x + 2h − 3 has, (4xh + 2h²)/h has none (h is not cancelled yet). */
const valueAtZero = (line: Line): boolean => POINTS.filter(([x]) => Number.isFinite(line(x, 0))).length >= ENOUGH

/**
 * How many pieces a line is written with, its plus and minus signs aside: its numbers, its letters (each with its power), times, over, powers and roots;
 * brackets are no piece. 4x − 3 and −3 + 4x are 3 pieces, 4x + 2(0) − 3 is 5.
 */
const piecesOf = (text: string): number =>
  (
    text
      .toLowerCase()
      .replace(/[\u00d7\u00b7]/g, '*')
      .replace(/\u00b2/g, '^2')
      .replace(/\u00b3/g, '^3')
      .replace(/[\s()[\]{}]/g, '')
      .match(/[a-z\u03b8]+(?:\^\d+)?|\d+(?:[.,]\d+)?|[*/^\u221a]/g) ?? []
  ).length

/** True when a line has h in it: read, or (a line that cannot be read) when the letter h is in its text. */
export const holdsH = (text: string, read: LineReader): boolean => {
  const line = read(text)
  return line ? line.letters.includes('h') : /h/i.test(text)
}

/**
 * The lines of a derivative from first principles: a line ends at a semicolon, a new row or an equals sign (on paper a row may hold two steps), the name in
 * front ("f′(x)", "dy/dx") is no line, "lim h→0" in front of a line is taken off (lim_(h→0), or lim on its own), and no line is empty. On paper the learner
 * may find f(x + h) and f(x + h) − f(x) on their own first: when a line has lim in front of it, the lines are taken from the first one that has. A first line
 * that is the definition itself (it holds f(x + h)) is the line Jemma gives, not one of theirs.
 */
export function firstPrinciplesLines(text: string, name = 'f'): string[] {
  const letter = /^[a-z]$/.test(name) ? name : 'f'
  const label = new RegExp(`^(?:${letter}\\s*['′’]*\\s*\\(\\s*x\\s*\\)|y\\s*['′’]*|dy\\s*/\\s*dx)$`, 'i')
  const lim = /^lim\s*(?:_?\s*[({]?\s*h\s*(?:→|->|\\to|\\rightarrow)\s*0\s*[)}]?)?\s*/i
  const definition = new RegExp(`${letter}\\s*\\(\\s*x\\s*\\+\\s*h\\s*\\)`, 'i')
  let pieces = text
    .split(/[;\r\n=]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0 && !label.test(piece))
  const first = pieces.findIndex((piece) => lim.test(piece))
  if (first > 0) pieces = pieces.slice(first)
  const lines = pieces.map((piece) => piece.replace(lim, '').trim()).filter((line) => line.length > 0)
  while (lines.length > 0 && definition.test(lines[0]!)) lines.shift()
  return lines
}

/** How a derivative from first principles stands, line by line. */
export type FirstPrinciplesCheck = {
  /** The lines as written, with the words around them taken off. */
  lines: string[]
  /** For each line, true when h is in it: it is still under the limit, with "lim h→0" in front of it. */
  under: boolean[]
  /** The first line that does not follow (from 0), and why; null when every line read follows. */
  wrong: number | null
  why: FirstPrinciplesWhy | null
  /** The first line that cannot be read, or null. */
  unread: number | null
  /** The line where the limit is taken (the first with no h in it), or null. */
  limit: number | null
  /** Every line follows and the last one is f′(x) with no h in it, written as simply as the key's last line. */
  reached: boolean
  /** 3 to 7 lines, each written differently from the one before it. */
  enough: boolean
  ok: boolean
}

/**
 * Checks a derivative from first principles line by line (see the top of this file). `derivative` is the key's last line: the last line is written with no
 * more pieces than it; null checks only that the last line has no h in it (the key itself is checked so).
 */
export function checkFirstPrinciples(spec: FirstPrinciplesSpec, text: string, read: LineReader, derivative: string | null): FirstPrinciplesCheck {
  const lines = firstPrinciplesLines(text, functionName(spec))
  const under = lines.map((line) => holdsH(line, read))
  const f = read(spec.f)
  const fx = (x: number) => (f ? f.at({ x }) : NaN)
  const quotient: Line = (x, h) => (fx(x + h) - fx(x)) / h
  let wrong: number | null = null
  let why: FirstPrinciplesWhy | null = null
  let unread: number | null = null
  let limit: number | null = null
  let before: Line = quotient
  for (let i = 0; i < lines.length; i++) {
    const parsed = read(lines[i]!)
    if (!parsed) {
      unread = i
      break
    }
    const line: Line = (x, h) => parsed.at({ x, h })
    const h = parsed.letters.includes('h')
    let fault: FirstPrinciplesWhy | null = null
    if (parsed.letters.some((l) => l !== 'x' && l !== 'h')) fault = 'letter'
    else if (i === 0) fault = compare(quotient, line) === 'same' && !valueAtZero(line) ? null : 'start'
    else if (limit === null && h) fault = compare(before, line) === 'same' ? null : 'equal'
    else if (limit === null) {
      // The limit is taken: the line is the one before it at h = 0, which must have a value there, or the same as it for every h that is not 0.
      const taken = compare(before, line) === 'same' || (valueAtZero(before) && compare(before, line, true) === 'same')
      fault = taken ? null : valueAtZero(before) ? 'equal' : 'soon'
    } else fault = h ? 'back' : compare(before, line) === 'same' ? null : 'equal'
    if (fault) {
      wrong = i
      why = fault
      break
    }
    if (!h && limit === null) limit = i
    before = line
  }
  const flat = (t: string) => t.replace(/\s+/g, '').toLowerCase()
  const different = lines.every((line, i) => i === 0 || flat(line) !== flat(lines[i - 1]!))
  const enough = lines.length >= FIRST_PRINCIPLES_MIN_LINES && lines.length <= FIRST_PRINCIPLES_MAX_LINES && different
  const last = lines.length - 1
  const followed = wrong === null && unread === null && last >= 0
  const reached = followed && limit !== null && !under[last] && (derivative === null || piecesOf(lines[last]!) <= piecesOf(derivative))
  return { lines, under, wrong, why, unread, limit, reached, enough, ok: followed && reached && enough }
}

/** f′(x) as the key writes it: its last line, or null when it has none. */
export const derivativeOf = (spec: FirstPrinciplesSpec, key: string): string | null => {
  const lines = firstPrinciplesLines(key, functionName(spec))
  return lines.length > 0 ? lines[lines.length - 1]! : null
}

/** Marks a derivative from first principles: right when every line follows and it ends on f′(x), as simply as the key's last line. `comparable` is false when a line cannot be read or there are none. */
export function markFirstPrinciples(spec: FirstPrinciplesSpec, key: string, answer: string, read: LineReader): { correct: boolean; comparable: boolean } {
  const c = checkFirstPrinciples(spec, answer, read, derivativeOf(spec, key))
  return { correct: c.ok, comparable: c.lines.length > 0 && c.unread === null }
}

/** Why a function to differentiate from first principles cannot be used, or null: maths in x that can be read, with a value at most numbers, and a name of one letter. */
export function firstPrinciplesProblem(spec: FirstPrinciplesSpec, read: LineReader): string | null {
  const name = spec.name?.trim()
  if (name !== undefined && (!/^[a-z]$/.test(name) || 'xhe'.includes(name))) return 'the name of the function is one small letter other than x, h and e, like f or g'
  const f = read(spec.f)
  if (!f) return 'f is maths in x that Jemma can read, like 2x^2 - 3x'
  if (!f.letters.includes('x') || f.letters.some((l) => l !== 'x')) return 'f is a function of x: x is its one letter'
  const defined = POINTS.filter(([x, h]) => Number.isFinite(f.at({ x })) && Number.isFinite(f.at({ x: x + h }))).length
  if (defined < ENOUGH) return 'f has a value at most numbers, like 2x^2 - 3x or 2/x'
  return null
}

/** True when a line is the slope of f at most of the points (f′ worked out from f a little either side of each x). */
function isSlopeOf(f: NonNullable<ReturnType<LineReader>>, last: NonNullable<ReturnType<LineReader>>): boolean {
  const step = 1e-5
  let agree = 0
  for (const [x] of POINTS) {
    const slope = (f.at({ x: x + step }) - f.at({ x: x - step })) / (2 * step)
    const value = last.at({ x })
    if (!Number.isFinite(slope) || !Number.isFinite(value)) continue
    if (Math.abs(slope - value) > 1e-5 * Math.max(1, Math.abs(value))) return false
    agree++
  }
  return agree >= ENOUGH
}

/**
 * Why the key of a derivative from first principles is not one, or null: 3 to 7 lines in x and h that can be read, each following from the one before (the
 * first as (f(x + h) − f(x))/h with f put in), the limit taken once h can be 0, the last line f′(x) with no h in it, each written differently from the one before.
 */
export function firstPrinciplesKeyProblem(q: { answer: string; answerKind: string; firstPrinciples: FirstPrinciplesSpec }, read: LineReader): string | null {
  if (q.answerKind !== 'list') return 'a derivative from first principles has a list answer: its lines after the definition, with a semicolon between them'
  const spec = q.firstPrinciples
  const c = checkFirstPrinciples(spec, q.answer, read, null)
  const min = FIRST_PRINCIPLES_MIN_LINES
  const max = FIRST_PRINCIPLES_MAX_LINES
  if (c.lines.length < min || c.lines.length > max) return `the answer has ${min} to ${max} lines`
  if (c.unread !== null) return `line ${c.unread + 1} of the answer cannot be read: write it as plain maths in x and h, like (2(x + h)^2 - 2x^2)/h`
  if (c.wrong !== null) {
    const n = c.wrong + 1
    if (c.why === 'letter') return `line ${n} of the answer has a letter that is not x or h`
    if (c.why === 'start') return 'the first line of the answer is (f(x + h) - f(x))/h with f put in, before h is cancelled'
    if (c.why === 'soon') return `line ${n} of the answer takes the limit too soon: line ${n - 1} has no value at h = 0, so cancel h first`
    if (c.why === 'back') return `line ${n} of the answer has h in it after the limit was taken`
    return `line ${n} of the answer is not equal to line ${n - 1}`
  }
  if (!c.reached) return 'the last line of the answer is the derivative, with no h in it'
  if (!c.enough) return 'each line of the answer is written differently from the line before it'
  // Each line follows, so the last one is the derivative; it is checked against the slope of f once more.
  const f = read(spec.f)
  const last = read(c.lines[c.lines.length - 1]!)
  if (!f || !last || !isSlopeOf(f, last)) return 'the last line of the answer is not the derivative of f'
  return null
}

/** A derivative from first principles as it is saved: its list is ordered. */
export function tidyFirstPrinciples<Q extends { answerKind: string; firstPrinciples?: FirstPrinciplesSpec; ordered?: boolean }>(q: Q): Q {
  if (!q.firstPrinciples || q.answerKind !== 'list') return q
  return { ...q, ordered: true }
}

/** The answer the lines make (`a; b; c`), or '' while fewer than 3 lines hold something. */
export function firstPrinciplesAnswer(lines: string[]): string {
  const written = lines.map((l) => l.trim()).filter(Boolean)
  return written.length >= FIRST_PRINCIPLES_MIN_LINES ? written.join('; ') : ''
}
