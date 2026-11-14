import { markAnswer } from './answers'
import { missingPart, type MissingPart } from './missing-part'

/**
 * One rule that finishes and marks an answer, whoever wrote it: the child on the screen (the server action that takes an answer) or
 * the child on paper (`save_practice_answers`). Both call this one function, so the two always agree.
 */

/** What the child typed for a missing part, put back into its fraction: 9 with a known bottom of 15 is "9/15". */
export const fillMissing = (part: MissingPart, typed: string) => (part.unknown === 'top' ? `${typed}/${part.known}` : `${part.known}/${typed}`)

/**
 * Finishes what the child typed from the stored question, and marks it. A number typed for a missing part goes back
 * into its fraction, and counts as right when the fraction OR the bare number matches the key (a key can be "9/15" or "9").
 * A whole fraction, and every other question, is marked as typed. The server does this again whatever the browser sent.
 */
export function completeAnswer(q: { prompt: string; answer: string; choices?: string[] }, typed: string): { stored: string; correct: boolean } {
  const text = typed.trim()
  const part = q.choices?.length ? null : missingPart(q.prompt)
  if (part && /^\d+$/.test(text)) {
    const stored = fillMissing(part, text)
    return { stored, correct: markAnswer(stored, q.answer).correct || markAnswer(text, q.answer).correct }
  }
  return { stored: text, correct: markAnswer(text, q.answer).correct }
}
