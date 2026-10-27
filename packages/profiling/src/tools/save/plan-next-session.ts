import { z } from 'zod'
import type { Json } from '../../db'
import { FormatSchema, type Format } from '../../schemas/lesson'
import { assertInSchool, contextFor, defineTool, ok, type ToolContext } from '../context'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MS = 86_400_000
/** Ties on the fewest trials go in this order. */
const ROTATION: Format[] = ['diagram', 'reading', 'audio']
const MAX_AWAY_TOPICS = 3

const QueueItem = z.object({ topicName: z.string(), topicId: z.string().nullable(), reason: z.enum(['gap', 'away']) })

export const SessionPlanSchema = z.object({
  planned: z.boolean(),
  reused: z.boolean(),
  sessionId: z.string().nullable(),
  lessonId: z.string().nullable(),
  topicName: z.string().nullable(),
  topicId: z.string().nullable(),
  format: FormatSchema.nullable(),
  plannedFor: z.string().nullable(),
  queue: z.array(QueueItem),
})
export type SessionPlan = z.infer<typeof SessionPlanSchema>

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const isSchoolDay = (day: string) => {
  const n = new Date(`${day}T00:00:00Z`).getUTCDay()
  return n !== 0 && n !== 6
}

const none: SessionPlan = { planned: false, reused: false, sessionId: null, lessonId: null, topicName: null, topicId: null, format: null, plannedFor: null, queue: [] }

/** The next day (from tomorrow, up to a week out) the child has no activity; today when every day is busy. */
export function nextFreeDay(now: Date, busyDays: Set<string>): string {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * DAY_MS)
    if (!busyDays.has(DAYS[d.getUTCDay()]!)) return isoDay(d)
  }
  return isoDay(now)
}

export const planNextSession = defineTool({
  name: 'plan_next_session',
  description:
    'Plan the next home session for one child (code only, no model): the open gap with the lowest stage, basics first, the format with the fewest trials on that topic family, on the next day without an activity. Returns the planned session; the lesson itself is written by save_lesson.',
  input: z.object({ childId: z.string() }),
  output: SessionPlanSchema,
  async run(base: ToolContext, { childId }): Promise<SessionPlan> {
    await assertInSchool(base, 'children', [childId])
    const ctx = await contextFor(base, 'children', childId)
    const db = ctx.db
    const now = ctx.now()
    const today = isoDay(now)

    // A planned session that is still ahead of us is returned as is.
    const planned = await ok(
      db.from('sessions').select('id, lesson_id, planned_for, topic_id, topic_name, format').eq('child_id', childId).eq('status', 'planned').gte('planned_for', today).order('planned_for').limit(1),
    )
    if (planned[0]) {
      const p0 = planned[0]
      const lesson = p0.lesson_id ? await ok(db.from('lessons').select('id, topic_id, topic_name, format').eq('id', p0.lesson_id).single()) : null
      const topicName = p0.topic_name ?? lesson?.topic_name
      const format = p0.format ?? lesson?.format
      if (topicName && format) {
        return {
          planned: true, reused: true, sessionId: p0.id, lessonId: p0.lesson_id ?? '',
          topicName, topicId: p0.topic_id ?? lesson?.topic_id ?? null, format, plannedFor: p0.planned_for, queue: [],
        }
      }
    }

    const enrolments = await ok(db.from('enrolments').select('class_id').eq('child_id', childId))
    const maps = enrolments.length
      ? await ok(db.from('curriculum_maps').select('id').eq('status', 'approved').in('class_id', enrolments.map((e) => e.class_id)))
      : []
    const topics = maps.length
      ? await ok(db.from('topics').select('id, name, family, term, position, prerequisite_ids').in('map_id', maps.map((m) => m.id)))
      : []
    topics.sort((a, b) => a.term - b.term || a.position - b.position)
    const byId = new Map(topics.map((t) => [t.id, t]))
    const byName = new Map(topics.map((t) => [t.name, t]))

    // Open gaps: lowest stage first, then oldest. Basics before what needs them.
    const rank = { new: 0, practising: 1, fixed: 2 } as const
    const gaps = (await ok(db.from('gaps').select('topic_id, topic_name, stage, created_at').eq('child_id', childId)))
      .filter((g) => g.stage !== 'fixed')
      .sort((a, b) => rank[a.stage] - rank[b.stage] || a.created_at.localeCompare(b.created_at))
    const gapAt = (id: string | null) => (id ? gaps.find((g) => g.topic_id === id) : undefined)
    let first = gaps[0]
    for (const seen = new Set<string>(); first && first.topic_id && !seen.has(first.topic_id); ) {
      seen.add(first.topic_id)
      const basic = (byId.get(first.topic_id)?.prerequisite_ids ?? []).map(gapAt).find((g) => g)
      if (!basic) break
      first = basic
    }
    const queue: SessionPlan['queue'] = [
      ...(first ? [first] : []),
      ...gaps.filter((g) => g !== first),
    ].map((g) => ({ topicName: g.topic_name, topicId: g.topic_id ?? byName.get(g.topic_name)?.id ?? null, reason: 'gap' as const }))

    // Away on a school day since the last plan: that many map topics (term order) join after the open gaps.
    const last = await ok(db.from('sessions').select('created_at').eq('child_id', childId).order('created_at', { ascending: false }).limit(1))
    const since = last[0] ? isoDay(new Date(last[0].created_at)) : '1970-01-01'
    const away = (await ok(db.from('attendance').select('day').eq('child_id', childId).eq('status', 'away').gt('day', since))).filter((a) => isSchoolDay(a.day))
    if (away.length) {
      const lessons = await ok(db.from('lessons').select('topic_name').eq('child_id', childId))
      const covered = new Set([...lessons.map((l) => l.topic_name), ...queue.map((x) => x.topicName)])
      const missed = topics.filter((t) => !covered.has(t.name)).slice(0, Math.min(away.length, MAX_AWAY_TOPICS))
      queue.push(...missed.map((t) => ({ topicName: t.name, topicId: t.id, reason: 'away' as const })))
    }
    const pick = queue[0]
    if (!pick) return none

    // Format: fewest trials on this topic family, ties diagram, reading, audio.
    const family = (pick.topicId ? byId.get(pick.topicId)?.family : byName.get(pick.topicName)?.family) ?? ''
    const trials = await ok(db.from('format_trials').select('format').eq('child_id', childId).eq('topic_family', family))
    const count = (f: Format) => trials.filter((t) => t.format === f).length
    const format = ROTATION.reduce((best, f) => (count(f) < count(best) ? f : best))

    const activities = await ok(db.from('activities').select('days').eq('child_id', childId))
    const plannedFor = nextFreeDay(now, new Set(activities.flatMap((a) => a.days)))

    // The session needs a lesson row, so a placeholder holds the topic and format until save_lesson fills it.
    const lesson = await ok(
      db.from('lessons').insert({ child_id: childId, topic_id: pick.topicId, topic_name: pick.topicName, format, content: {} as NonNullable<Json> }).select('id').single(),
    )
    const session = await ok(
      db.from('sessions').insert({ child_id: childId, lesson_id: lesson.id, status: 'planned', planned_for: plannedFor, warmup: [] as NonNullable<Json>, topic_id: pick.topicId, topic_name: pick.topicName, format }).select('id').single(),
    )
    return {
      planned: true, reused: false, sessionId: session.id, lessonId: lesson.id,
      topicName: pick.topicName, topicId: pick.topicId, format, plannedFor, queue,
    }
  },
})
