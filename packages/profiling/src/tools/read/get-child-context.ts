import { z } from 'zod'
import { LearnerProfileSchema } from '../../schemas/profile'
import { assertInSchool, defineTool } from '../context'
import { loadProfile } from './get-learner-profile'

const SessionPlanSchema = z.object({
  id: z.string(),
  status: z.enum(['planned', 'in_progress', 'done']),
  plannedFor: z.string(),
  lessonId: z.string(),
  topicName: z.string(),
  format: z.enum(['reading', 'diagram', 'audio']),
  warmup: z.unknown(),
})

export const getChildContext = defineTool({
  name: 'get_child_context',
  description: 'Read what a lesson writer needs for one child: profile, open gaps, format trials and the planned session.',
  input: z.object({ childId: z.string(), sessionId: z.string().optional() }),
  output: z.object({
    profile: LearnerProfileSchema,
    gaps: LearnerProfileSchema.shape.gaps,
    formatTrials: z.array(z.object({ topicFamily: z.string(), format: z.enum(['reading', 'diagram', 'audio']), score: z.number() })),
    session: SessionPlanSchema.nullable(),
  }),
  async run(ctx, { childId, sessionId }) {
    await assertInSchool(ctx, 'children', [childId])
    if (sessionId) await assertInSchool(ctx, 'sessions', [sessionId])
    const profile = await loadProfile(ctx, childId)
    const trials = await ctx.db.from('format_trials').select('topic_family, format, score').eq('child_id', childId).order('created_at')
    if (trials.error) throw new Error(trials.error.message)
    let q = ctx.db.from('sessions').select('id, status, planned_for, lesson_id, warmup').eq('child_id', childId)
    q = sessionId ? q.eq('id', sessionId) : q.eq('status', 'planned').order('planned_for', { ascending: false }).limit(1)
    const sess = await q
    if (sess.error) throw new Error(sess.error.message)
    const row = sess.data[0]
    let session: z.infer<typeof SessionPlanSchema> | null = null
    if (row) {
      const lesson = await ctx.db.from('lessons').select('topic_name, format').eq('id', row.lesson_id).single()
      if (lesson.error) throw new Error(lesson.error.message)
      session = { id: row.id, status: row.status, plannedFor: row.planned_for, lessonId: row.lesson_id, topicName: lesson.data.topic_name, format: lesson.data.format, warmup: row.warmup }
    }
    return {
      profile,
      gaps: profile.gaps.filter((g) => g.stage !== 'fixed'),
      formatTrials: trials.data.map((t) => ({ topicFamily: t.topic_family, format: t.format, score: t.score })),
      session,
    }
  },
})
