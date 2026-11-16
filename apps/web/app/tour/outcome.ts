import type { Question } from '@jemma/profiling/schemas'
import { answerText, finishAnswer, type MissedQuestion } from '../k/session/[sessionId]/logic'

// What the learner did in the tour, as pure functions: a typed answer is marked by the app's own marking (the one the real session uses), a skipped
// question is wrong, and the review is the same list the real results screen draws one card for. No database, no clock.

/** What a skipped question says it was answered with, on its card ("You wrote"). */
export const SKIPPED = 'Skipped'

/** The browser tab remembers how the learner did, so the teacher's page can show the same result a moment later. */
export const TOUR_RESULT_KEY = 'jemma-tour-result'

/** The result the teacher's page shows before the learner has been through the tour: the way the owner goes through it, 1 of 5. */
export const DEFAULT_YOU: boolean[] = [true, false, false, false, false]

/** Marks what was typed or picked, with the one function the learner's session marks with ("x = 3 or x = 2" is right for "x = 2 or x = 3"). */
export const markTourAnswer = (q: Question, typed: string): boolean => finishAnswer(q, typed).correct

/** One slot for each question: what was typed, or null when the learner skipped it. */
export type Typed = (string | null)[]

/** Every question in order, each marked right or missed: what the results screen draws one card for. */
export function reviewTour(questions: Question[], typed: Typed): MissedQuestion[] {
  return questions.map((q, i) => {
    const text = typed[i] ?? null
    const done = text === null ? null : finishAnswer(q, text)
    const steps = (q.steps ?? []).filter((s) => s.trim() !== '')
    return {
      n: i + 1,
      correct: done?.correct ?? false,
      prompt: q.prompt,
      render: q.render,
      ...(q.terms ? { terms: q.terms } : {}),
      ...(q.diagram ? { diagram: q.diagram } : {}),
      wrote: done === null ? SKIPPED : answerText(q, done.stored),
      right: answerText(q, q.answer),
      why: q.why,
      rightWay: q.rightWay,
      ...(steps.length > 0 ? { steps } : {}),
    }
  })
}

/** How many were right, of how many. */
export const tourScore = (review: MissedQuestion[]): { right: number; total: number } => ({ right: review.filter((m) => m.correct).length, total: review.length })

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function saveTourResult(store: Store, results: boolean[]): void {
  try {
    store.setItem(TOUR_RESULT_KEY, JSON.stringify(results))
  } catch {
    // a browser that keeps nothing: the teacher's page shows the default
  }
}

/** The saved result of the learner, or the default when there is none or it is not five answers. */
export function readTourResult(store: Store): boolean[] {
  try {
    const raw = store.getItem(TOUR_RESULT_KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === DEFAULT_YOU.length && parsed.every((p) => typeof p === 'boolean')) return parsed as boolean[]
  } catch {
    // not readable: the default
  }
  return DEFAULT_YOU
}
