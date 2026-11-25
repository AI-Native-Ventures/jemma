import type { JemmaDb } from '@jemma/profiling/db'
import { firstToLearn, levelHeadline, levelResults, LEVEL_QUESTIONS, pickLevelTopics, type LevelTopic, type LevelTopicResult } from '@jemma/profiling/logic'
import { isOwnRecord } from '@jemma/profiling/own-names'
import { LevelAnswersSchema, LevelQuestionsSchema, LevelTopicsSchema, type LevelAnswerRecord, type Question } from '@jemma/profiling/schemas'
import { myChild } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// P163: the level check, read and written on the server with the service role (its questions hold their answers, so no learner and no parent reads the
// table). Every caller has already checked who may see the child: the learner's own screens through `myChild`, a parent through the parent's own client.

export type LevelStatus = 'writing' | 'ready' | 'done' | 'failed'
export type LevelCheck = {
  id: string
  childId: string
  classId: string | null
  grade: number | null
  status: LevelStatus
  topics: LevelTopic[]
  questions: { topicId: string | null; topicName: string; question: Question }[]
  answers: LevelAnswerRecord[]
  eventId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

const COLUMNS = 'id, child_id, class_id, grade, status, topics, questions, answers, event_id, created_at, started_at, finished_at'

type Row = {
  id: string
  child_id: string
  class_id: string | null
  grade: number | null
  status: string
  topics: unknown
  questions: unknown
  answers: unknown
  event_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

const STATUSES: LevelStatus[] = ['writing', 'ready', 'done', 'failed']

/** A row as the screens use it. A part that does not parse is empty, so a broken row reads as a check that has to be written again. */
export function levelCheckOf(row: Row): LevelCheck {
  const topics = LevelTopicsSchema.safeParse(row.topics)
  const questions = LevelQuestionsSchema.safeParse(row.questions)
  const answers = LevelAnswersSchema.safeParse(row.answers)
  return {
    id: row.id,
    childId: row.child_id,
    classId: row.class_id,
    grade: row.grade,
    status: STATUSES.includes(row.status as LevelStatus) ? (row.status as LevelStatus) : 'failed',
    topics: topics.success ? topics.data : [],
    questions: questions.success ? questions.data : [],
    answers: answers.success ? answers.data : [],
    eventId: row.event_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

/** The newest level check of a child, or null. */
export async function latestLevelCheck(admin: JemmaDb, childId: string): Promise<LevelCheck | null> {
  const { data, error } = await admin.from('level_checks').select(COLUMNS).eq('child_id', childId).order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const row = data?.[0] as Row | undefined
  return row ? levelCheckOf(row) : null
}

/** The newest finished level check of a child, or null. */
export async function latestDoneLevelCheck(admin: JemmaDb, childId: string): Promise<LevelCheck | null> {
  const { data, error } = await admin.from('level_checks').select(COLUMNS).eq('child_id', childId).eq('status', 'done').order('finished_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const row = data?.[0] as Row | undefined
  return row ? levelCheckOf(row) : null
}

/** What a check found, from its answers: the result of each topic, in the order the topics were asked. */
export function resultsOf(check: LevelCheck): LevelTopicResult[] {
  return levelResults(
    check.answers.flatMap((a) => {
      const q = check.questions[a.n - 1]
      return q ? [{ topicId: q.topicId, topicName: q.topicName, correct: a.correct, skipped: a.skipped }] : []
    }),
  )
}

/**
 * The class and the topics of a level check for a learner of their own space: the class of the learner's grade (else the highest grade under it, else
 * the lowest above it) that has an approved map, and 6 topics of that map (`pickLevelTopics`). Null when the learner has no such class.
 */
export async function levelTopicsFor(admin: JemmaDb, child: { id: string; grade: number | null }): Promise<{ classId: string; grade: number; topics: LevelTopic[] } | null> {
  const { data: enrolments } = await admin.from('enrolments').select('class_id').eq('child_id', child.id)
  const classIds = [...new Set((enrolments ?? []).map((e) => e.class_id))]
  if (classIds.length === 0) return null
  const [{ data: classes }, { data: maps }] = await Promise.all([
    admin.from('classes').select('id, grade').in('id', classIds),
    admin.from('curriculum_maps').select('id, class_id').eq('status', 'approved').in('class_id', classIds),
  ])
  const mapped = (classes ?? []).filter((c) => (maps ?? []).some((m) => m.class_id === c.id))
  if (mapped.length === 0) return null
  const want = child.grade ?? 0
  const rank = (g: number) => (g === want ? 0 : g < want ? 1 + (want - g) : 100 + (g - want))
  const klass = [...mapped].sort((a, b) => rank(a.grade) - rank(b.grade))[0]!
  const mapIds = (maps ?? []).filter((m) => m.class_id === klass.id).map((m) => m.id)
  const { data: topics } = await admin.from('topics').select('id, name, family, term, position').in('map_id', mapIds)
  const picked = pickLevelTopics((topics ?? []).map((t) => ({ id: t.id, name: t.name, family: t.family ?? '', term: t.term ?? 1, position: t.position ?? 0 })))
  return picked.length > 0 ? { classId: klass.id, grade: klass.grade, topics: picked } : null
}

/** True when the learner has finished a practice or a lesson already: the level check is for a learner new to Jemma. */
async function hasPractised(admin: JemmaDb, childId: string): Promise<boolean> {
  const { data } = await admin.from('sessions').select('id').eq('child_id', childId).eq('status', 'done').limit(1)
  return (data ?? []).length > 0
}

/**
 * The level check card of the learner's home, or null: only in the learner's own space, never once a check is done, and for a learner who has not
 * practised yet (a check already started is always offered, to carry on). A read that fails answers null, so the home never waits on it.
 */
export async function getMyLevelCard(): Promise<{ started: number; of: number } | null> {
  try {
    const { child } = await myChild()
    if (!isOwnRecord(child)) return null
    const admin = createSupabaseAdmin()
    const check = await latestLevelCheck(admin, child.id)
    if (check?.status === 'done') return null
    const started = check?.answers.length ?? 0
    const of = check && check.questions.length > 0 ? check.questions.length : LEVEL_QUESTIONS
    if (started > 0) return { started, of }
    if (await hasPractised(admin, child.id)) return null
    if (!check && !(await levelTopicsFor(admin, child))) return null
    return { started: 0, of }
  } catch {
    return null
  }
}

/** The child of the learner's own space for a child a parent sees: the child itself when it is its own record, else its private twin, else null. */
export async function ownSpaceOf(admin: JemmaDb, childId: string): Promise<string | null> {
  const { data: child } = await admin.from('children').select('id, private_of, schools(kind)').eq('id', childId).maybeSingle()
  if (!child) return null
  const kind = (child.schools as { kind?: string } | null)?.kind
  if (child.private_of || kind === 'private') return child.id
  const { data: twin } = await admin.from('children').select('id').eq('private_of', childId).maybeSingle()
  return twin?.id ?? null
}

export type LevelCheckSummary =
  | { state: 'none' }
  | { state: 'started'; answered: number; of: number }
  | { state: 'done'; dateText: string; headline: string }

const dateText = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(iso)).replace(/,/g, '') : ''

/** The level check on the parent's page of a child (the child the parent sees: its own space is looked up). Null when there is nothing to show. */
export async function levelSummaryFor(childId: string, name: string): Promise<LevelCheckSummary | null> {
  try {
    const admin = createSupabaseAdmin()
    const own = await ownSpaceOf(admin, childId)
    if (!own) return { state: 'none' }
    const done = await latestDoneLevelCheck(admin, own)
    if (done) return { state: 'done', dateText: dateText(done.finishedAt), headline: levelHeadline(name, resultsOf(done)) }
    const open = await latestLevelCheck(admin, own)
    if (open && open.answers.length > 0) return { state: 'started', answered: open.answers.length, of: open.questions.length || LEVEL_QUESTIONS }
    if (await hasPractised(admin, own)) return null
    return { state: 'none' }
  } catch {
    return null
  }
}

export { dateText as levelDateText, firstToLearn }
