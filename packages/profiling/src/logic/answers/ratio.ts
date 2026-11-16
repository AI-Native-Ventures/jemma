/**
 * P148: the answer kind `ratio`. "3 : 4", "3:4" and "3 to 4" are one ratio, and so are "6 : 8" and "1,5 : 2": two ratios are the same when every part is in the same
 * proportion to the first (3 : 4 is 6 : 8, and not 4 : 3). A ratio has two or three parts, each a number above 0.
 *
 * A question that asks for the simplest form ("Write 6 : 8 in its simplest form") does not take 6 : 8 for 3 : 4: when the key is in its simplest form (whole numbers
 * with nothing left to divide) and the prompt asks for it, the answer must be in its simplest form too (`asksSimplest`).
 */

import type { Mark } from './quantity'

const PART = /^\d+(?:[.,]\d+)?$/
export const MIN_PARTS = 2
export const MAX_PARTS = 3

/** The parts of a ratio, or null when the text is not one: two or three numbers above 0, joined by a colon or the word "to". */
export function readRatio(text: string): number[] | null {
  const s = text.replace(/\u2236/g, ':').replace(/\s+/g, ' ').trim()
  if (!s || s.length > 40) return null
  const pieces = s.split(/\s*(?::|\bto\b)\s*/i).map((p) => p.trim())
  if (pieces.length < MIN_PARTS || pieces.length > MAX_PARTS || !pieces.every((p) => PART.test(p))) return null
  const parts = pieces.map((p) => Number(p.replace(',', '.')))
  return parts.every((p) => p > 0) ? parts : null
}

/** How many boxes the screen draws for a key: 2 or 3, or null when the key is not a ratio. It says nothing of the key's value. */
export const ratioPartsOf = (key: string): 2 | 3 | null => {
  const parts = readRatio(key)
  return parts ? (parts.length as 2 | 3) : null
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
const proportional = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => same(v * b[0]!, b[i]! * a[0]!))

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
/** Whole numbers with nothing left to divide them by: 3 : 4 and 2 : 3 : 5, not 6 : 8 or 1,5 : 2. */
const inSimplestForm = (parts: number[]) => parts.every(Number.isInteger) && parts.reduce(gcd) === 1

/** True when a question asks for a ratio in its simplest form (or lowest terms). */
export const asksSimplest = (prompt: string | undefined): boolean => /\b(?:simplest|lowest terms|simplif\w*)\b/i.test(prompt ?? '')

/**
 * Marks a ratio. `simplest` is whether the question asks for the simplest form. A key or an answer that is not a ratio is not readable, so it is not right.
 */
export function markRatio(key: string, answer: string, simplest = false): Mark {
  const k = readRatio(key)
  const a = readRatio(answer)
  if (!k || !a) return { correct: false, comparable: false }
  const alike = proportional(k, a) && (!simplest || !inSimplestForm(k) || inSimplestForm(a))
  return { correct: alike, comparable: true }
}
