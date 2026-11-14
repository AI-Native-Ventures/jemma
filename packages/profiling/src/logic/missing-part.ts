/**
 * Fractions written inside a question, and the one that has a part left out ("3/5 = ?/15").
 * Pure text rules: the child's screens and the server's marking both use them, so the two always agree.
 */

/** A question mark, underscores, an empty box character or three dots: a number the child has to supply. */
const UNKNOWN = String.raw`\?+|_+|[□☐▢⬜◻▯⎕]|\.{3}|…`
const PART = String.raw`\d+|${UNKNOWN}`
// Not in the middle of a word, a number or a longer chain of slashes: that keeps "km/h" and "12/11/2026" as text.
const FRACTION = new RegExp(String.raw`(?<![\w/])(${PART})(\s*)/(\s*)(${PART})(?![\w/])`, 'g')
const DIGITS = /^\d+$/

/** One fraction found in a text. A part that is `null` is the unknown one. */
export type FoundFraction = {
  /** Where it starts in the text. */
  index: number
  /** How many characters it covers. */
  length: number
  top: string | null
  bottom: string | null
}

/**
 * Every fraction in `text`, in order: digits over digits ("3/5"), or a fraction with an unknown part with or
 * without spaces around the slash ("?/15", "3 / ?", "__/8"). Digits over digits with spaces ("12 / 4") is a
 * sum, not a fraction.
 */
export function fractionsIn(text: string): FoundFraction[] {
  const found: FoundFraction[] = []
  for (const m of text.matchAll(FRACTION)) {
    const top = m[1]!
    const bottom = m[4]!
    const spaced = m[2]!.length > 0 || m[3]!.length > 0
    if (spaced && DIGITS.test(top) && DIGITS.test(bottom)) continue
    found.push({
      index: m.index!,
      length: m[0].length,
      top: DIGITS.test(top) ? top : null,
      bottom: DIGITS.test(bottom) ? bottom : null,
    })
  }
  return found
}

export type MissingPart = {
  /** Which part of the fraction the child has to supply. */
  unknown: 'top' | 'bottom'
  /** The part that is written, as digits. */
  known: string
}

/**
 * When a prompt has exactly one unknown part, and it is a part of a fraction, says which part and what the other
 * part is ("Complete: 3/5 = ?/15" is the top, with 15 under it). Otherwise null.
 */
export function missingPart(prompt: string): MissingPart | null {
  const unknowns = fractionsIn(prompt).flatMap((f) => [
    ...(f.top === null ? [{ unknown: 'top' as const, known: f.bottom }] : []),
    ...(f.bottom === null ? [{ unknown: 'bottom' as const, known: f.top }] : []),
  ])
  if (unknowns.length !== 1) return null
  const only = unknowns[0]!
  return only.known === null ? null : { unknown: only.unknown, known: only.known }
}
