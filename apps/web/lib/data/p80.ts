import type { MyMaths } from '@jemma/profiling/logic'
import { isOwnRecord } from '@jemma/profiling/own-names'
import { defaultOwnClass } from '@/lib/own-workspace'
import { loadLearnerSessions, myChild, myMathsOf, newestPracticeEvent, tonightFrom } from './p27'

/**
 * Whether the learner may be offered a practice now, for the two "My maths" screens. `due`: a session is due tonight (the same rule as the
 * home: one thing at a time). `writing`: a practice that was asked for is being written. `free`: nothing is in the way.
 * A session due wins over a practice being written.
 */
export type MyMathsStatus = 'free' | 'due' | 'writing'

/** The status from two facts and nothing else (so it is tested without a database). `event` is the status of the newest practice event, or null. */
export function mathsStatus(input: { event: string | null; due: boolean }): MyMathsStatus {
  if (input.due) return 'due'
  return input.event === 'queued' || input.event === 'running' ? 'writing' : 'free'
}

export type MyMathsView = { firstName: string; initial: string; maths: MyMaths; status: MyMathsStatus }

/**
 * What the learner sees on "My maths": their own count in each part of Mathematics, from the answers of THIS learner only (read with the
 * service client by this learner's id: a learner's own session cannot read marked answers), and what may be offered now.
 * The learner is found the way the home finds them: their own session, or a parent's device after hand-over.
 * With a `classId` it is that one class's map only: in "My own" a learner has a class for each grade and sees one grade at a time. In "My own"
 * with no `classId` the grade shown is the learner's own grade, else the lowest they have. "My school" is as it always was.
 */
export async function getMyMaths(classId?: string): Promise<MyMathsView> {
  const { supabase, child } = await myChild()
  const now = new Date()
  const shown = classId ?? (isOwnRecord(child) ? ((await defaultOwnClass(child.id)) ?? undefined) : undefined)
  const [sessions, asked, maths] = await Promise.all([loadLearnerSessions(supabase, child.id), newestPracticeEvent(child.id), myMathsOf(child.id, now, shown)])
  const tonight = await tonightFrom(supabase, sessions, asked, now.toISOString().slice(0, 10))
  return {
    firstName: child.first_name,
    initial: child.first_name.slice(0, 1).toUpperCase(),
    maths,
    status: mathsStatus({ event: asked?.status ?? null, due: tonight !== null }),
  }
}
