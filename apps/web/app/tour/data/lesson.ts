import type { Lesson, Question } from '@jemma/profiling/schemas'
import { stripQuestion, type QuestionForChild } from '../../k/session/[sessionId]/logic'
import type { LessonForChild } from '../../k/session/[sessionId]/types'
import file from './lesson.json'

// A real lesson, written by the app's own AI for Grade 11 Mathematics, saved as it came (lesson.json: the database id is the only thing taken out).
// The tour reads it from the bundle: no database, no model.

export const TOUR_LESSON = file.content as unknown as Lesson
export const TOUR_TOPIC_NAME = file.topic_name

/** The five questions of the tour, by their words (not their place in the list), in the order the learner meets them: an equation to type, then another
 *  equation, a whole number, a choice and a point. The first one is the one the learner answers; the rest are skipped. */
export const TOUR_PROMPTS = [
  'Solve: x^2 − 5x + 6 = 0',
  'Solve: (x + 1)/2 − (x − 3)/3 = 2',
  'The lines y = 4x − 5 and y = −2x + 7 are shown. Find the x-coordinate of the point where they meet.',
  'The parabola y = x^2 − 2x − 3 is shown. Find the values of x for which y < 0.',
  'y = 3x − 2 and y = −2x + 8. Find the point where the two lines meet.',
] as const

function pick(prompt: string): Question {
  const found = TOUR_LESSON.questions.find((q) => q.prompt === prompt)
  if (!found) throw new Error(`tour lesson has no question "${prompt}"`)
  return found
}

export const TOUR_QUESTIONS: Question[] = TOUR_PROMPTS.map(pick)

/** What the learner's screen holds of the lesson: no answer in it. */
export function tourLessonForChild(): LessonForChild {
  return {
    title: TOUR_LESSON.title,
    format: TOUR_LESSON.format,
    minutes: TOUR_LESSON.minutes,
    topicName: TOUR_TOPIC_NAME,
    diagram: TOUR_LESSON.diagram,
    warmupCount: 0,
    tryCount: TOUR_QUESTIONS.length,
    first: null,
  }
}

/** The five questions as the learner's screen holds them (no answer, no why, no right way), numbered 1 to 5. */
export function tourQuestionsForChild(): QuestionForChild[] {
  return TOUR_QUESTIONS.map((q, i) => stripQuestion(q, { position: i + 1, phase: 'try', index: i + 1, of: TOUR_QUESTIONS.length }))
}
