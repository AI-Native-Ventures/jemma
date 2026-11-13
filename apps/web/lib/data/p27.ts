import { cookies } from 'next/headers'
import { HANDOVER_COOKIE, verifyHandover } from '../handover'
import { LessonSchema, QuestionSchema, type Lesson, type DiagramSpec } from '@jemma/profiling/schemas'
import { notFound } from 'next/navigation'
import { stripQuestion, type QuestionForChild } from '@/app/k/session/[sessionId]/logic'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { loadShortLabels } from '@/lib/topics'

export type GapGem = 'full' | 'half' | 'empty'

export type TonightCard = {
  sessionId: string
  topic: string
  minutes: number
  format: Lesson['format']
  /** First picture of the lesson, for the preview on the card. */
  preview: DiagramSpec | null
}

export type NextCard = { day: string; topic: string; minutes: number | null; format: Lesson['format'] | null }

/**
 * What the learner's home says about practising now when there is no session to start. `writing`: a practice was asked for and Jemma is
 * writing it. `failed`: it could not be written (a retry is offered). `ready`: the learner can practise now. `none`: nothing to practise yet.
 */
export type PracticeState = 'writing' | 'failed' | 'ready' | 'none'

export type LearnerToday = {
  firstName: string
  tonight: TonightCard | null
  next: NextCard | null
  gems: GapGem[]
  fixed: number
  /** Gaps not fixed yet. */
  toGo: number
  practice: PracticeState
}

/**
 * The state of "Practise now", from three facts and nothing else (so it is tested without a database).
 * `event` is the status of the newest `practice.requested` event of this learner, or null when there is none. `session` is true when there is
 * a session to start tonight. `canPractise` is the cheap check (see `learnerCanPractise`).
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

export async function myChild() {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()
  const { data: own } = await supabase
    .from('children')
    .select('id, first_name, parent_first_name, parent_relation')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (own) return { supabase, child: own }
  // A parent's device after hand-over: the cookie names the child, and RLS lets this parent read them.
  const handover = await verifyHandover((await cookies()).get(HANDOVER_COOKIE)?.value)
  if (!handover) notFound()
  const { data: child } = await supabase
    .from('children')
    .select('id, first_name, parent_first_name, parent_relation')
    .eq('id', handover.childId)
    .maybeSingle()
  if (!child) notFound()
  return { supabase, child }
}

/**
 * The newest `practice.requested` event of this learner (by this learner's id only), or null. Read with the service client: a learner's
 * own session cannot read `events`. A read that fails answers null, so the home never waits on it.
 */
export async function newestPracticeEvent(childId: string): Promise<{ id: string; status: string } | null> {
  try {
    const { data } = await createSupabaseAdmin().from('events').select('id, status').eq('type', 'practice.requested').eq('payload->>childId', childId).order('created_at', { ascending: false }).limit(1)
    return data?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * The cheap check for "Practise now": a gap (open or fixed), or one past record with marks, or an approved map of a class the learner is in.
 * It is not the whole pick (`pickPractice` decides what to practise). Read with the service client, by this learner's id only.
 */
async function learnerCanPractise(childId: string, gapCount: number): Promise<boolean> {
  if (gapCount > 0) return true
  try {
    const admin = createSupabaseAdmin()
    const marked = await admin
      .from('learner_records')
      .select('id')
      .eq('child_id', childId)
      .in('source', ['quiz', 'assignment', 'project'])
      .eq('quality', 'clear')
      .not('family', 'is', null)
      .not('marks', 'is', null)
      .limit(1)
    if (marked.data?.length) return true
    const enrolled = await admin.from('enrolments').select('class_id').eq('child_id', childId)
    const classIds = (enrolled.data ?? []).map((e) => e.class_id)
    if (classIds.length === 0) return false
    const maps = await admin.from('curriculum_maps').select('id').eq('status', 'approved').in('class_id', classIds).limit(1)
    return (maps.data?.length ?? 0) > 0
  } catch {
    return false
  }
}

export async function getLearnerToday(): Promise<LearnerToday> {
  const { supabase, child } = await myChild()
  const short = await loadShortLabels(supabase)
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: sessions }, { data: gaps }, asked] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, status, planned_for, lesson_id, topic_name, format, planned_minutes')
      .eq('child_id', child.id)
      .in('status', ['planned', 'in_progress'])
      .order('planned_for'),
    supabase.from('gaps').select('stage, created_at').eq('child_id', child.id).order('created_at'),
    newestPracticeEvent(child.id),
  ])

  const open = (sessions ?? []).filter((s) => s.planned_for <= today && s.lesson_id)
  const tonightRow = open[open.length - 1]
  let tonight: TonightCard | null = null
  if (tonightRow) {
    const { data: lessonRow } = await supabase.from('lessons').select('content').eq('id', tonightRow.lesson_id!).maybeSingle()
    const lesson = LessonSchema.safeParse(lessonRow?.content)
    // A session whose lesson is still empty (a placeholder from planning) is not offered while a practice that was asked for is being
    // written or has failed: the screen says so instead. Any other session shows as it always did.
    const waiting = !lessonHasQuestions(lessonRow?.content) && (asked?.status === 'queued' || asked?.status === 'running' || asked?.status === 'failed')
    if (!waiting) {
      tonight = {
        sessionId: tonightRow.id,
        topic: tonightRow.topic_name ?? (lesson.success ? lesson.data.title : 'Tonight'),
        minutes: tonightRow.planned_minutes ?? (lesson.success ? lesson.data.minutes : 10),
        format: tonightRow.format ?? (lesson.success ? lesson.data.format : 'reading'),
        preview: lesson.success ? (lesson.data.diagram?.steps[0]?.diagram ?? lesson.data.cards?.find((c) => c.diagram)?.diagram ?? null) : null,
      }
    }
  }
  const upcoming = (sessions ?? []).find((s) => s.planned_for > today)
  const next: NextCard | null = upcoming
    ? { day: dayName(upcoming.planned_for), topic: short(upcoming.topic_name ?? ''), minutes: upcoming.planned_minutes, format: upcoming.format }
    : null

  const all = gaps ?? []
  const order = { fixed: 0, practising: 1, new: 2 } as const
  const gems = [...all]
    .sort((a, b) => order[a.stage] - order[b.stage])
    .map((g): GapGem => (g.stage === 'fixed' ? 'full' : g.stage === 'practising' ? 'half' : 'empty'))
  const fixed = all.filter((g) => g.stage === 'fixed').length
  // The cheap check is only asked when it can change the answer: no session to start, and no practice that is being written or failed.
  const decided = asked?.status === 'queued' || asked?.status === 'running' || (asked?.status === 'failed' && !tonight)
  const practice = practiceState({ event: asked?.status ?? null, session: tonight !== null, canPractise: tonight || decided ? false : await learnerCanPractise(child.id, all.length) })
  return { firstName: child.first_name, tonight, next, gems, fixed, toGo: all.length - fixed, practice }
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

export type Handback = { firstName: string; minutes: number | null; relation: string; parentName: string }

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
  }
}
