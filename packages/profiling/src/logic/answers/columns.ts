import type { ColumnsSpec } from '../../schemas/lesson'

/**
 * P168: a sum worked in columns, from the "Write digits in columns" board. Two or three whole numbers added, or the second taken from the first; the learner
 * writes the answer digit by digit from the ones, and may write a carry over a column. Only the answer is marked, as a whole number always was. These rules keep
 * the sum one a phone can show in columns, and make the key the true answer. Pure: no database, no model, no browser.
 */

/** The most digits of a number in the sum, and the most numbers added. */
export const COLUMNS_MAX_DIGITS = 6
export const COLUMNS_MAX_ADDED = 3

/** The names of the places, from the ones: what is written over each column. */
export const PLACE_NAMES = ['O', 'T', 'H', 'Th', 'TTh', 'HTh', 'M'] as const
/** The same places in words, for a screen reader. */
export const PLACE_WORDS = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands', 'millions'] as const

const DIGITS = /^(0|[1-9]\d*)$/

/** The answer of the sum, worked exactly on the digits, or null when it cannot be worked (a number that is not digits, a take away below 0). */
export function columnsResult(c: ColumnsSpec): string | null {
  if (!c.numbers.every((n) => DIGITS.test(n.trim()))) return null
  const values = c.numbers.map((n) => BigInt(n.trim()))
  if (c.op === '+') return String(values.reduce((a, b) => a + b, 0n))
  const [a, b] = values
  if (a === undefined || b === undefined || a < b) return null
  return String(a - b)
}

/** How many answer boxes the sum has: one for each column, and one more for an addition (its last carry), so the boxes never tell how long the answer is. */
export const columnsBoxes = (c: ColumnsSpec): number => Math.max(1, ...c.numbers.map((n) => n.trim().length)) + (c.op === '+' ? 1 : 0)

/** Why a sum cannot be worked in columns on a phone, or null. The save gate asks it of every question that has one. */
export function columnsProblem(c: ColumnsSpec): string | null {
  const count = c.numbers.length
  if (c.op === '-' && count !== 2) return 'a take away in columns has 2 numbers: the second is taken from the first'
  if (c.op === '+' && (count < 2 || count > COLUMNS_MAX_ADDED)) return `an addition in columns has 2 to ${COLUMNS_MAX_ADDED} numbers`
  if (!c.numbers.every((n) => DIGITS.test(n.trim()))) return 'each number of a sum in columns is written as digits only, like 347'
  if (c.numbers.some((n) => n.trim().length > COLUMNS_MAX_DIGITS)) return `each number of a sum in columns has at most ${COLUMNS_MAX_DIGITS} digits`
  if (columnsResult(c) === null) return 'the first number of a take away is at least the second'
  return null
}

/** Why the key of a sum in columns is not its answer, or null: a whole answer, and the true one. */
export function columnsKeyProblem(q: { answer: string; answerKind: string; columns: ColumnsSpec }): string | null {
  if (q.answerKind !== 'whole') return 'a sum in columns has a whole answer'
  const right = columnsResult(q.columns)
  const key = q.answer.trim().replace(/[\s ]/g, '')
  if (right === null || key !== right) return `the answer of ${q.columns.numbers.join(` ${q.columns.op} `)} is ${right ?? 'not a whole number'}, not ${q.answer.trim()}`
  return null
}

/**
 * The answer the boxes hold, from the left, or '' while it is not one yet: the ones box is filled and no box is empty between the first digit and the ones.
 * `digits` has one entry for each box, the leftmost first ('' for an empty box).
 */
export function columnsAnswer(digits: string[]): string {
  const first = digits.findIndex((d) => d !== '')
  if (first < 0 || digits[digits.length - 1] === '') return ''
  const used = digits.slice(first)
  return used.every((d) => /^\d$/.test(d)) ? used.join('') : ''
}

/**
 * The places of an answer as the results draw them, from the left, one for each box: what was written there ('' when nothing), the right digit, and whether
 * the two are the same. A place left empty where the right answer has no digit is right.
 */
export function columnsPlaces(c: ColumnsSpec, wrote: string): { wrote: string; right: string; ok: boolean }[] {
  const boxes = columnsBoxes(c)
  const right = (columnsResult(c) ?? '').padStart(boxes, ' ')
  const typed = wrote.trim().replace(/^0+(?=\d)/, '').slice(-boxes).padStart(boxes, ' ')
  return Array.from({ length: boxes }, (_, i) => {
    const r = right[i]!.trim()
    const w = typed[i]!.trim()
    return { wrote: w, right: r, ok: w === r }
  })
}
