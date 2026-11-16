// P141: the label of a mark on a number line that is an inequality in one letter ("x < 4", "x ≥ −3", "−2 < x ≤ 3") is drawn as the textbook picture: a circle
// (open for < and >, filled for ≤ and ≥) and a thick ray with an arrow head, or a thick segment between two circles. Pure functions: no screen here.

export type Inequality =
  /** `dir` is the way the ray runs from its circle: "left" is towards the smallest number of the line, "right" towards the largest. */
  | { kind: 'ray'; dir: 'left' | 'right'; closed: boolean }
  | { kind: 'segment'; lo: number; hi: number; loClosed: boolean; hiClosed: boolean }

const NUMBER = String.raw`-?\d+(?:[.,]\d+)?(?:/\d+)?`
const RELATION = String.raw`<=|>=|<|>|≤|≥`
const LETTER = String.raw`\p{L}`
const ONE_SIDE = new RegExp(`^(${LETTER})(${RELATION})(${NUMBER})$|^(${NUMBER})(${RELATION})(${LETTER})$`, 'u')
const TWO_SIDES = new RegExp(`^(${NUMBER})(${RELATION})(${LETTER})(${RELATION})(${NUMBER})$`, 'u')

/** A number as it was typed: a decimal comma is a point, a fraction is divided. NaN when it is not one. */
function valueOf(text: string): number {
  const [top, bottom] = text.replace(',', '.').split('/')
  const n = Number(top)
  return bottom === undefined ? n : n / Number(bottom)
}

/** Does the relation say "less than"? (A relation of the other kind says "more than".) */
const isLess = (rel: string): boolean => rel === '<' || rel === '<=' || rel === '≤'
const isClosed = (rel: string): boolean => rel === '<=' || rel === '>=' || rel === '≤' || rel === '≥'

/**
 * What the label says, when it is an inequality in one letter: "x < 4", "x >= -3", "4 > x" (one bound: a ray) or "-2 < x <= 3" (two bounds: a segment). The
 * minus can be the true minus sign or a hyphen, a comparison can be typed with two signs (<=) or one (≤), spaces do not matter, the letter can be any letter.
 * Anything else ("x = 4", "2x + 3", "x < y", "3 < 4", "x < 4 cm") is null: the mark is drawn as it always was.
 */
export function readInequality(label: string): Inequality | null {
  const t = label.replace(/[\s ]+/g, '').replace(/[−–]/g, '-')
  const one = ONE_SIDE.exec(t)
  if (one) {
    // x < 4: the letter is on the left, the ray runs to the smaller numbers. 4 > x says the same: the sign is read from the letter's side.
    const letterFirst = one[1] !== undefined
    const rel = letterFirst ? one[2]! : one[5]!
    const bound = valueOf(letterFirst ? one[3]! : one[4]!)
    if (!Number.isFinite(bound)) return null
    const less = letterFirst ? isLess(rel) : !isLess(rel)
    return { kind: 'ray', dir: less ? 'left' : 'right', closed: isClosed(rel) }
  }
  const two = TWO_SIDES.exec(t)
  if (!two) return null
  const [, first, r1, , r2, last] = two
  const a = valueOf(first!)
  const b = valueOf(last!)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  // Both signs must point the same way: a < x < b or a > x > b. Anything else (a < x > b) says nothing a picture can show.
  if (isLess(r1!) !== isLess(r2!)) return null
  const lo = isLess(r1!) ? a : b
  const hi = isLess(r1!) ? b : a
  if (!(lo < hi)) return null
  return isLess(r1!)
    ? { kind: 'segment', lo, hi, loClosed: isClosed(r1!), hiClosed: isClosed(r2!) }
    : { kind: 'segment', lo, hi, loClosed: isClosed(r2!), hiClosed: isClosed(r1!) }
}

// ---- P145: the inequality is in the caption of the step, the mark is a number ----------------------------------------------------------------

/** A number as it is written in a senior line: a true minus or a hyphen, a decimal comma or a point. */
const CAPTION_NUMBER = String.raw`[-\u2212]?\d+(?:[.,]\d+)?`
/** Nothing that makes the number the start of a longer thing: a letter, a digit, a bracket, a power, a fraction bar. */
const NUMBER_ENDS = String.raw`(?![\p{L}\d(^/])`
/** After a boundary: no sign that carries on the sum ("x > 3 + y"). */
const NOT_A_SUM = String.raw`(?!\s*[+\u00d7\u00f7*/^]|\s+[-\u2212]\s)`
/** A letter that stands alone: not after a digit or a letter (2x), not after a sign that is part of a sum (2 - x, x + 1 is checked after the letter). */
const ALONE_BEFORE = String.raw`(?<![\p{L}\d.])(?<![+\u00d7\u00f7*/^(\-\u2212]\s*)`

const SIGN = '[<>\u2264\u2265]|<=|>='
const LETTER_FIRST = new RegExp(`${ALONE_BEFORE}(\\p{L})(?![\\p{L}\\d])\\s*(<=|>=|[<>\u2264\u2265])\\s*(${CAPTION_NUMBER})${NUMBER_ENDS}${NOT_A_SUM}`, 'giu')
const NUMBER_FIRST = new RegExp(`(?<![\\p{L}\\d.^/])(${CAPTION_NUMBER})\\s*(<=|>=|[<>\u2264\u2265])\\s*(\\p{L})(?![\\p{L}\\d(^])(?!\\s*[+\u00d7\u00f7*/^(]|\\s+[-\u2212]\\s)`, 'giu')
const BOTH_SIDES = new RegExp(`(?<![\\p{L}\\d.^/])(${CAPTION_NUMBER})\\s*(<=|>=|[<>\u2264\u2265])\\s*(\\p{L})\\s*(<=|>=|[<>\u2264\u2265])\\s*(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu')
const ANY_SIGN = new RegExp(SIGN, 'u')

/** The words that say a side of a number: [pattern, direction, closed]. The number comes straight after the words (or before "or more"). */
const WORDS: [RegExp, 'left' | 'right', boolean][] = [
  [new RegExp(`(?:greater|more|bigger|larger) than or equal to\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'right', true],
  [new RegExp(`(?:less|smaller|fewer) than or equal to\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'left', true],
  [new RegExp(`\\bat least\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'right', true],
  [new RegExp(`\\bat most\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'left', true],
  [new RegExp(`(?:\\bto the )?\\bright of\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'right', false],
  [new RegExp(`(?:\\bto the )?\\bleft of\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'left', false],
  [new RegExp(`\\b(?:greater|more|bigger|larger) than\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'right', false],
  [new RegExp(`\\b(?:less|smaller|fewer) than\\s+(${CAPTION_NUMBER})${NUMBER_ENDS}`, 'giu'), 'left', false],
  [new RegExp(`(?<![\\p{L}\\d.])(${CAPTION_NUMBER})\\s+or\\s+(?:more|greater|bigger|higher)\\b`, 'giu'), 'right', true],
  [new RegExp(`(?<![\\p{L}\\d.])(${CAPTION_NUMBER})\\s+or\\s+(?:less|smaller|fewer|lower)\\b`, 'giu'), 'left', true],
]

export type CaptionRay = { value: number; dir: 'left' | 'right'; closed: boolean }
export type CaptionSegment = { lo: number; hi: number; loClosed: boolean; hiClosed: boolean }
export type CaptionReading = {
  /** Each side of a number that the caption names, in the order of the text. */
  rays: CaptionRay[]
  /** Each "a < x < b" of the caption. */
  segments: CaptionSegment[]
  /** Does the caption have an inequality sign (< > ≤ ≥) at all, whether or not it says a side of a number of the line? */
  symbol: boolean
}

const numberOf = (text: string): number => valueOf(text.replace(/\u2212/g, '-'))

/**
 * What a caption says about the sides of the numbers on a number line: "running to the right of 3", "bigger than 3", "at least 3", "3 or more", and an
 * inequality in one letter whose boundary is a number ("x > 3", "x ≤ -3", "3 < x"), or two ("-2 < x ≤ 3"). A letter with a number in front of it ("2x > 6"),
 * or after a sign of a sum ("2 - x > 3"), or a bound that goes on in a sum ("x > 3 + y") is not a boundary. Pure: it knows nothing of the marks.
 */
export function readCaption(caption: string): CaptionReading {
  const found: { at: number; ray?: CaptionRay; segment?: CaptionSegment }[] = []
  const taken: [number, number][] = []
  const free = (start: number, end: number) => !taken.some(([a, b]) => start < b && end > a)
  for (const m of caption.matchAll(BOTH_SIDES)) {
    const read = readInequality(m[0])
    if (read?.kind !== 'segment') continue
    taken.push([m.index!, m.index! + m[0].length])
    found.push({ at: m.index!, segment: { lo: read.lo, hi: read.hi, loClosed: read.loClosed, hiClosed: read.hiClosed } })
  }
  for (const m of caption.matchAll(LETTER_FIRST)) {
    const end = m.index! + m[0].length
    if (!free(m.index!, end)) continue
    const bound = numberOf(m[3]!)
    if (!Number.isFinite(bound)) continue
    const less = isLess(m[2]!)
    found.push({ at: m.index!, ray: { value: bound, dir: less ? 'left' : 'right', closed: isClosed(m[2]!) } })
  }
  for (const m of caption.matchAll(NUMBER_FIRST)) {
    const end = m.index! + m[0].length
    if (!free(m.index!, end)) continue
    const bound = numberOf(m[1]!)
    if (!Number.isFinite(bound)) continue
    // 3 < x says the same as x > 3: the sign is read from the letter's side.
    const less = !isLess(m[2]!)
    found.push({ at: m.index!, ray: { value: bound, dir: less ? 'left' : 'right', closed: isClosed(m[2]!) } })
  }
  for (const [pattern, dir, closed] of WORDS) {
    for (const m of caption.matchAll(pattern)) {
      const bound = numberOf(m[1]!)
      if (Number.isFinite(bound)) found.push({ at: m.index!, ray: { value: bound, dir, closed } })
    }
  }
  found.sort((a, b) => a.at - b.at)
  return {
    rays: found.flatMap((f) => (f.ray ? [f.ray] : [])),
    segments: found.flatMap((f) => (f.segment ? [f.segment] : [])),
    symbol: ANY_SIGN.test(caption),
  }
}

/** A label that is a number and nothing else ("3", "−3", "4,5", "-2"): the number of its own mark, written on the line anyway. */
export const isBareNumber = (label: string): boolean => new RegExp(`^\\s*${CAPTION_NUMBER}\\s*$`).test(label)

/** A label that says where a solution is: a bare number, "x = 4" (one letter, an equals sign, a number), or the letter alone. Not a sum ("2x + 3"), not a word. */
export const isSolutionLabel = (label: string): boolean => isBareNumber(label) || new RegExp(`^\\s*\\p{L}\\s*=\\s*${CAPTION_NUMBER}\\s*$`, 'u').test(label) || /^\s*\p{L}\s*$/u.test(label)

/** The value of a bare number label, or NaN. */
export const bareNumberValue = (label: string): number => (isBareNumber(label) ? numberOf(label.trim()) : Number.NaN)
