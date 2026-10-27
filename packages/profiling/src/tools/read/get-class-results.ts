import { z } from 'zod'
import { assertInSchool, defineTool } from '../context'

const ResultSchema = z.object({
  n: z.number(),
  prompt: z.string(),
  answerRead: z.string(),
  confidence: z.number(),
  correct: z.boolean(),
  mark: z.number(),
  topicName: z.string(),
  misconception: z.string().nullable(),
})

export const getClassResults = defineTool({
  name: 'get_class_results',
  description: 'Read the marked results of one test per learner, with the prompts and the answers that were read.',
  input: z.object({ testId: z.string() }),
  output: z.object({
    testId: z.string(),
    outOf: z.number(),
    learners: z.array(z.object({ childId: z.string(), firstName: z.string(), paperId: z.string(), total: z.number(), results: z.array(ResultSchema) })),
  }),
  async run(ctx, { testId }) {
    await assertInSchool(ctx, 'tests', [testId])
    const db = ctx.db
    const test = await db.from('tests').select('out_of').eq('id', testId).single()
    if (test.error) throw new Error(test.error.message)
    const papers = await db.from('papers').select('id, child_id, total').eq('test_id', testId).eq('status', 'marked')
    if (papers.error) throw new Error(papers.error.message)
    const marked = papers.data.filter((p) => p.child_id)
    if (marked.length === 0) return { testId, outOf: test.data.out_of, learners: [] }
    const [kids, results] = await Promise.all([
      db.from('children').select('id, first_name').in('id', marked.map((p) => p.child_id!)),
      db.from('question_results').select('paper_id, n, prompt, answer_read, read_confidence, correct, mark, topic_name, misconception').in('paper_id', marked.map((p) => p.id)).order('n'),
    ])
    if (kids.error) throw new Error(kids.error.message)
    if (results.error) throw new Error(results.error.message)
    return {
      testId,
      outOf: test.data.out_of,
      learners: marked.map((p) => {
        const rows = results.data.filter((r) => r.paper_id === p.id)
        return {
          childId: p.child_id!,
          firstName: kids.data.find((k) => k.id === p.child_id)?.first_name ?? '',
          paperId: p.id,
          total: p.total ?? rows.reduce((sum, r) => sum + r.mark, 0),
          results: rows.map((r) => ({ n: r.n, prompt: r.prompt, answerRead: r.answer_read, confidence: r.read_confidence, correct: r.correct, mark: r.mark, topicName: r.topic_name, misconception: r.misconception })),
        }
      }),
    }
  },
})
