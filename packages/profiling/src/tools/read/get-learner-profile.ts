import { z } from 'zod'
import { LearnerProfileSchema, type LearnerProfile } from '../../schemas/profile'
import { assertInSchool, defineTool, maybe, ok, type ToolContext } from '../context'

/** Builds the learner profile from the database. The child must already be checked with `assertInSchool`. */
export async function loadProfile(ctx: ToolContext, childId: string): Promise<LearnerProfile> {
  const db = ctx.db
  const child = await ok(db.from('children').select('id, first_name, grade, school_id').eq('id', childId).single())
  const [school, enrolments, results, gaps, sessions, observations, attendance, activities, guidance] = await Promise.all([
    ok(db.from('schools').select('name').eq('id', child.school_id).single()),
    ok(db.from('enrolments').select('class_id').eq('child_id', childId)),
    ok(db.from('question_results').select('id, paper_id, topic_name, mark, misconception, created_at').eq('child_id', childId)),
    ok(db.from('gaps').select('id, topic_id, topic_name, stage, evidence').eq('child_id', childId).order('created_at')),
    ok(db.from('sessions').select('id, lesson_id, right, minutes, finished_at').eq('child_id', childId).eq('status', 'done').order('finished_at', { ascending: false }).limit(5)),
    ok(db.from('observations').select('id, kind, text, author_id, created_at').eq('child_id', childId).order('created_at', { ascending: false }).limit(20)),
    ok(db.from('attendance').select('day, status').eq('child_id', childId).order('day')),
    ok(db.from('activities').select('id, kind, name, place, days, since').eq('child_id', childId).order('created_at')),
    maybe(db.from('guidance_cards').select('content').eq('child_id', childId).maybeSingle()),
  ])

  const classIds = enrolments.map((e) => e.class_id)
  const className = classIds.length
    ? ((await ok(db.from('classes').select('name').in('id', classIds).order('created_at').limit(1)))[0]?.name ?? null)
    : null

  // Marks by topic: percent per paper, latest paper against the one before it.
  const paperIds = [...new Set(results.map((r) => r.paper_id))]
  const papers = paperIds.length ? await ok(db.from('papers').select('id, test_id, created_at').in('id', paperIds)) : []
  const testIds = papers.map((p) => p.test_id).filter((t): t is string => !!t)
  const tests = testIds.length ? await ok(db.from('tests').select('id, written_on, created_at').in('id', testIds)) : []
  const testDate = new Map(tests.map((t) => [t.id, t.written_on ?? t.created_at]))
  const paperDate = new Map(papers.map((p) => [p.id, (p.test_id && testDate.get(p.test_id)) || p.created_at]))
  const byTopic = new Map<string, Map<string, { got: number; of: number }>>()
  for (const r of results) {
    const perPaper = byTopic.get(r.topic_name) ?? new Map()
    const cur = perPaper.get(r.paper_id) ?? { got: 0, of: 0 }
    cur.got += r.mark
    cur.of += 1
    perPaper.set(r.paper_id, cur)
    byTopic.set(r.topic_name, perPaper)
  }
  const marksByTopic = [...byTopic].map(([topicName, perPaper]) => {
    const ordered = [...perPaper].sort((x, y) => String(paperDate.get(x[0])).localeCompare(String(paperDate.get(y[0]))))
    const pct = (v: { got: number; of: number }) => Math.round((v.got / v.of) * 100)
    const latest = pct(ordered[ordered.length - 1]![1])
    const previous = ordered.length > 1 ? pct(ordered[ordered.length - 2]![1]) : latest
    return { topicName, percent: latest, change: latest - previous }
  })

  const resultById = new Map(results.map((r) => [r.id, r]))
  const lessonIds = sessions.map((s) => s.lesson_id).filter((id): id is string => id !== null)
  const lessons = lessonIds.length ? await ok(db.from('lessons').select('id, topic_name, format').in('id', lessonIds)) : []
  const authorIds = [...new Set(observations.map((o) => o.author_id))]
  const authors = authorIds.length ? await ok(db.from('profiles').select('user_id, display_name').in('user_id', authorIds)) : []
  const authorName = new Map(authors.map((a) => [a.user_id, a.display_name]))

  const profile: LearnerProfile = {
    child: { id: child.id, firstName: child.first_name, grade: child.grade, schoolName: school.name, className },
    marksByTopic,
    gaps: gaps.map((g) => ({
      id: g.id,
      topicName: g.topic_name,
      topicId: g.topic_id,
      stage: g.stage,
      evidence: g.evidence,
      misconception: g.evidence.map((e) => resultById.get(e)?.misconception).find((m): m is string => !!m) ?? null,
    })),
    recentSessions: sessions.map((s) => {
      const lesson = lessons.find((l) => l.id === s.lesson_id)
      return { id: s.id, topicName: lesson?.topic_name ?? '', format: lesson?.format ?? 'reading', right: s.right, minutes: s.minutes, finishedAt: s.finished_at }
    }),
    observations: observations.map((o) => ({ id: o.id, kind: o.kind, text: o.text, author: authorName.get(o.author_id) ?? null, createdAt: o.created_at })),
    attendance: {
      present: attendance.filter((a) => a.status !== 'away').length,
      total: attendance.length,
      away: attendance.filter((a) => a.status === 'away').map((a) => a.day),
    },
    activities: activities.map((a) => ({ id: a.id, kind: a.kind, name: a.name, place: a.place, days: a.days, since: a.since })),
    guidance: guidance ? (guidance.content as LearnerProfile['guidance']) : null,
  }
  return LearnerProfileSchema.parse(profile)
}

export const getLearnerProfile = defineTool({
  name: 'get_learner_profile',
  description: 'Read one learner profile: marks by topic, open gaps, recent sessions, observations, attendance, activities and guidance.',
  input: z.object({ childId: z.string() }),
  output: LearnerProfileSchema,
  async run(ctx, { childId }) {
    await assertInSchool(ctx, 'children', [childId])
    return loadProfile(ctx, childId)
  },
})
