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
