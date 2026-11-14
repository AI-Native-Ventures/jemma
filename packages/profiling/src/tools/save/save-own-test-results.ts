import { z } from 'zod'
import { matchMapTopic } from '../../logic'
import { MarkedTestReadSchema } from '../../schemas/marked-test'
import { contextFor, defineTool, logActivity, ok } from '../context'
import { loadOwnTestPaper, ownMapTopics } from '../read/get-own-test'
import { readConfidenceMin, type PaperProblem } from './mark-paper'

/** What `papers.error` holds for a marked test that could not be read: the code of a photo that could not be used, written by code. */
const READ_FAILED: PaperProblem = 'read_failed'

/** The name a result keeps when the model gave no topic words at all. */
const NO_TOPIC = 'Marked test'

/**
 * Save what the model read from the photo of a test a learner got back already marked. The teacher marked it: code keeps the teacher's mark
 * (a tick is right, a cross or a half mark is not) and never marks an answer itself. Each question the model read with enough confidence becomes
 * one `question_results` row of the learner. The column `mark` is a whole number, so a tick is 1 and a cross or a half mark is 0, and the column
 * `n` is a whole number, so a question is numbered by the place it was read in (the number printed on the page, "2a", goes in front of its words).
 */
export const saveOwnTestResults = defineTool({
  name: 'save_own_test_results',
  description:
    "Save what the model read from the photo of a test a learner got back already marked. The teacher's marks are kept as they are: a tick is right, a cross or a half mark is not, and the model and code never mark an answer. Each question read with enough confidence is stored as a result under a topic of the learner's approved map (the topic with the same name, or the one that shares the most words, else the model's own words). A question read with low confidence is left out and counted. A photo that cannot be used writes nothing and fails the paper.",
  input: z.object({ paperId: z.string(), read: MarkedTestReadSchema }),
  output: z.object({
    childId: z.string(),
    title: z.string().nullable(),
    right: z.number(),
    part: z.number(),
    wrong: z.number(),
    written: z.number(),
    leftOut: z.number(),
    total: z.number(),
    outOf: z.number(),
    status: z.literal('marked'),
  }),
  async run(base, { paperId, read }) {
    const ctx = await contextFor(base, 'papers', paperId)
    const db = ctx.db
    const paper = await loadOwnTestPaper(ctx, paperId)
    const childId = paper.childId

    // Running again replaces the earlier read, and a paper that failed keeps no result behind it.
    await ok(db.from('question_results').delete().eq('paper_id', paperId).select('id'))

    const fail = async (message: string): Promise<never> => {
      await ok(db.from('papers').update({ status: 'failed', error: READ_FAILED, total: null }).eq('id', paperId).select('id'))
      throw new Error(message)
    }
    if (!read.pageUsable) return fail('Jemma could not read the marked test: the photo could not be used')

    const min = readConfidenceMin(ctx)
    const kept = read.questions.filter((x) => x.confidence >= min)
    const leftOut = read.questions.length - kept.length
    if (kept.length === 0) return fail('Jemma could not read any marks on this test')

    const topics = await ownMapTopics(db, childId)
    const rows = kept.map((x, i) => {
      const topic = matchMapTopic(x.topic, topics)
      const printed = x.n.trim()
      const words = x.prompt.trim()
      const right = x.result === 'right'
      return {
        paper_id: paperId,
        child_id: childId,
        n: i + 1,
        prompt: printed ? `${printed}. ${words}` : words,
        answer_read: x.answerAsWritten.trim(),
        read_confidence: x.confidence,
        correct: right,
        mark: right ? 1 : 0,
        crop: null,
        topic_id: topic?.id ?? null,
        topic_name: topic?.name ?? (x.topic.trim().replace(/\s+/g, ' ') || NO_TOPIC),
        misconception: null,
      }
    })
    await ok(db.from('question_results').insert(rows).select('id'))

    const right = kept.filter((x) => x.result === 'right').length
    const part = kept.filter((x) => x.result === 'part').length
    const wrong = kept.filter((x) => x.result === 'wrong').length
    const total = rows.reduce((sum, r) => sum + r.mark, 0)
    await ok(db.from('papers').update({ status: 'marked', total, error: null }).eq('id', paperId).select('id'))
    await logActivity(ctx, {
      text: `Read your marked test: ${right} of ${kept.length} right${leftOut ? `, ${leftOut} left out` : ''}`,
      tool: 'save_own_test_results',
      childId,
    })
    return { childId, title: read.title?.trim() || null, right, part, wrong, written: kept.length, leftOut, total, outOf: kept.length, status: 'marked' as const }
  },
})
