import { z } from 'zod'
import type { Json } from '../../db'
import { completeAnswer } from '../../logic'
import { PaperReadSchema, type PaperRead } from '../../schemas/papers'
import { contextFor, defineTool, logActivity, ok } from '../context'
import { loadPractice } from '../read/get-practice-paper'
import { readConfidenceMin } from './mark-paper'

/** A practice never counts for more minutes than this: a sheet photographed a day later is not a day of practice. Same as a hand-over's life. */
const MAX_MINUTES = 90

const WHY: Record<NonNullable<PaperRead['problem']>, string> = {
  too_dark: 'the photo is too dark',
  blurry: 'the photo is too blurry',
  cut_off: 'the photo is cut off',
  not_a_test: 'the photo does not show written answers',
}

/**
 * The question as the screen stores it, plus `unread: true` when the answer on the sheet could not be read. The flag lives inside the stored
 * `question` JSON so no column is needed: the results screen reads it from there.
 */
const stored = (question: object, unread: boolean) => (unread ? { ...question, unread: true } : question) as unknown as NonNullable<Json>

export const savePracticeAnswers = defineTool({
  name: 'save_practice_answers',
  description:
    'Save what the model read from the photo of a practice a learner answered on paper. Code finishes every answer by the rule of its question, marks it against the lesson key (the model never decides a mark), stores the five try answers and closes the session. An answer read with low confidence, or not read at all, is stored empty and counted wrong. A photo that cannot be used writes nothing and fails.',
  input: z.object({ sessionId: z.string(), read: PaperReadSchema }),
  output: z.object({ right: z.number(), total: z.number(), unread: z.array(z.number()) }),
  async run(base, { sessionId, read }) {
    const ctx = await contextFor(base, 'sessions', sessionId)
    const db = ctx.db
    if (!read.pageUsable) throw new Error(`Jemma could not read the practice photo: ${WHY[read.problem ?? 'blurry']}`)

    const practice = await loadPractice(ctx, sessionId)
    const min = readConfidenceMin(ctx)
    const byN = new Map(read.answers.map((a) => [a.n, a]))

    // Mark in code: the answer as written, finished by the rule of its question (the one the screen uses), then marked against the key.
    const rows = practice.questions.map(({ n, question }) => {
      const a = byN.get(n)
      const written = (a?.answerAsRead ?? '').trim()
      if (!a || written === '' || a.confidence < min) return { n, question, answer: '', correct: false, unread: true }
      const done = completeAnswer(question, written)
      return { n, question, answer: done.stored, correct: done.correct, unread: false }
    })
    const right = rows.filter((r) => r.correct).length

    // Running again replaces the try answers (a retried job must not make ten). The answers before them, the warm-up, stay.
    await ok(db.from('session_items').delete().eq('session_id', sessionId).eq('phase', 'try').select('id'))
    const before = await ok(db.from('session_items').select('created_at').eq('session_id', sessionId))
    const startedAt = [...before.map((r) => r.created_at)].sort()[0] ?? practice.sentAt ?? ctx.now().toISOString()
    const minutes = Math.min(MAX_MINUTES, Math.max(1, Math.round((ctx.now().getTime() - new Date(startedAt).getTime()) / 60_000)))

    await ok(
      db
        .from('session_items')
        .insert(
          rows.map((r) => ({
            session_id: sessionId,
            position: r.n,
            phase: 'try' as const,
            question: stored(r.question, r.unread),
            difficulty: r.question.difficulty,
            answer: r.answer,
            correct: r.correct,
            seconds: 0,
            adapted: null,
          })),
        )
        .select('id'),
    )
    await ok(db.from('sessions').update({ status: 'done', right, minutes, finished_at: ctx.now().toISOString() }).eq('id', sessionId).select('id'))

    const unread = rows.filter((r) => r.unread).map((r) => r.n)
    await logActivity(ctx, {
      text: `Read a practice written on paper: ${right} of ${rows.length} right${unread.length ? `, ${unread.length} could not be read` : ''}`,
      tool: 'save_practice_answers',
      childId: practice.childId,
    })
    return { right, total: rows.length, unread }
  },
})
