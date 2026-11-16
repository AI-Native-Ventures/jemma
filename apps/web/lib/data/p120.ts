import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { QuestionSchema } from '@jemma/profiling/schemas'
import { reviewOf, type MissedQuestion, type StoredItem } from '@/app/k/session/[sessionId]/logic'
import { demoCookie } from '@/lib/demo'
import { demoParentKey, handbackTarget, practiceResultsHref, type HandbackTarget } from '@/lib/handback'
import { HANDOVER_COOKIE, verifyHandover } from '@/lib/handover'
import { DEFAULT_QUESTION_COUNT, practiceRows, scoreLine, dayStamp, type PracticeRow } from '@/lib/past-practice'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { hillviewPeople } from '../../../../supabase/seed/fixtures/hillview'
import { myChild } from './p27'

/**
 * P120: where the hand-back screen goes, and the learner's past practices ("Your practice" on My maths and the results of one practice opened again).
 * Every read is of the learner this request works on (`myChild`), found the way every learner screen finds them, so a learner can only ever open their own.
 */

type Learner = Awaited<ReturnType<typeof myChild>>['child']

/** The newest finished practice of the child (its id), or null when there is none. */
async function newestDoneSessionId(supabase: Awaited<ReturnType<typeof myChild>>['supabase'], childId: string): Promise<string | null> {
  const { data } = await supabase.from('sessions').select('id').eq('child_id', childId).eq('status', 'done').order('finished_at', { ascending: false }).limit(1)
  return data?.[0]?.id ?? null
}

/**
 * The key of the made-up grown-up of this learner when the learner is in the visitor's own demo copy (the demo cookie names a sandbox and the learner's
 * school is that sandbox's school), else null. A learner of a real school, or with no made-up grown-up, is null. A twin (a learner's private workspace)
 * is found through the school child it belongs to.
 */
export async function demoParentOf(child: Learner): Promise<string | null> {
  const sandboxId = await demoCookie()
  if (!sandboxId) return null
  const admin = createSupabaseAdmin()
  const { data: box } = await admin.from('demo_sandboxes').select('school_id, kind').eq('id', sandboxId).maybeSingle()
  if (!box || box.kind === 'empty') return null
  const home = child.private_of ? (await admin.from('children').select('school_id, first_name').eq('id', child.private_of).maybeSingle()).data : child
  if (!home || home.school_id !== box.school_id) return null
  return demoParentKey(home.first_name, hillviewPeople(new Date().getUTCFullYear()).parents)
}

export type HandbackNext = {
  target: HandbackTarget
  /** The page of the practice just finished, so the learner can read their answers again. Null when there is no finished practice. */
  seeAnswersHref: string | null
}

/**
 * What the hand-back screen offers after "All done": the target of "Press and hold" and the way to read the answers again. A grown-up who handed the
 * phone over is signed in as a parent (the layout's own test: a parent and a valid hand-over cookie); a made-up learner of a demo copy has the demo's
 * grown-up; everyone else is on their own and goes home.
 */
export async function getHandbackNext(): Promise<HandbackNext> {
  const { supabase, child } = await myChild()
  const [sessionId, { data: auth }] = await Promise.all([newestDoneSessionId(supabase, child.id), supabase.auth.getUser()])
  const handover = await verifyHandover((await cookies()).get(HANDOVER_COOKIE)?.value)
  let parentHere = false
  if (handover && auth.user) {
    const { data: me } = await supabase.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle()
    parentHere = me?.role === 'parent'
  }
  const demoParent = parentHere ? null : await demoParentOf(child)
  return {
    target: handbackTarget({ parentHere, demoParent, childId: child.id, sessionId }),
    seeAnswersHref: sessionId ? practiceResultsHref(sessionId, 'done') : null,
  }
}

/** The newest finished practice (id) of the learner of this request, for the server action that opens the demo's grown-up. */
export async function demoHandbackFacts(): Promise<{ childId: string; sessionId: string | null; demoParent: string | null }> {
  const { supabase, child } = await myChild()
  return { childId: child.id, sessionId: await newestDoneSessionId(supabase, child.id), demoParent: await demoParentOf(child) }
}

/** The finished practices of the learner (the workspace on screen), newest first, as "Your practice" lists them. A read that fails lists none: the page is still there. */
export async function getPastPractice(): Promise<PracticeRow[]> {
  try {
    const { supabase, child } = await myChild()
    const { data } = await supabase
      .from('sessions')
      .select('id, topic_name, finished_at, planned_for, right, question_count')
      .eq('child_id', child.id)
      .eq('status', 'done')
      .order('finished_at', { ascending: false })
      .limit(30)
    return practiceRows(data ?? [])
  } catch {
    return []
  }
}

export type PastResult = {
  firstName: string
  topic: string
  day: string
  /** "4 of 5 right", or '' when nothing was saved to count. */
  score: string
  /** Every question that was missed, as the screen after the practice shows them. */
  missed: MissedQuestion[]
  /** False when no answers were saved for this practice: the screen says so instead of "nothing to go over". */
  hasAnswers: boolean
}

/**
 * One finished practice of this learner to read again. The session is read as the learner (row level security and `child_id`: the same rules the session
 * page uses), so a session of anyone else is not found; only then are its answers read with the service client. A practice that is not finished is not
 * found either: its right answers are not for the screen until it is over.
 */
export async function getPastResult(sessionId: string): Promise<PastResult> {
  const { supabase, child } = await myChild()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, status, topic_name, finished_at, planned_for, right, question_count')
    .eq('id', sessionId)
    .eq('child_id', child.id)
    .eq('status', 'done')
    .maybeSingle()
  if (!session) notFound()
  const { data: rows, error } = await createSupabaseAdmin().from('session_items').select('*').eq('session_id', session.id)
  if (error) throw new Error(error.message)
  const items: StoredItem[] = []
  for (const row of rows ?? []) {
    const q = QuestionSchema.safeParse(row.question)
    if (!q.success) continue
    // A paper answer that could not be read carries `unread: true` inside the stored question (the schema does not keep it).
    const unread = typeof row.question === 'object' && row.question !== null && (row.question as { unread?: unknown }).unread === true
    items.push({ phase: row.phase, position: row.position, question: q.data, answer: row.answer, correct: row.correct, difficulty: row.difficulty, seconds: row.seconds, ...(unread ? { unread } : {}) })
  }
  const tries = items.filter((i) => i.phase === 'try')
  const total = tries.length > 0 ? tries.length : (session.question_count ?? DEFAULT_QUESTION_COUNT)
  const right = session.right ?? (tries.length > 0 ? tries.filter((i) => i.correct).length : null)
  return {
    firstName: child.first_name,
    topic: session.topic_name?.trim() || 'Practice',
    day: dayStamp(session.finished_at ?? `${session.planned_for}T12:00:00Z`),
    score: scoreLine(right, total),
    missed: reviewOf(items), // P126: every try question, a right one confirmed and explained
    hasAnswers: tries.length > 0,
  }
}
