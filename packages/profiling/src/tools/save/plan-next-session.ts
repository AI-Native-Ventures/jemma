import { z } from 'zod'
import { classIdFor } from '../../ai/subject-profile'
import type { Json, JemmaDb } from '../../db'
import { orderOpenGaps, pickPractice, resolveChoice, type ChosenTopic, type PracticePick } from '../../logic'
import { FormatSchema, type Format } from '../../schemas/lesson'
import { assertInSchool, contextFor, defineTool, ok, type ToolContext } from '../context'
import { loadChoiceRules, loadPracticeInput } from '../read/practice-input'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MS = 86_400_000
/** Ties on the fewest trials go in this order. */
const ROTATION: Format[] = ['diagram', 'reading', 'audio']
const MAX_AWAY_TOPICS = 3

const QueueItem = z.object({ topicName: z.string(), topicId: z.string().nullable(), reason: z.enum(['gap', 'away', 'review']) })

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

type PlannedRow = { id: string; lesson_id: string | null; planned_for: string; topic_id: string | null; topic_name: string | null; format: Format | null }

/** A planned session as the plan the tool answers (reused). Null when the session has no topic or format to say. */
async function reusedPlan(db: JemmaDb, row: PlannedRow, plannedFor: string = row.planned_for): Promise<SessionPlan | null> {
  const lesson = row.lesson_id ? await ok(db.from('lessons').select('id, topic_id, topic_name, format').eq('id', row.lesson_id).single()) : null
  const topicName = row.topic_name ?? lesson?.topic_name
  const format = row.format ?? lesson?.format
  if (!topicName || !format) return null
  return {
    planned: true, reused: true, sessionId: row.id, lessonId: row.lesson_id ?? '',
    topicName, topicId: row.topic_id ?? lesson?.topic_id ?? null, format, plannedFor, queue: [],
  }
}

/** The format with the fewest trials, ties diagram, reading, audio. */
const leastTried = (trials: { format: Format }[]): Format => {
  const count = (f: Format) => trials.filter((t) => t.format === f).length
  return ROTATION.reduce((best, f) => (count(f) < count(best) ? f : best))
}

/**
 * Plans one session: a placeholder lesson row holds the topic and format until save_lesson fills it, and the session row points at it.
 * Two runs planning the same child at once (the papers of a test are read three at a time) both get here: the oldest planned session stays
 * and the other run removes its own and returns the oldest. `among` says which sessions that is: `later` (today or later, the normal rule)
 * or `today` (a learner's choice for today: a session planned for a later day is a different session and stays where it is).
 */
async function createPlanned(
  db: JemmaDb,
  childId: string,
  pick: { topicId: string | null; topicName: string },
  format: Format,
  plannedFor: string,
  today: string,
  queue: SessionPlan['queue'],
  among: 'later' | 'today',
): Promise<SessionPlan> {
  const lesson = await ok(
    db.from('lessons').insert({ child_id: childId, topic_id: pick.topicId, topic_name: pick.topicName, format, content: {} as NonNullable<Json> }).select('id').single(),
  )
  const session = await ok(
    db.from('sessions').insert({ child_id: childId, lesson_id: lesson.id, status: 'planned', planned_for: plannedFor, warmup: [] as NonNullable<Json>, topic_id: pick.topicId, topic_name: pick.topicName, format }).select('id').single(),
  )
  const waiting = db.from('sessions').select('id, lesson_id, planned_for, topic_id, topic_name, format').eq('child_id', childId).eq('status', 'planned')
  const ahead = await ok((among === 'today' ? waiting.eq('planned_for', today) : waiting.gte('planned_for', today)).order('created_at').order('id'))
  const keeper = ahead[0]
  if (keeper && keeper.id !== session.id) {
    await db.from('sessions').delete().eq('id', session.id)
    await db.from('lessons').delete().eq('id', lesson.id)
    return {
      planned: true, reused: true, sessionId: keeper.id, lessonId: keeper.lesson_id ?? '',
      topicName: keeper.topic_name ?? pick.topicName, topicId: keeper.topic_id, format: keeper.format ?? format, plannedFor: keeper.planned_for, queue,
    }
  }
  return { planned: true, reused: false, sessionId: session.id, lessonId: lesson.id, topicName: pick.topicName, topicId: pick.topicId, format, plannedFor, queue }
}

/** A learner's choice, already checked, planned for today. The format is the one with the fewest trials on its family (a strand's trials are recorded under its label). */
async function planChosen(db: JemmaDb, childId: string, chosen: ChosenTopic, today: string): Promise<SessionPlan> {
  const trials = await ok(db.from('format_trials').select('format').eq('child_id', childId).in('topic_family', [...new Set([chosen.family, chosen.topicName])]))
  const queue: SessionPlan['queue'] = [{ topicName: chosen.topicName, topicId: chosen.topicId, reason: 'review' }]
  return createPlanned(db, childId, chosen, leastTried(trials), today, today, queue, 'today')
}

export const planNextSession = defineTool({
  name: 'plan_next_session',
  description:
    'Plan the next home session for one child (code only, no model): the open gap with the lowest stage, basics first, the format with the fewest trials on that topic family, on the next day without an activity. Returns the planned session; the lesson itself is written by save_lesson. With `practice: true` (the learner asked to practise now) the session is for today: a planned session that is not finished is returned (one still ahead is brought forward to today); otherwise the same plan runs for today, and when it finds nothing, code picks a fixed gap, the weakest strand of the past records or the first topic of the term (reason `review`). With a `choice` as well (a topic of the learner\'s map, one of their gaps or a strand of their subject) a session that is due is returned, and otherwise the choice is planned for today as its own session while a session planned for a later day stays where it is; any other choice is refused (planned false).',
  input: z.object({
    childId: z.string(),
    practice: z.boolean().optional(),
    /** What the learner chose to practise. Used only with `practice: true`. */
    choice: z.object({ topicId: z.string().nullable().optional(), topicName: z.string() }).optional(),
  }),
  output: SessionPlanSchema,
  async run(base: ToolContext, { childId, practice = false, choice }): Promise<SessionPlan> {
    await assertInSchool(base, 'children', [childId])
    const ctx = await contextFor(base, 'children', childId)
    const db = ctx.db
    const now = ctx.now()
    const today = isoDay(now)

    if (practice) {
      // The learner asked to practise now: a planned session that is not finished is the practice. The one the home starts is the latest
      // that is due (today or earlier); with none due, the earliest one ahead is brought forward to today.
      const waiting = await ok(
        db.from('sessions').select('id, lesson_id, planned_for, topic_id, topic_name, format').eq('child_id', childId).eq('status', 'planned').order('planned_for'),
      )
      const due = waiting.filter((s) => s.planned_for <= today)
      // With a choice, only a session that is due is the practice (one thing at a time). A session ahead stays where it is.
      const asked = choice ? due[due.length - 1] : (due[due.length - 1] ?? waiting[0])
      if (asked) {
        const forward = asked.planned_for > today
        const reused = await reusedPlan(db, asked, forward ? today : asked.planned_for)
        if (reused) {
          if (forward) await ok(db.from('sessions').update({ planned_for: today }).eq('id', asked.id).eq('status', 'planned').select('id'))
          return reused
        }
      }
    } else {
      // A planned session that is still ahead of us is returned as is.
      const planned = await ok(
        db.from('sessions').select('id, lesson_id, planned_for, topic_id, topic_name, format').eq('child_id', childId).eq('status', 'planned').gte('planned_for', today).order('planned_for').limit(1),
      )
      if (planned[0]) {
        const reused = await reusedPlan(db, planned[0])
        if (reused) return reused
      }
    }

    // The learner chose what to practise: it is theirs to choose (`resolveChoice`), and it is planned for today as its own session. The
    // normal plan (open gaps, days away) does not run: the choice is what they asked for.
    if (practice && choice) {
      const chosen = resolveChoice(choice, await loadChoiceRules(db, childId))
      return chosen ? planChosen(db, childId, chosen, today) : none
    }

    const enrolments = await ok(db.from('enrolments').select('class_id').eq('child_id', childId))
    // A child in several classes is planned from the class whose event started the planning, when it can be told: that class's
    // map and gaps only. A child in one class, or an event that names no class, is planned from every class the child is in, as before.
    const classIds = enrolments.map((e) => e.class_id)
    const only = new Set(classIds).size > 1 ? await classIdFor(db, { childId, eventId: ctx.eventId }) : null
    const mapClasses = only ? [only] : classIds
    const maps = enrolments.length
      ? await ok(db.from('curriculum_maps').select('id').eq('status', 'approved').in('class_id', mapClasses))
      : []
    const topics = maps.length
      ? await ok(db.from('topics').select('id, name, family, term, position, prerequisite_ids').in('map_id', maps.map((m) => m.id)))
      : []
    topics.sort((a, b) => a.term - b.term || a.position - b.position)
    const byId = new Map(topics.map((t) => [t.id, t]))
    const byName = new Map(topics.map((t) => [t.name, t]))

    // Open gaps: lowest stage first, then oldest. Basics before what needs them (`orderOpenGaps`, which "My maths" asks too).
    let openGaps = (await ok(db.from('gaps').select('topic_id, topic_name, stage, created_at').eq('child_id', childId))).filter((g) => g.stage !== 'fixed')
    if (only) {
      // The topics of any map of that class (an earlier draft too), so a gap found on them still counts.
      const ownMaps = await ok(db.from('curriculum_maps').select('id').eq('class_id', only))
      const own = ownMaps.length ? await ok(db.from('topics').select('id, name').in('map_id', ownMaps.map((m) => m.id))) : []
      const ownIds = new Set(own.map((t) => t.id))
      const ownNames = new Set(own.map((t) => t.name))
      openGaps = openGaps.filter((g) => (g.topic_id ? ownIds.has(g.topic_id) : ownNames.has(g.topic_name)))
    }
    const gaps = orderOpenGaps(openGaps, (id) => byId.get(id)?.prerequisite_ids ?? [])
    const queue: SessionPlan['queue'] = gaps.map((g) => ({ topicName: g.topic_name, topicId: g.topic_id ?? byName.get(g.topic_name)?.id ?? null, reason: 'gap' as const }))

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
    let pick = queue[0]
    // Practising now and nothing is open: code picks what to practise (a fixed gap, the weakest strand, the first topic of the term).
    let review: PracticePick | null = null
    if (!pick && practice) {
      review = pickPractice(await loadPracticeInput(db, childId, now))
      if (review) {
        pick = { topicName: review.topicName, topicId: review.topicId, reason: 'review' }
        queue.push(pick)
      }
    }
    if (!pick) return none

    // Format: fewest trials on this topic family, ties diagram, reading, audio. The trials of a strand are recorded under its label.
    const family = review ? review.family : ((pick.topicId ? byId.get(pick.topicId)?.family : byName.get(pick.topicName)?.family) ?? '')
    const trials = await ok(
      review
        ? db.from('format_trials').select('format').eq('child_id', childId).in('topic_family', [...new Set([family, pick.topicName])])
        : db.from('format_trials').select('format').eq('child_id', childId).eq('topic_family', family),
    )
    const format = leastTried(trials)

    // A practice is for today. The normal plan is for the next day without an activity.
    let plannedFor = today
    if (!practice) {
      const activities = await ok(db.from('activities').select('days').eq('child_id', childId))
      plannedFor = nextFreeDay(now, new Set(activities.flatMap((a) => a.days)))
    }
    return createPlanned(db, childId, { topicId: pick.topicId, topicName: pick.topicName }, format, plannedFor, today, queue, 'later')
  },
})
