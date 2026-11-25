/**
 * P148: the rules of an answer that is a quantity: a number with a unit, an amount of money to the cent, a percent, a number rounded to some places.
 *
 * They sit beside the marking of `logic/meaning.ts` and `logic/answers.ts` and never take an answer away from them: `markQuestion` and `finishAnswer`
 * mark an answer as they always did, and only when that says "wrong" (or "not readable") do these rules look again. So an answer that was right is still right,
 * and a question with no `unit`, no `round` and no percent in it is marked exactly as before. A wrong answer stays wrong: R 15 386,43 is not R 15 386,42,
 * 24 m² is not 24 cm², and nothing here converts one unit into another.
 *
 *   unit     the unit is shown after the box; the answer may carry it (24 cm², 24cm^2, 24 cm2) or not; a different unit is a wrong answer
 *   money    R, a space or a comma between thousands, a comma or a point for the cents: R 15 386,42 = 15386.42 = 15 386,4199 (equal at the cent)
 *   percent  a key of 15% is also 0,15; a key that is a probability (0,25) is also 25% and 1/4; a key of 15 is still 15%
 *   round    "correct to 2 decimal places": an answer that rounds to the key at that many places is right, and a key with more places is rounded
 */

import { MEANING_ANSWER_KINDS } from '../../schemas/lesson'

export type Mark = { correct: boolean; comparable: boolean }
/** The value of a text made of numbers (no letter), or null. `suffix` drops a % or a degree sign at the end. This is `numeric` of `logic/meaning.ts`. */
export type NumberReader = (text: string, suffix: boolean) => number | null

/** The most characters of a unit ("km/h", "cm²", "°C"), and the most places a question may round to. */
export const MAX_UNIT_LENGTH = 12
export const MAX_ROUND = 6

const RIGHT: Mark = { correct: true, comparable: true }
const WRONG: Mark = { correct: false, comparable: true }

const MINUS_SIGNS = /[\u2212\u2010-\u2013]/g
const SPACES = /[\u00a0\u2009\u202f]/g

// ---- The unit ----------------------------------------------------------------------------------------------------------------

const cleanUnit = (unit: string | undefined): string | undefined => {
  const u = unit?.trim()
  return u ? u : undefined
}

const escapeRegExp = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The pattern of a unit as a learner may write it: ² is also ^2 and 2, ³ is also ^3 and 3, a degree sign may be left out, `/` may be "per". */
function unitPattern(unit: string): string {
  const written = unit.replace(/\^\s*\{?\s*2\s*\}?/g, '\u00b2').replace(/\^\s*\{?\s*3\s*\}?/g, '\u00b3')
  let out = ''
  for (const c of written) {
    if (c === '\u00b2' || c === '\u00b3') {
      const n = c === '\u00b2' ? '2' : '3'
      out += `(?:${c}|\\^\\s*\\{?\\s*${n}\\s*\\}?|${n})`
    } else if (c === '\u00b0' || c === '\u00ba') out += '[\u00b0\u00ba]?\\s*'
    else if (c === '/') out += '\\s*(?:/|per)\\s*'
    else if (/\s/.test(c)) out += '\\s*'
    else out += escapeRegExp(c)
  }
  return out
}

/**
 * The text without the unit at its end, when the unit is the question's own: "24 cm²" and "24cm^2" are "24" for a question in cm². Another unit stays where it is
 * (and the text then does not read, so it is not right): 24 m² is not 24 cm². Without a unit, the text is as it was. The rand sign (unit R) is read by the money rule.
 */
export function stripUnit(text: string, unit: string | undefined): string {
  const u = cleanUnit(unit)
  if (!u || u === 'R') return text
  // The maths box writes a typed "80 km/h" as 80(km/h): the unit may stand in a bracket.
  const found = new RegExp(`^(.*?\\S)\\s*(?<![A-Za-z])\\(?\\s*(?:${unitPattern(u)})\\s*\\)?\\s*$`, 'i').exec(text.trim())
  return found ? found[1]!.trim() : text
}

/**
 * A key or an answer as the results screen shows it: a bare number of a question with a unit gets the unit after it ("24 cm²"), the rand sign in front of it
 * ("R15386,42") or the percent sign ("15%"). Anything else (a word, an answer that already holds its unit) is shown as it is.
 */
export function showWithUnit(text: string, q: { unit?: string; answerKind: string }): string {
  const u = cleanUnit(q.unit)
  const bare = text.trim()
  if (!u || !['number', 'whole', 'decimal'].includes(q.answerKind) || !/^-?\d[\d ,.]*$/.test(bare)) return text
  return u === 'R' ? `R${bare}` : u === '%' ? `${bare}%` : `${bare} ${u}`
}

// ---- Money to the cent -----------------------------------------------------------------------------------------------------------

/** One, two or three digits, then groups of three with a comma in front of each. The first group does not start with 0, and no space is in it (a space and then a comma is the cents). */
const THOUSANDS = /^[1-9]\d{0,2}(?:,\d{3})+$/
/** An integer part written with groups of three (a space, a comma or a point between them), or plain digits. */
const GROUPED = /^\d{1,3}(?:[ ,.]\d{3})+$/

/**
 * The cents of an amount, or null when the text is not one. A rand sign in front, a space or a comma between the thousands, a comma or a point before the
 * cents, a minus in front. Three or more figures after the point are rounded half up at the cent (15 386,4199 is 15 386,42). A lone comma followed by exactly
 * three figures is a thousands comma (1,234 is R1 234), as is every comma inside a longer amount; a point is always a decimal point (234.567 is 234,57).
 * Exact: it works on the digits, never on a float.
 */
export function readCents(text: string): bigint | null {
  const s = text.replace(MINUS_SIGNS, '-').replace(SPACES, ' ').replace(/\s+/g, ' ').trim()
  if (!s || s.length > 40) return null
  const front = /^(-?)\s*(?:R\s*)?(-?)\s*(.*)$/i.exec(s)
  if (!front) return null
  const [, a, b, body] = front as unknown as [string, string, string, string]
  if (a && b) return null
  if (!/^(?:\d[\d ,.]*\d|\d|[.,]\d+)$/.test(body)) return null
  // A point is the decimal point, so a second one cannot be (1.234.567 is a way of writing thousands that is not read).
  if (body.split('.').length > 2) return null

  const at = Math.max(body.lastIndexOf(','), body.lastIndexOf('.'))
  let whole = body
  let cents = ''
  if (at >= 0) {
    const after = body.slice(at + 1)
    const before = body.slice(0, at)
    if (!/^\d+$/.test(after)) return null
    const thousands = after.length === 3 && body[at] === ',' && THOUSANDS.test(body)
    if (!thousands) {
      whole = before
      cents = after
    }
  }
  if (whole !== '' && !/^\d+$/.test(whole) && !GROUPED.test(whole)) return null
  let value = BigInt(whole.replace(/[ ,.]/g, '') || '0') * 100n
  const places = cents.padEnd(3, '0')
  value += BigInt(places.slice(0, 2))
  if (places[2]! >= '5') value += 1n
  return a || b ? -value : value
}

// ---- Numbers: percent and rounding -------------------------------------------------------------------------------------------------

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** `v` rounded half away from zero at `places` places, as a whole number of the last place (3,145 at 2 places is 315). A hair is added against 3,135 being held as 3,13499999. */
const scaled = (v: number, places: number): number => {
  const whole = Math.floor(Math.abs(v) * 10 ** places + 0.5 + 1e-9)
  return v < 0 ? -whole : whole
}

const endsInPercent = (text: string) => /%\s*$/.test(text.trim())

/** Why a question's `unit` or `round` cannot be used, or null. The save gate asks it of every question. */
export function quantityProblem(q: { unit?: string; round?: number }): string | null {
  const unit = cleanUnit(q.unit)
  if (unit && unit.length > MAX_UNIT_LENGTH) return `unit "${unit}" is too long (${MAX_UNIT_LENGTH} characters at most)`
  if (q.round !== undefined && !(Number.isInteger(q.round) && q.round >= 0 && q.round <= MAX_ROUND)) return `round must be a whole number from 0 to ${MAX_ROUND}`
  return null
}

export type QuantityQuestion = { answer: string; answerKind: string; unit?: string; round?: number }
/** A whole question as `markQuestion` and `finishAnswer` get it: the fields P148 reads, all optional but the two every question has. */
export type QuantityFields = QuantityQuestion & { prompt?: string }

/**
 * What these rules say about `typed` for the question, or null when none of them applies (the answer is not a quantity, or it does not read): the caller
 * keeps its own verdict then. A money question and a number in rand (unit R) compare at the cent. A number, or a decimal or a whole number with a unit or a
 * `round`, is read without its unit, then it is right when it is the key, or rounds to the key at `round` places, or (a number) is the same percent.
 */
export function markQuantity(q: QuantityQuestion, typed: string, read: NumberReader): Mark | null {
  const kind = q.answerKind
  const unit = cleanUnit(q.unit)

  if (kind === 'money' || (kind === 'number' && unit === 'R')) {
    const key = readCents(q.answer)
    const answer = readCents(typed)
    return key === null || answer === null ? null : key === answer ? RIGHT : WRONG
  }

  const quantity = kind === 'number' || ((kind === 'decimal' || kind === 'whole') && (unit !== undefined || q.round !== undefined))
  if (!quantity) return null
  const k = read(stripUnit(q.answer, unit), true)
  const a = read(stripUnit(typed, unit), true)
  if (k === null || a === null) return null
  if (close(k, a)) return RIGHT

  if (q.round !== undefined && Number.isInteger(q.round) && q.round >= 0 && q.round <= MAX_ROUND && scaled(k, q.round) === scaled(a, q.round)) return RIGHT

  if (kind === 'number') {
    const typedPercent = endsInPercent(typed)
    // A key that is a percent (15%, or 15 with the unit %): 0,15 is the same. 15 and 15% were the same already.
    if (endsInPercent(q.answer) || unit === '%') {
      if (!typedPercent && close(a * 100, k)) return RIGHT
    } else if (typedPercent && k >= 0 && k <= 1 && close(a / 100, k)) {
      // A key that is a probability (0,25): 25% is the same.
      return RIGHT
    }
  }
  return WRONG
}

// ---- Which question is a senior one ------------------------------------------------------------------------------------------------

/**
 * True when a question was written for a senior class (Grades 7 to 12). Every question the senior writer makes has worked `steps` (P127), a kind that is marked by
 * meaning, or a senior picture or a form; a primary question has none of them. A unit or a round does NOT make a question senior (a primary whole or decimal question may
 * carry a unit), and since P166 neither does one of the seven primary pictures (a Grade 1 to 6 question may carry a fraction bar or a bar graph). A whole or a decimal
 * answer of a senior question may be negative (the save gate takes a negative key for it, and the screen gives its box a minus key), and a primary one may not.
 */
const SENIOR_PICTURE_KINDS = new Set(['coordinate_plane', 'triangle', 'box_plot', 'tree', 'timeline'])
const isSeniorPicture = (diagram: unknown): boolean =>
  !!diagram && typeof diagram === 'object' && SENIOR_PICTURE_KINDS.has(String((diagram as { kind?: unknown }).kind))

export const isSeniorQuestion = (q: { steps?: string[]; answerKind: string; diagram?: unknown; form?: string }): boolean =>
  (q.steps?.some((s) => s.trim() !== '') ?? false) || (MEANING_ANSWER_KINDS as readonly string[]).includes(q.answerKind) || isSeniorPicture(q.diagram) || !!q.form
