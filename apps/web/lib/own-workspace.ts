import * as own from '@jemma/profiling/own'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

// A learner's own private workspace ("My own") for the web app. The work is in `packages/profiling/src/own-workspace.ts` (the demo seed and the
// tests use it too); these are the same functions with the service client filled in, as the screens and the actions call them. The service client
// bypasses row level security, so every function here checks who is asking: the learner's own login or an approved parent for the writes, the
// class's own teacher for the teacher's read-only view. The cookie that says which workspace is on screen is in `./workspace`.

export { OwnWorkspaceError, OWN_GRADES } from '@jemma/profiling/own'
export type { AddedGrade, OwnClass, OwnGrade, OwnGap, OwnPractised, OwnSummary } from '@jemma/profiling/own'

/**
 * The learner's private workspace: the twin of the school child, made on the first call (a personal school named "{first name}'s own" and the twin,
 * nothing else) and the same twin on every later call. Only the learner's own login or an approved parent of the learner may ask. Answers the twin's id.
 */
export async function ensureOwnWorkspace(childId: string, actorUserId: string): Promise<string> {
  return own.ensureOwnWorkspace(createSupabaseAdmin(), childId, actorUserId)
}

/**
 * Adds a grade (1 to 12) to the private workspace `twinId`: a private Mathematics class, owned by the person acting, with the learner enrolled and,
 * for a school in South Africa, the approved CAPS map of that grade with its topics. A grade that is already there adds nothing.
 * A grade outside 1 to 12 throws `OwnWorkspaceError`.
 */
export async function addOwnGrade(twinId: string, grade: number, actorUserId: string): Promise<own.AddedGrade> {
  return own.addOwnGrade(createSupabaseAdmin(), twinId, grade, actorUserId)
}

/** The twin of a school child, or null when the learner has not opened "My own". */
export async function twinOfChild(childId: string): Promise<{ id: string } | null> {
  return own.twinOfChild(createSupabaseAdmin(), childId)
}

/**
 * The grades the private workspace has, lowest first: the class id, the grade, the name of the class, the topics on its map and the learner's own
 * count in it (right and asked, from the same rule as "My maths"). For the grade picker.
 */
export async function getOwnOverview(twinId: string): Promise<own.OwnGrade[]> {
  return own.getOwnOverview(createSupabaseAdmin(), twinId)
}

/** The classes of the private workspace (one for each grade), lowest first. A cheap read: no counts. */
export async function listOwnClasses(twinId: string): Promise<own.OwnClass[]> {
  return own.listOwnClasses(createSupabaseAdmin(), twinId)
}

/** The class "My maths" shows first in a private workspace: the one of the learner's own grade, else the lowest. Null when it has no grade yet. */
export async function defaultOwnClass(twinId: string): Promise<string | null> {
  return own.defaultOwnClass(createSupabaseAdmin(), twinId)
}

/**
 * The teacher's read-only view of a learner's own workspace: the grades, in each the topics practised with the learner's own counts, the open and
 * the fixed private gaps and the last 10 finished sessions. Only for the signed-in teacher of `classId`, and only for a learner enrolled in it (the
 * school child). Reads by the twin's id with the service client and never writes. Null when the caller does not teach the class, the learner is not
 * in it, or the learner has not opened "My own".
 */
export async function getOwnWorkspaceForTeacher(classId: string, childId: string): Promise<own.OwnSummary | null> {
  const { data: auth } = await (await createSupabaseServer()).auth.getUser()
  if (!auth.user) return null
  return own.getOwnWorkspaceForTeacher(createSupabaseAdmin(), { teacherId: auth.user.id, classId, childId })
}
