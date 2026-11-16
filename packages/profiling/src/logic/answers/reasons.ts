import { GEOMETRY_REASONS, findReason, normaliseReason, type GeometryReason } from './geometry-reasons'

/**
 * The answer of a `reason` question (P149), in Euclidean geometry: the reason for a step, picked from the fixed list (`GEOMETRY_REASONS`), and sometimes the
 * value of the step as well ("Find angle B, and say why": 40 and "angles in the same segment"). The answer is one text:
 *
 *   angles on a straight line                  a reason alone
 *   40; angles in the same segment             a value, a semicolon, then the reason
 *
 * The value is a whole number or a decimal (an angle or a length, with a degree sign allowed): the value box of the screen has digits only. Both parts must be
 * right for the answer to be right. The reason is compared by its words, in any case; the value is compared as a number (by `markValue`, which the caller gives:
 * meaning.ts marks it with `markByMeaning('number', ...)`, so 40, 40° and 40,0 are the same).
 *
 * A learner on paper writes the two parts in one line ("40° angles in the same segment", "40, angles in the same segment"): the reason is looked for in the
 * line and what is left is the value.
 */

const SEPARATOR = ';'
/** A value of a `reason` key: a whole number or a decimal (comma or point), with a degree sign at the end allowed. */
const VALUE = /^\d+(?:[.,]\d+)?\s*[°º]?$/

type Split = { value: string | null; reason: GeometryReason | null }

/** The reasons from the longest to the shortest: when a line holds two (one inside the other), the longer one is the one written. */
const LONGEST_FIRST = [...GEOMETRY_REASONS].sort((a, b) => b.length - a.length)

/**
 * The value and the reason of an answer. `strict` (a key) wants the whole of the text to be a reason, with an optional `value;` before it; otherwise (an
 * answer) the reason may sit anywhere in the line and the rest of the line is the value.
 */
export function splitReasonAnswer(text: string, strict = false): Split {
  const t = text.trim()
  const semicolon = t.indexOf(SEPARATOR)
  if (semicolon >= 0) return { value: t.slice(0, semicolon).trim(), reason: findReason(t.slice(semicolon + 1)) }
  const exact = findReason(t)
  if (exact || strict) return { value: null, reason: exact }
  const flat = t.replace(/\s+/g, ' ')
  const lower = flat.toLowerCase()
  for (const reason of LONGEST_FIRST) {
    const words = normaliseReason(reason)
    const at = lower.indexOf(words)
    if (at < 0) continue
    const rest = `${flat.slice(0, at)} ${flat.slice(at + words.length)}`.trim().replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '')
    return { value: rest || null, reason }
  }
  return { value: null, reason: null }
}

/** True when a key holds a value as well as a reason: the screen then shows a value box above the list. */
export const reasonKeyHasValue = (key: string): boolean => key.includes(SEPARATOR)

/**
 * The answer text the screen sends: `value; reason`, or the reason alone. Empty (so Next stays off) until what is shown is complete: a reason is picked and,
 * when the question has a value box, the box holds a number.
 */
export function composeReasonAnswer({ reason, value, withValue }: { reason: string; value: string; withValue: boolean }): string {
  if (!reason) return ''
  if (!withValue) return reason
  const number = value.trim().replace(/[.,]+$/, '')
  return /\d/.test(number) ? `${number}${SEPARATOR} ${reason}` : ''
}

/** What is stored and whether it was right. `markValue` says whether the typed value is the key's value, as numbers. */
export function markReason(key: string, typed: string, markValue: (key: string, typed: string) => boolean): { stored: string; correct: boolean } {
  const wanted = splitReasonAnswer(key, true)
  const given = splitReasonAnswer(typed)
  const stored = given.reason ? (given.value ? `${given.value}${SEPARATOR} ${given.reason}` : given.reason) : typed.trim()
  if (!wanted.reason || given.reason !== wanted.reason) return { stored, correct: false }
  if (wanted.value === null) return { stored, correct: true }
  return { stored, correct: !!given.value && markValue(wanted.value, given.value) }
}

/** Why a key cannot be marked as a reason, or null: the reason is in the list, and a value before it (if any) is a whole number or a decimal. */
export function reasonKeyProblem(key: string): string | null {
  const { value, reason } = splitReasonAnswer(key, true)
  if (!reason) return `answer "${key}" is not a reason from the list`
  if (value !== null && !VALUE.test(value)) return `answer "${key}" has a value that is not a whole number or a decimal`
  return null
}
