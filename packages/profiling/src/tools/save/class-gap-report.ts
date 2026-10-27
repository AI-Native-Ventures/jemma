import { z } from 'zod'
import { classGaps, type ClassGap, type DiagnosedResult } from '../../logic'
import { ReteachSchema } from '../../schemas/diagnosis'
import { assertInSchool, contextFor, defineTool, logActivity, maybe, ok, type ToolContext } from '../context'

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s)

const ClassGapSchema = z.object({
  topicName: z.string(),
  topicId: z.string().nullable(),
  learners: z.array(z.object({ childId: z.string(), wrote: z.array(z.string()) })),
  mistake: z.object({ label: z.string(), example: z.string(), count: z.number() }),
})

/** The class's gaps for one test, ranked in code. Gaps with a diagnosed topic group by it, the rest by the question's topic. */
export async function computeClassGaps(
  ctx: ToolContext,
  classId: string,
  testId: string,
): Promise<{ gaps: ClassGap[]; names: Map<string, string> }> {
  await assertInSchool(ctx, 'classes', [classId])
  await assertInSchool(ctx, 'tests', [testId])
  const { db } = ctx
  const test = await ok(db.from('tests').select('class_id').eq('id', testId).single())
  if (test.class_id !== classId) throw new Error('test is not in this class')
  const [enrolled, maps, papers] = await Promise.all([
    ok(db.from('enrolments').select('child_id, created_at').eq('class_id', classId).order('created_at')),
    ok(db.from('curriculum_maps').select('id').eq('class_id', classId)),
    ok(db.from('papers').select('id').eq('test_id', testId).eq('status', 'marked')),
  ])
  const kids = enrolled.length ? await ok(db.from('children').select('id, first_name').in('id', enrolled.map((e) => e.child_id))) : []
  // By first name: enrolments made in one batch share a timestamp, and the prompt must not depend on row order.
  const roster = enrolled.map((e) => ({ id: e.child_id, name: kids.find((k) => k.id === e.child_id)?.first_name ?? '' })).sort((a, b) => a.name.localeCompare(b.name))
  const topics = maps.length ? await ok(db.from('topics').select('id, name').in('map_id', maps.map((m) => m.id)).order('term').order('position').order('name')) : []
  const rows = papers.length
    ? await ok(
        db
          .from('question_results')
          .select('child_id, n, prompt, answer_read, correct, topic_name, gap_topic_id, misconception')
          .in('paper_id', papers.map((p) => p.id))
          .order('n'),
      )
    : []
  const results: DiagnosedResult[] = rows.map((r) => ({
    childId: r.child_id,
    n: r.n,
    prompt: r.prompt,
    answerRead: r.answer_read,
    correct: r.correct,
    topicName: r.topic_name,
    gapTopicName: topics.find((t) => t.id === r.gap_topic_id)?.name ?? null,
    misconception: r.misconception,
  }))
  const gaps = classGaps(results, roster).map((g) => ({
    ...g,
    topicId: topics.find((t) => t.name.toLowerCase() === g.topicName.toLowerCase())?.id ?? null,
  }))
  return { gaps, names: new Map(roster.map((r) => [r.id, r.name])) }
}

export const classGapReport = defineTool({
  name: 'class_gap_report',
  description:
    'Save the class report for one test. The gaps are computed in code; you send the why sentence and the Reteach for gap 1 (plus the missing basic and a short explanation if useful).',
  input: z.object({
    classId: z.string(),
    testId: z.string(),
    why: z.string(),
    reteach: ReteachSchema,
    missingBasic: z.string().nullish(),
    explanation: z.string().nullish(),
  }),
  output: z.object({ gaps: z.array(ClassGapSchema), reteachId: z.string().nullable() }),
  async run(ctx, input) {
    const here = await contextFor(ctx, 'classes', input.classId)
    const { gaps } = await computeClassGaps(ctx, input.classId, input.testId)
    const n = gaps.length
    if (n === 0) {
      await logActivity(here, { text: 'Found no class gaps', tool: 'class_gap_report', classId: input.classId })
      return { gaps, reteachId: null }
    }
    const top = gaps[0]!
    const fields = {
      class_id: input.classId,
      test_id: input.testId,
      topic_id: top.topicId,
      topic_name: top.topicName,
      content: input.reteach,
      why: input.why,
      missing_basic: input.missingBasic ?? null,
      explanation: input.explanation ?? null,
    }
    const prior = await maybe(
      ctx.db.from('reteach_plans').select('id').eq('class_id', input.classId).eq('test_id', input.testId).order('created_at').limit(1).maybeSingle(),
    )
    let reteachId: string
    if (prior) {
      const { error } = await ctx.db.from('reteach_plans').update(fields).eq('id', prior.id)
      if (error) throw new Error(error.message)
      reteachId = prior.id
    } else {
      reteachId = (await ok(ctx.db.from('reteach_plans').insert(fields).select('id').single())).id
    }
    await logActivity(here, {
      text: n === 1 ? 'Found 1 class gap and the mistake behind it' : `Found ${n} class gaps and the mistake behind each one`,
      tool: 'class_gap_report',
      classId: input.classId,
    })
    await logActivity(here, {
      text: `Wrote a ${input.reteach.minutes} minute reteach for ${lowerFirst(top.topicName)}`,
      tool: 'class_gap_report',
      classId: input.classId,
    })
    return { gaps, reteachId }
  },
})
