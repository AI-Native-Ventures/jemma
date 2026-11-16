/**
 * True or false (P149): a statement the learner decides is true or false, by tapping one of two buttons. The key (and the answer) is `true` or `false`, in any
 * case; `T` and `F` are read too (a learner on paper). Anything else is not an answer.
 */

export const TRUE_FALSE_LABELS = ['True', 'False'] as const

/** `true`, `false`, or null when the text is neither. */
export function readTrueFalse(text: string): boolean | null {
  const word = text.trim().toLowerCase().replace(/[.!\s]+$/, '')
  if (word === 'true' || word === 't') return true
  if (word === 'false' || word === 'f') return false
  return null
}

/** The label of a side as the buttons and the results screen show it. */
export const trueFalseLabel = (value: boolean): (typeof TRUE_FALSE_LABELS)[number] => (value ? 'True' : 'False')

export function markTrueFalse(key: string, typed: string): { stored: string; correct: boolean } {
  const wanted = readTrueFalse(key)
  const given = readTrueFalse(typed)
  return { stored: given === null ? typed.trim() : trueFalseLabel(given), correct: wanted !== null && given !== null && wanted === given }
}

/** Why a key cannot be marked as true or false, or null. */
export const trueFalseKeyProblem = (key: string): string | null => (readTrueFalse(key) === null ? `answer "${key}" is not true or false` : null)
