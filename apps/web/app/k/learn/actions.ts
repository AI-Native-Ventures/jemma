'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { myChild } from '@/lib/data/p27'
import { storedLesson, underSessionHandover } from '@/lib/data/teaching'
import { markLessonQuestion, questionAt, type LessonAnswerResult, type LessonWhere } from '@/lib/teaching'
import { answerMaxLength, LINES_ANSWER_MAX_LENGTH } from '../session/[sessionId]/logic'

// The learner's side of a teaching lesson (P144). The browser holds the lesson without the answers of its questions; an answer is sent here and marked on
// the server with the same marking a practice session uses. Progress is written with the service client after the learner is found (`myChild`), the way
// every other row of a learner is written: a learner's own session can read it but not write it.

/** A lesson that is there and ready, whole, or an error the screen says in plain words. Also proves the person asking is a signed-in learner (`myChild`). */
async function lessonOf(topicLessonId: string) {
  // A parent's hand-over of ONE session covers that session only (the lesson screens are not opened for it), so no answer or progress is taken for it either.
  if (await underSessionHandover()) throw new Error('This lesson is not available')
  const { child } = await myChild()
  const stored = await storedLesson(topicLessonId)
  if (!stored) throw new Error('This lesson is not available')
  return { child, lesson: stored.lesson }
}

/**
 * Marks one answer of a lesson (the question of a try block, or a practice question) and tells the learner what was right: the answer, the steps and the
 * right way. Only now does any of that leave the server. The answer is the text the question screen builds (a choice letter, "3/4", "x = 4").
 */
export async function answerLessonQuestion(topicLessonId: string, where: LessonWhere, answer: string): Promise<LessonAnswerResult> {
  const text = typeof answer === 'string' ? answer.trim() : ''
  // A list, an order and a table hold several values and may be longer (P150), and the lines of a proof or of first principles longer still (P185): the
  // question says which, once it is found.
  if (!text || text.length > LINES_ANSWER_MAX_LENGTH) throw new Error('Write an answer first')
  const { lesson } = await lessonOf(topicLessonId)
  const question = questionAt(lesson, where)
  if (!question) throw new Error('That question is not in this lesson')
  if (text.length > answerMaxLength(question)) throw new Error('Write an answer first')
  return markLessonQuestion(question, text)
}

/** The learner opened the lesson: a first time is remembered (so the list says "Continue"); opening it again changes nothing. */
export async function startTopicLesson(topicLessonId: string): Promise<void> {
  const { child } = await lessonOf(topicLessonId)
  const { error } = await createSupabaseAdmin()
    .from('topic_lesson_progress')
    .upsert({ child_id: child.id, topic_lesson_id: topicLessonId }, { onConflict: 'child_id,topic_lesson_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/**
 * The learner finished the practice of the lesson: the lesson is ticked and how the practice went is kept. The total is the lesson's own number of practice
 * questions (not what the browser says) and the right count is held between 0 and that. A lesson done again keeps the newest score and the first start.
 */
export async function finishTopicLesson(topicLessonId: string, right: number, _total: number): Promise<void> {
  const { child, lesson } = await lessonOf(topicLessonId)
  const of = lesson.practice.length
  const got = Number.isFinite(right) ? Math.max(0, Math.min(of, Math.round(right))) : 0
  const { error } = await createSupabaseAdmin()
    .from('topic_lesson_progress')
    .upsert({ child_id: child.id, topic_lesson_id: topicLessonId, finished_at: new Date().toISOString(), practice_right: got, practice_total: of }, { onConflict: 'child_id,topic_lesson_id' })
  if (error) throw new Error(error.message)
}
