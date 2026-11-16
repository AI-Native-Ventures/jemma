import type { Choice } from '../../schemas/lesson'
import { choiceKeyProblem, hasChoices, markChoice } from './choices'
import { markReason, reasonKeyProblem } from './reasons'
import { markTrueFalse, trueFalseKeyProblem } from './true-false'

export * from './choices'
export * from './geometry-reasons'
export * from './reasons'
export * from './true-false'

/**
 * The questions a learner answers by picking (P149): a question with `choices` (any kind it says it is: the letter decides), a `truefalse` question and a
 * `reason` question. The last two ignore any `choices` they carry. This is the one place that says which rule marks a question that is picked, for the
 * server action, the paper reader and the save gate alike.
 */
type PickQuestion = { answer: string; answerKind: string; choices?: readonly Choice[] }

export const isPickQuestion = (q: PickQuestion): boolean => q.answerKind === 'truefalse' || q.answerKind === 'reason' || hasChoices(q)

/**
 * Finishes and marks a picked answer, or null when the question is not picked (the caller marks it as it always did). `markValue` compares the number of a
 * `reason` that has a value (meaning.ts gives it `markByMeaning('number', ...)`).
 */
export function finishPicked(
  q: PickQuestion,
  typed: string,
  markValue: (key: string, typed: string) => boolean,
): { stored: string; correct: boolean } | null {
  if (q.answerKind === 'truefalse') return markTrueFalse(q.answer, typed)
  if (q.answerKind === 'reason') return markReason(q.answer, typed, markValue)
  if (hasChoices(q)) return markChoice(q, typed)
  return null
}

/** Why the key of a picked question cannot be marked, or null. The save gate asks it of every question for which `isPickQuestion` is true. */
export function pickKeyProblem(q: PickQuestion): string | null {
  if (q.answerKind === 'truefalse') return trueFalseKeyProblem(q.answer)
  if (q.answerKind === 'reason') return reasonKeyProblem(q.answer)
  return choiceKeyProblem(q)
}
