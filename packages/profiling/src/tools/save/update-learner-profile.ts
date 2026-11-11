import { z } from 'zod'
import { nextStage, type Stage } from '../../logic'
import { DiagnosisSchema, type Diagnosis } from '../../schemas/diagnosis'
import { assertInSchool, contextFor, defineTool, logActivity, maybe, ok, type ToolContext } from '../context'

const STAGE_LABEL: Record<Stage, string> = { new: 'New', practising: 'Practising', fixed: 'Fixed' }
const DEFAULT_FIX_AFTER_DAYS = 3

type Topic = { id: string; name: string; family: string; misconceptions: string[] }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The class a test or a paper belongs to: the class of the test (a test, or a teacher's paper that has one). Homework has no test and
 * no class: a learner in one class is placed in it, and a learner in several gets all of them, the older class first, so that no
 * class's topics are dropped by picking one.
 */
async function classesOf(ctx: ToolContext, childId: string, scope: { testId?: string; paperId?: string }): Promise<string[]> {
  if (scope.testId) return [(await ok(ctx.db.from('tests').select('class_id').eq('id', scope.testId).single())).class_id]
  const paper = scope.paperId ? await maybe(ctx.db.from('papers').select('test_id').eq('id', scope.paperId).maybeSingle()) : null
  if (paper?.test_id) return [(await ok(ctx.db.from('tests').select('class_id').eq('id', paper.test_id).single())).class_id]
  const enrolled = await ok(ctx.db.from('enrolments').select('class_id').eq('child_id', childId))
  if (!enrolled[0]) throw new Error('child is not in a class')
  const ids = [...new Set(enrolled.map((e) => e.class_id))]
  if (ids.length === 1) return ids
  const ordered = await ok(ctx.db.from('classes').select('id').in('id', ids).order('created_at'))
  return ordered.map((c) => c.id)
}

async function topicsOfClass(ctx: ToolContext, classId: string): Promise<Topic[]> {
  const maps = await ok(ctx.db.from('curriculum_maps').select('id').eq('class_id', classId))
  if (maps.length === 0) return []
  // Ordered like the map, so the prompt is the same for every sandbox with the same map.
  return ok(ctx.db.from('topics').select('id, name, family, misconceptions').in('map_id', maps.map((m) => m.id)).order('term').order('position').order('name'))
}

async function topicsOfClasses(ctx: ToolContext, classIds: string[]): Promise<Topic[]> {
  const lists: Topic[][] = []
  for (const id of classIds) lists.push(await topicsOfClass(ctx, id))
  return lists.flat()
}

export type DiagnoseInputs = {
  childId: string
  firstName: string
  /** Wrong answers still to diagnose. */
  wrong: { resultId: string; n: number; prompt: string; answerRead: string; topicName: string; labels: string[] }[]
  /** Topic names the model may pick as the gap topic. */
  topicNames: string[]
}

/** What the diagnoser needs for one learner: wrong answers with ids and the label list of each topic. */
export async function loadDiagnoseInputs(
  ctx: ToolContext,
  input: { childId: string; testId?: string; paperId?: string },
): Promise<DiagnoseInputs> {
  await assertInSchool(ctx, 'children', [input.childId])
  if (input.testId) await assertInSchool(ctx, 'tests', [input.testId])
  else await assertInSchool(ctx, 'papers', [input.paperId!])
  const papers = await ok(
    input.testId
      ? ctx.db.from('papers').select('id').eq('test_id', input.testId).eq('child_id', input.childId)
      : ctx.db.from('papers').select('id').eq('id', input.paperId!).eq('child_id', input.childId),
  )
  const child = await ok(ctx.db.from('children').select('first_name').eq('id', input.childId).single())
  const classIds = await classesOf(ctx, input.childId, input)
  const topics = await topicsOfClasses(ctx, classIds)
  const rows = papers.length
    ? await ok(
        ctx.db
          .from('question_results')
          .select('id, n, prompt, answer_read, topic_id, topic_name')
          .in('paper_id', papers.map((p) => p.id))
          .eq('child_id', input.childId)
          .eq('correct', false)
          .order('n'),
      )
    : []
  return {
    childId: input.childId,
    firstName: child.first_name,
    wrong: rows.map((r) => ({
      resultId: r.id,
      n: r.n,
      prompt: r.prompt,
      answerRead: r.answer_read,
      topicName: r.topic_name,
      labels: topics.find((t) => t.id === r.topic_id || same(t.name, r.topic_name))?.misconceptions ?? [],
    })),
    topicNames: topics.map((t) => t.name),
  }
}

async function diagnose(
  ctx: ToolContext,
  input: { childId: string; testId?: string; paperId?: string; diagnoses: Diagnosis },
): Promise<{ gapsOpened: number; gapsMoved: number }> {
  const { db } = ctx
  const here = await contextFor(ctx, 'children', input.childId)
  if (input.testId) await assertInSchool(ctx, 'tests', [input.testId])
  if (input.paperId) await assertInSchool(ctx, 'papers', [input.paperId])
  const child = await ok(db.from('children').select('first_name').eq('id', input.childId).single())
  const classIds = await classesOf(ctx, input.childId, input)
  const classId = classIds.length === 1 ? classIds[0] : undefined
  const topics = await topicsOfClasses(ctx, classIds)

  const ids = [...new Set(input.diagnoses.map((d) => d.resultId))]
  const papers = await ok(
    input.testId
      ? db.from('papers').select('id').eq('test_id', input.testId).eq('child_id', input.childId)
      : db.from('papers').select('id').eq('id', input.paperId!).eq('child_id', input.childId),
  )
  const results = ids.length
    ? await ok(db.from('question_results').select('id, child_id, paper_id, topic_id, topic_name, correct').in('id', ids))
    : []
  const paperIds = new Set(papers.map((p) => p.id))
  for (const id of ids) {
    const r = results.find((x) => x.id === id)
    if (!r || r.child_id !== input.childId || !paperIds.has(r.paper_id)) throw new Error(`result ${id} is not this learner's answer`)
    if (r.correct) throw new Error(`result ${id} is marked right and has no gap`)
  }

  const evidence = new Map<string, { name: string; topicId: string | null; ids: string[] }>()
  for (const d of input.diagnoses) {
    const r = results.find((x) => x.id === d.resultId)!
    const gapTopic = topics.find((t) => same(t.name, d.gapTopicName))
    const own = topics.find((t) => t.id === r.topic_id)
    const allowed = [...(gapTopic?.misconceptions ?? []), ...(own?.misconceptions ?? [])]
    const said = d.misconception.trim()
    const label = allowed.find((a) => same(a, said)) ?? (/^other:/i.test(said) ? said : `Other: ${said || 'unclear'}`)
    const name = gapTopic?.name ?? (d.gapTopicName.trim() || r.topic_name)
    const topicId = gapTopic?.id ?? null
    const { error } = await db.from('question_results').update({ misconception: label, gap_topic_id: topicId }).eq('id', d.resultId)
    if (error) throw new Error(error.message)
    const key = name.toLowerCase()
    const seen = evidence.get(key) ?? { name, topicId, ids: [] }
    if (!seen.ids.includes(d.resultId)) seen.ids.push(d.resultId)
    evidence.set(key, seen)
  }

  const existing = await ok(db.from('gaps').select('id, topic_name, stage, evidence').eq('child_id', input.childId))
  let opened = 0
  let moved = 0
  for (const g of evidence.values()) {
    const open = existing.find((e) => e.stage !== 'fixed' && same(e.topic_name, g.name))
    if (open) {
      const merged = [...new Set([...open.evidence, ...g.ids])]
      const { error } = await db.from('gaps').update({ evidence: merged, topic_id: g.topicId }).eq('id', open.id)
      if (error) throw new Error(error.message)
      moved++
    } else {
      const { error } = await db.from('gaps').insert({ child_id: input.childId, topic_id: g.topicId, topic_name: g.name, stage: 'new', evidence: g.ids })
      if (error) throw new Error(error.message)
      opened++
    }
  }
  const n = evidence.size
  await logActivity(here, {
    text: `Looked at ${child.first_name}'s wrong answers and found ${n} gap${n === 1 ? '' : 's'}`,
    tool: 'update_learner_profile',
    classId,
    childId: input.childId,
  })
  return { gapsOpened: opened, gapsMoved: moved }
}

async function finishSession(ctx: ToolContext, childId: string, sessionId: string): Promise<{ gapsOpened: number; gapsMoved: number }> {
  const { db } = ctx
  const here = await contextFor(ctx, 'sessions', sessionId)
  await assertInSchool(ctx, 'children', [childId])
  const session = await ok(db.from('sessions').select('child_id, lesson_id, right, topic_id, topic_name, format').eq('id', sessionId).single())
  if (session.child_id !== childId) throw new Error('session belongs to another learner')
  const [child, lesson, items] = await Promise.all([
    ok(db.from('children').select('first_name').eq('id', childId).single()),
    session.lesson_id
      ? ok(db.from('lessons').select('topic_id, topic_name, format').eq('id', session.lesson_id).single())
      : Promise.resolve({ topic_id: session.topic_id, topic_name: session.topic_name ?? '', format: session.format ?? 'reading' }),
    ok(db.from('session_items').select('phase').eq('session_id', sessionId)),
  ])
  const right = session.right ?? 0
  const tries = items.filter((i) => i.phase === 'try').length
  const total = tries || items.length
  const topic = lesson.topic_id ? await maybe(db.from('topics').select('family').eq('id', lesson.topic_id).maybeSingle()) : null

  const trial = await ok(db.from('format_trials').select('id').eq('session_id', sessionId))
  if (trial.length === 0) {
    const { error } = await db
      .from('format_trials')
      .insert({ child_id: childId, topic_family: topic?.family ?? lesson.topic_name, format: lesson.format, score: right, session_id: sessionId })
    if (error) throw new Error(error.message)
  }

  const gaps = await ok(db.from('gaps').select('id, topic_id, topic_name, stage, first_practised_at, created_at').eq('child_id', childId).neq('stage', 'fixed'))
  const gap = gaps
    .filter((g) => (lesson.topic_id ? g.topic_id === lesson.topic_id : false) || same(g.topic_name, lesson.topic_name))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  let text = `${child.first_name} finished the lesson: ${right} of ${total}.`
  let movedCount = 0
  if (gap) {
    const now = ctx.now()
    const fixAfter = Number((ctx.env as { FIX_AFTER_DAYS?: string }).FIX_AFTER_DAYS ?? DEFAULT_FIX_AFTER_DAYS)
    const before = gap.stage as Stage
    const after = nextStage({
      stage: before,
      right,
      firstPractisedAt: gap.first_practised_at ? new Date(gap.first_practised_at) : null,
      now,
      fixAfterDays: Number.isFinite(fixAfter) ? fixAfter : DEFAULT_FIX_AFTER_DAYS,
    })
    if (after !== before) {
      const { error } = await db
        .from('gaps')
        .update({
          stage: after,
          first_practised_at: gap.first_practised_at ?? (after === 'practising' ? now.toISOString() : null),
          fixed_at: after === 'fixed' ? now.toISOString() : null,
        })
        .eq('id', gap.id)
      if (error) throw new Error(error.message)
      movedCount = 1
      text += ` Moved ${child.first_name} to ${STAGE_LABEL[after]}`
    } else {
      text += ` Kept ${child.first_name} at ${STAGE_LABEL[after]}`
    }
  }
  await logActivity(here, { text, tool: 'update_learner_profile', childId })
  return { gapsOpened: 0, gapsMoved: movedCount }
}

export const updateLearnerProfile = defineTool({
  name: 'update_learner_profile',
  description:
    'Save the diagnosis of a learner\'s wrong answers ({ childId, testId or paperId, diagnoses }) or apply a finished lesson ({ childId, sessionId }). Opens or updates gaps, moves a gap on a finished lesson and records the format trial. No model runs here.',
  input: z.object({
    childId: z.string(),
    testId: z.string().optional(),
    paperId: z.string().optional(),
    sessionId: z.string().optional(),
    diagnoses: DiagnosisSchema.optional(),
  }),
  output: z.object({ gapsOpened: z.number(), gapsMoved: z.number() }),
  async run(ctx, input) {
    if (input.sessionId) return finishSession(ctx, input.childId, input.sessionId)
    if ((input.testId || input.paperId) && input.diagnoses) {
      return diagnose(ctx, { childId: input.childId, testId: input.testId, paperId: input.paperId, diagnoses: input.diagnoses })
    }
    throw new Error('send { childId, sessionId } or { childId, testId (or paperId), diagnoses }')
  },
})
