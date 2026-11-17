import { cookies } from 'next/headers'
import { HANDOVER_COOKIE, verifyHandover } from '../handover'
import { buildMyMaths, type MyMaths, type MyMathsSuggestion } from '@jemma/profiling/logic'
import { loadMyMathsInput, practiceStartedSince } from '@jemma/profiling/orchestrator'
import { isIndependent, isOwnRecord } from '@jemma/profiling/own-names'
import { QuestionSchema, StoredLessonSchema, type Lesson, type SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { stripQuestion, type QuestionForChild } from '@/app/k/session/[sessionId]/logic'
import { defaultOwnClass } from '@/lib/own-workspace'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { classIdsOfChild, loadShortLabels } from '@/lib/topics'
import { WORKSPACE_COOKIE, workspaceOf, type Workspace } from '@/lib/workspace'

export type GapGem = 'full' | 'half' | 'empty'

export type TonightCard = {
  sessionId: string
  topic: string
  minutes: number
  format: Lesson['format']
  /** First picture of the lesson, for the preview on the card. */
  preview: SeniorDiagramSpec | null
}

export type NextCard = { day: string; topic: string; minutes: number | null; format: Lesson['format'] | null }

/**
 * What the learner's home says about practising now when there is no session to start. `writing`: a practice was asked for and Jemma is
 * writing it. `failed`: it could not be written (a retry is offered). `ready`: the learner can practise now. `none`: nothing to practise yet.
 */
export type PracticeState = 'writing' | 'failed' | 'ready' | 'none'

export type LearnerToday = {
  firstName: string
  /** Which workspace the home shows: "My school" or "My own". */
  workspace: Workspace
  /** True for a child whose school does not use Jemma (P99): the record is its own workspace, so the home has no switch and says "Your own practice." */
  alone?: boolean
  tonight: TonightCard | null
  next: NextCard | null
  gems: GapGem[]
  fixed: number
  /** Gaps not fixed yet. */
  toGo: number
  practice: PracticeState
  /** The first thing "My maths" suggests, shown on the home when nothing is planned and the learner can practise. Null otherwise. */
  suggestion: MyMathsSuggestion | null
}

/**
 * The state of the practice card on the learner's home, from three facts and nothing else (so it is tested without a database).
 * `event` is the status of the newest `practice.requested` event of this learner, or null when there is none. `session` is true when there is
 * a session to start tonight. `canPractise` is true when "My maths" has something to suggest.
 * - A practice that is queued or running: `writing`, whatever else is true.
 * - A practice that failed while there is no session to start: `failed`.
 * - Otherwise `ready` when the learner can practise, else `none`.
 */
export function practiceState(input: { event: string | null; session: boolean; canPractise: boolean }): PracticeState {
  if (input.event === 'queued' || input.event === 'running') return 'writing'
  if (input.event === 'failed' && !input.session) return 'failed'
  return input.canPractise ? 'ready' : 'none'
}

/** True when a lesson (the `content` of a `lessons` row) has questions: a placeholder from planning has none. */
export const lessonHasQuestions = (content: unknown): boolean =>
  typeof content === 'object' && content !== null && Array.isArray((content as { questions?: unknown }).questions) && (content as { questions: unknown[] }).questions.length > 0

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const dayName = (iso: string) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!

const CHILD_COLUMNS = 'id, school_id, first_name, parent_first_name, parent_relation, grade, private_of, schools(name, kind)'

/**
 * The kind of a school ('school' or 'private'), read with the service client for one school id. A parent's hand-over reads a child under the parent's
 * own login, and row level security hides every school but the parent's own (a parent has none), so the kind cannot come with the child there. It reads
 * the kind of the school of a child the request has already been allowed to read, nothing else. A school that cannot be read counts as a school.
 */
async function schoolKindOf(schoolId: string | undefined): Promise<string> {
  if (!schoolId) return 'school'
  try {
    const { data } = await createSupabaseAdmin().from('schools').select('kind').eq('id', schoolId).maybeSingle()
    return data?.kind ?? 'school'
  } catch {
    return 'school'
  }
}

/**
 * The child row with the school it is in, always filled: the learner's own client reads their own school (kind and all); a twin is an own record by
 * `private_of` and needs no school; only a parent's hand-over of a child with a school has to read the kind apart (`schoolKindOf`).
 * After this, `isOwnRecord(child)` and `isIndependent(child)` give the right answer for every child the learner's screens work on.
 */
async function withSchool<T extends { school_id: string; private_of: string | null; schools: { name: string; kind: string } | null }>(row: T) {
  const seen = row.schools?.kind
  const kind = seen ?? (row.private_of ? 'private' : await schoolKindOf(row.school_id))
  return { ...row, schools: { name: row.schools?.name ?? '', kind } }
}

/** The workspace this device chose (the cookie `jemma_ws`). Outside a request there is no cookie: "My school". */
async function workspaceChosen(): Promise<Workspace> {
  try {
    return workspaceOf((await cookies()).get(WORKSPACE_COOKIE)?.value)
  } catch {
    return 'school'
  }
}

/**
 * The learner of this request and the person acting: the learner's own session (the child of this login that belongs to the school: a learner
 * with a private workspace has two children with the one login, and `private_of is null` is the school's), or a parent's device after hand-over
 * (the cookie names a child, and RLS lets this parent read them). `named` is the child found; it can be the private twin when the hand-over was
 * of one of the twin's own sessions.
 */
async function findLearner() {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()
  const { data: own } = await supabase.from('children').select(CHILD_COLUMNS).eq('user_id', auth.user.id).is('private_of', null).maybeSingle()
  if (own) return { supabase, userId: auth.user.id, named: await withSchool(own) }
  const handover = await verifyHandover((await cookies()).get(HANDOVER_COOKIE)?.value)
  if (!handover) notFound()
  const { data: named } = await supabase.from('children').select(CHILD_COLUMNS).eq('id', handover.childId).maybeSingle()
  if (!named) notFound()
  return { supabase, userId: auth.user.id, named: await withSchool(named) }
}

/**
 * The child a learner's screens work on, found the way they always were (the learner's own session, or a parent's device after hand-over) and then
 * by the workspace the device chose. "My school" (the default) is the child of the school. "My own" is the private twin of that child, found by
 * `private_of`; a learner who has no twin yet is still in "My school". A hand-over of one of the twin's own sessions names the twin, and the
 * signed cookie wins over the device's choice (it is the child of that one session). Every learner screen and action goes through here, so
 * home, "My maths", practice, sessions and paper answers work the same in both workspaces and never mix them.
 * Wrapped in React's `cache`: the layout, the page and the data loaders of one request ask who the learner is many times, and they all get the
 * first answer (three trips to the database once, not once for each ask). Nothing is kept from one request to the next.
 */
export const myChild = cache(async () => {
  const { supabase, named } = await findLearner()
  // A twin, or a child whose school does not use Jemma (P99): the record IS the learner's own workspace, whatever the cookie says. No school workspace
  // exists for such a child, so there is nothing to switch to and no twin to look for.
  if (isOwnRecord(named)) return { supabase, child: named }
  if ((await workspaceChosen()) === 'own') {
    const { data: twin } = await supabase.from('children').select(CHILD_COLUMNS).eq('private_of', named.id).maybeSingle()
    if (twin) return { supabase, child: await withSchool(twin) }
  }
  return { supabase, child: named }
})

/**
 * The school child and the person acting, whichever workspace is on screen: what the switch needs to open or add to the private workspace.
 * A hand-over that names the twin answers the school child it belongs to.
 */
export async function schoolChildOfRequest() {
  const { supabase, userId, named } = await findLearner()
  if (!named.private_of) return { supabase, userId, child: named }
  const { data: home } = await supabase.from('children').select(CHILD_COLUMNS).eq('id', named.private_of).maybeSingle()
  return { supabase, userId, child: home ?? named }
}

/**
 * The newest `practice.requested` event of this learner (by this learner's id only), or null. Read with the service client: a learner's
 * own session cannot read `events`. A read that fails answers null, so the home never waits on it.
 * An event that ended `failed` is told as `done` when the learner already started or finished the practice it asked for: a session for today or
 * earlier, of any status, whose lesson has questions and was written after the event (`practiceStartedSince`, the rule the agent's own check uses).
 * The agent's check of its work can run a moment after a quick learner has tapped Start, and that is not a practice that could not be written.
 * Every screen and the "Try again" action read the event here, so they all agree.
 */
export async function newestPracticeEvent(childId: string, now: Date = new Date()): Promise<{ id: string; status: string } | null> {
  try {
    const admin = createSupabaseAdmin()
    const { data } = await admin.from('events').select('id, status, created_at').eq('type', 'practice.requested').eq('payload->>childId', childId).order('created_at', { ascending: false }).limit(1)
    const newest = data?.[0]
    if (!newest) return null
    if (newest.status === 'failed' && newest.created_at && (await practiceStartedSince(admin, childId, now, newest.created_at))) return { id: newest.id, status: 'done' }
    return { id: newest.id, status: newest.status }
  } catch {
    return null
  }
}

/**
 * "My maths" for one learner, read with the service client by this learner's id only (a learner's own session cannot read marked answers).
 * With a `classId`, one class's map only (a private workspace shows one grade at a time).
 */
export async function myMathsOf(childId: string, now: Date = new Date(), classId?: string): Promise<MyMaths> {
  return buildMyMaths(await (classId ? loadMyMathsInput(createSupabaseAdmin(), childId, now, { classId }) : loadMyMathsInput(createSupabaseAdmin(), childId, now)))
}

type SessionRow = { id: string; status: string; planned_for: string; lesson_id: string | null; topic_name: string | null; format: Lesson['format'] | null; planned_minutes: number | null; created_at?: string | null }

/**
 * The learner's sessions that are planned or begun, in day order. Sessions of the same day go in the order they were made (P155: a practice the
 * learner chose is a new session next to tonight's lesson, planned for today as well, and it is the later one), so "the latest" is never a toss-up.
 */
export async function loadLearnerSessions(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, childId: string): Promise<SessionRow[]> {
  const { data } = await supabase
    .from('sessions')
    .select('id, status, planned_for, lesson_id, topic_name, format, planned_minutes, created_at')
    .eq('child_id', childId)
    .in('status', ['planned', 'in_progress'])
    .order('planned_for')
  return ((data ?? []) as SessionRow[]).sort((a, b) => a.planned_for.localeCompare(b.planned_for) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

/**
 * The session to start tonight: the latest planned session that is due (today or earlier) and has a lesson row. A session whose lesson is
 * still empty (a placeholder from planning) is not offered while a practice that was asked for is being written or has failed: the screen
 * says so instead. Any other session shows as it always did. The home, "My maths" and the server actions all use this one rule.
 */
export async function tonightFrom(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  sessions: SessionRow[],
  asked: { status: string } | null,
  today: string,
): Promise<TonightCard | null> {
  const open = sessions.filter((s) => s.planned_for <= today && s.lesson_id)
  const tonightRow = open[open.length - 1]
  if (!tonightRow) return null
  const { data: lessonRow } = await supabase.from('lessons').select('content').eq('id', tonightRow.lesson_id!).maybeSingle()
  const lesson = StoredLessonSchema.safeParse(lessonRow?.content)
  const waiting = !lessonHasQuestions(lessonRow?.content) && (asked?.status === 'queued' || asked?.status === 'running' || asked?.status === 'failed')
  if (waiting) return null
  return {
    sessionId: tonightRow.id,
    topic: tonightRow.topic_name ?? (lesson.success ? lesson.data.title : 'Tonight'),
    minutes: tonightRow.planned_minutes ?? (lesson.success ? lesson.data.minutes : 10),
    format: tonightRow.format ?? (lesson.success ? lesson.data.format : 'reading'),
    preview: lesson.success ? (lesson.data.diagram?.steps[0]?.diagram ?? lesson.data.cards?.find((c) => c.diagram)?.diagram ?? null) : null,
  }
}

export async function getLearnerToday(): Promise<LearnerToday> {
  const { supabase, child } = await myChild()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const [short, sessions, { data: gaps }, asked] = await Promise.all([
    // Short labels of the topics of this learner's own classes only (not every topic of every school).
    classIdsOfChild(supabase, child.id).then((classIds) => loadShortLabels(supabase, { classIds })),
    loadLearnerSessions(supabase, child.id),
    supabase.from('gaps').select('stage, created_at').eq('child_id', child.id).order('created_at'),
    newestPracticeEvent(child.id),
  ])

  const tonight = await tonightFrom(supabase, sessions, asked, today)
  const upcoming = sessions.find((s) => s.planned_for > today)
  const next: NextCard | null = upcoming
    ? { day: dayName(upcoming.planned_for), topic: short(upcoming.topic_name ?? ''), minutes: upcoming.planned_minutes, format: upcoming.format }
    : null

  const all = gaps ?? []
  const order = { fixed: 0, practising: 1, new: 2 } as const
  const gems = [...all]
    .sort((a, b) => order[a.stage] - order[b.stage])
    .map((g): GapGem => (g.stage === 'fixed' ? 'full' : g.stage === 'practising' ? 'half' : 'empty'))
  const fixed = all.filter((g) => g.stage === 'fixed').length
  // "My maths" is only read when it can change the answer: no session to start, and no practice that is being written or failed. The learner
  // can practise when it has something to suggest.
  const decided = asked?.status === 'queued' || asked?.status === 'running' || (asked?.status === 'failed' && !tonight)
  // In a private workspace the suggestion comes from one grade, the same one "My maths" shows first.
  const classId = tonight || decided || !isOwnRecord(child) ? undefined : ((await defaultOwnClass(child.id)) ?? undefined)
  const suggestion = tonight || decided ? null : ((await myMathsOf(child.id, now, classId)).suggestions[0] ?? null)
  const practice = practiceState({ event: asked?.status ?? null, session: tonight !== null, canPractise: suggestion !== null })
  return { firstName: child.first_name, workspace: isOwnRecord(child) ? 'own' : 'school', alone: isIndependent(child), tonight, next, gems, fixed, toGo: all.length - fixed, practice, suggestion }
}

export type SessionPage = {
  firstName: string
  sessionId: string
  status: 'planned' | 'in_progress' | 'done'
  topic: string
  warmup: QuestionForChild[]
  tryCount: number
}

/** What the session page needs before the lesson loads: the warm-up (no answers) and the plan. */
export async function getSessionPage(sessionId: string): Promise<SessionPage> {
  const { supabase, child } = await myChild()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, status, warmup, topic_name, question_count, lesson_id')
    .eq('id', sessionId)
    .eq('child_id', child.id)
    .maybeSingle()
  if (!session) notFound()
  const parsed = QuestionSchema.array().safeParse(session.warmup)
  const warmup = parsed.success ? parsed.data : []
  return {
    firstName: child.first_name,
    sessionId: session.id,
    status: session.status,
    topic: session.topic_name ?? '',
    warmup: warmup.map((q, i) => stripQuestion(q, { position: i + 1, phase: 'warmup', index: i + 1, of: warmup.length })),
    tryCount: session.question_count ?? 5,
  }
}

/** `alone`: a learner on their own (no school, no grown-up on the record, P111): the screen does not ask them to pass the phone back. */
export type Handback = { firstName: string; minutes: number | null; relation: string; parentName: string; alone: boolean }

export async function getHandback(): Promise<Handback> {
  const { supabase, child } = await myChild()
  const { data: done } = await supabase
    .from('sessions')
    .select('minutes')
    .eq('child_id', child.id)
    .eq('status', 'done')
    .order('finished_at', { ascending: false })
    .limit(1)
  const rel = child.parent_relation?.trim()
  const parentName = child.parent_first_name?.trim() || 'your grown-up'
  return {
    firstName: child.first_name,
    minutes: done?.[0]?.minutes ?? null,
    relation: !rel ? "your grown-up" : /^(mum|mom|mother|dad|father|gran|granny|grandma|grandpa|auntie|uncle)$/i.test(rel) ? `your ${rel.toLowerCase()}` : rel,
    parentName,
    alone: isIndependent(child) && !child.parent_first_name?.trim(),
  }
}
