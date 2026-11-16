import type { Choice } from '../../schemas/lesson'
import { pictureProblem } from '../picture'

/**
 * Choice questions (P149): the options are lettered A to E, a question may have from two to five of them, and an option may be a picture.
 *
 * One rule for every question that has `choices`, whatever its `answerKind` says: it is marked by the letter. (Before P149 a question with choices and
 * another kind, say `number`, was marked by that kind, so the letter the learner tapped was read as a number and never matched.)
 */

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
export const MIN_CHOICES = 2
export const MAX_CHOICES = CHOICE_LETTERS.length

/** The words of an option, or undefined for an option that is only a picture. */
export const choiceText = (choice: Choice): string | undefined => {
  const text = typeof choice === 'string' ? choice : choice.text
  return text?.trim() ? text : undefined
}

/** The picture of an option, if it has one. */
export const choiceDiagram = (choice: Choice) => (typeof choice === 'string' ? undefined : choice.diagram)

/** True when at least one option is a picture: the screen then draws cards, not buttons. */
export const hasPictureChoices = (choices: readonly Choice[] | undefined): boolean => !!choices?.some((c) => choiceDiagram(c))

/** The words that stand for an option: its text, or "Picture B" for an option that is only a picture (the results screen and the paper reader use it). */
export const choiceLabel = (choice: Choice, index: number): string => choiceText(choice) ?? `Picture ${CHOICE_LETTERS[index] ?? index + 1}`

const LETTER = /^\(?([a-e])\)?\.?$/i
const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The letter of the option that `text` stands for: a letter itself (`B`, `b`, `(b)`, `b.`), or the words of one option (a learner on paper wrote "0,5"
 * for option C). Null when it is neither. A letter is a letter even when an option's text is the same letter.
 */
export function choiceLetterOf(choices: readonly Choice[] | undefined, text: string): string | null {
  const letter = LETTER.exec(text.trim())
  if (letter) return letter[1]!.toUpperCase()
  const wanted = squash(text)
  if (!wanted || !choices) return null
  const at = choices.findIndex((c) => squash(choiceText(c) ?? '') === wanted)
  return at >= 0 ? (CHOICE_LETTERS[at] ?? null) : null
}

/** A question that is picked from `choices`: it has some. (`truefalse` and `reason` are not: they ignore any choices they carry.) */
export const hasChoices = (q: { choices?: readonly Choice[] }): boolean => !!q.choices?.length

/** What is stored and whether it was right, for a question with choices: the letter is compared with the letter of the key. */
export function markChoice(q: { answer: string; choices?: readonly Choice[] }, typed: string): { stored: string; correct: boolean } {
  const letter = choiceLetterOf(q.choices, typed)
  const key = choiceLetterOf(q.choices, q.answer)
  return { stored: letter ?? typed.trim(), correct: letter !== null && key !== null && letter === key }
}

/** Why the options or the key of a question with choices cannot be used, or null: from 2 to 5 options, a key that is one of their letters (or words). */
export function choiceKeyProblem(q: { answer: string; choices?: readonly Choice[] }): string | null {
  const count = q.choices?.length ?? 0
  if (count < MIN_CHOICES || count > MAX_CHOICES) return `a choice question needs ${MIN_CHOICES} to ${MAX_CHOICES} choices`
  const key = choiceLetterOf(q.choices, q.answer)
  if (key === null || CHOICE_LETTERS.indexOf(key as (typeof CHOICE_LETTERS)[number]) >= count) return `answer "${q.answer}" is not one of the ${count} choices`
  return null
}

/** Why a picture or an empty option cannot be used ("choice B picture: ..."), or null. Words are never read here: the maths of a choice is not a label on a child. */
export function choicePictureProblem(choices: readonly Choice[] | undefined): string | null {
  for (const [i, choice] of (choices ?? []).entries()) {
    const diagram = choiceDiagram(choice)
    if (!choiceText(choice) && !diagram) return `choice ${CHOICE_LETTERS[i] ?? i + 1} has no words and no picture`
    const problem = diagram ? pictureProblem(diagram) : null
    if (problem) return `choice ${CHOICE_LETTERS[i] ?? i + 1} picture: ${problem}`
  }
  return null
}
