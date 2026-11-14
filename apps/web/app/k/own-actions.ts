'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { schoolChildOfRequest } from '@/lib/data/p27'
import { HANDOVER_COOKIE } from '@/lib/handover'
import { OWN_MARKER_COOKIE, ownMarkerFits, signOwnMarker, subOfToken } from '@/lib/own-marker'
import { addOwnGrade, ensureOwnWorkspace, listOwnClasses, OWN_GRADES, OwnWorkspaceError } from '@/lib/own-workspace'
import { createSupabaseServer } from '@/lib/supabase/server'
import { WORKSPACE_COOKIE, workspaceCookieOptions } from '@/lib/workspace'
import type { ActionResult } from './actions'

/** What the learner's own workspace screens say when something goes wrong. Never a stack, never a code. */
const NOT_OPENED = 'Could not open My own. Try again.'
const NOT_ADDED = 'Could not add that grade. Try again.'
const BAD_GRADE = `Pick a grade from ${OWN_GRADES.from} to ${OWN_GRADES.to}.`

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isGrade = (grade: unknown): grade is number => typeof grade === 'number' && Number.isInteger(grade) && grade >= OWN_GRADES.from && grade <= OWN_GRADES.to

/**
 * True when this login has opened My own before, so the first-time work can be skipped: the request brings the marker this server signed for the
 * login (`OWN_MARKER_COOKIE`, bound to the user id in the session's token, read from the cookie with no network) and no hand-over cookie (a
 * grown-up's phone always takes the long way: the learner is the child of that hand-over, not the login). It asks the database nothing. The marker
 * is a hint and never a permission: `myChild` looks the private workspace up itself, under row level security, whatever any cookie says.
 */
async function openedBefore(store: Awaited<ReturnType<typeof cookies>>): Promise<boolean> {
  if (store.get(HANDOVER_COOKIE)) return false
  const marker = store.get(OWN_MARKER_COOKIE)?.value
  if (!marker) return false
  const { data } = await (await createSupabaseServer()).auth.getSession()
  const userId = subOfToken(data.session?.access_token)
  return userId !== null && (await ownMarkerFits(marker, userId))
}

/**
 * The switch at the top of the learner's home: "My school" or "My own". Writes the cookie `jemma_ws`, which `myChild` reads, so every learner
 * screen and action then works on that workspace. Setting a cookie in a server action already makes Next draw the page again in the same answer,
 * so nothing else is revalidated and the screen does not refresh itself: one draw for each switch.
 * "My school" only sets the cookie. "My own" sets the cookie too when this login has opened it before (`openedBefore`); the first time it opens the
 * private workspace (`ensureOwnWorkspace`), adds the grade of the school child when it has no grade yet (`addOwnGrade`; a grade with no CAPS map,
 * such as Grade R, opens it empty, and the learner adds a grade) and leaves the marker for the next time. The cookies are only set once the
 * workspace is open. A learner (or the parent of a hand-over) is found the way the learner's screens find them. Never throws to the screen.
 */
export async function setWorkspace(ws: 'school' | 'own'): Promise<ActionResult> {
  if (ws !== 'school' && ws !== 'own') return { ok: false, message: 'Pick My school or My own.' }
  try {
    const store = await cookies()
    if (ws === 'own' && !(await openedBefore(store))) {
      const { userId, child } = await schoolChildOfRequest()
      const twinId = await ensureOwnWorkspace(child.id, userId)
      if ((await listOwnClasses(twinId)).length === 0 && isGrade(child.grade)) await addOwnGrade(twinId, child.grade, userId)
      if (!store.get(HANDOVER_COOKIE)) store.set(OWN_MARKER_COOKIE, await signOwnMarker(userId), workspaceCookieOptions())
    }
    store.set(WORKSPACE_COOKIE, ws, workspaceCookieOptions())
    return { ok: true }
  } catch (e) {
    console.error(`workspace not set: ${reasonOf(e)}`)
    return { ok: false, message: e instanceof OwnWorkspaceError ? e.message : NOT_OPENED }
  }
}

export type AddGradeResult = { ok: true; classId: string; /** False when the grade was already there. */ created: boolean; /** Topics on the map of the grade, 0 when it has none. */ topics: number } | { ok: false; message: string }

/**
 * Adds a grade (1 to 12) to the learner's own workspace, opening it first if needed (it does not change which workspace is on screen). The learner
 * can practise any grade: the grades ahead of their own too. In a school in South Africa the grade comes with its CAPS map. Adding a grade that is
 * already there adds nothing. A grade outside 1 to 12 is refused. Never throws to the screen.
 */
export async function addMyGrade(grade: number): Promise<AddGradeResult> {
  if (!isGrade(grade)) return { ok: false, message: BAD_GRADE }
  try {
    const { userId, child } = await schoolChildOfRequest()
    const twinId = await ensureOwnWorkspace(child.id, userId)
    const added = await addOwnGrade(twinId, grade, userId)
    revalidatePath('/k', 'layout')
    return { ok: true, classId: added.classId, created: added.created, topics: added.topics }
  } catch (e) {
    console.error(`grade not added: ${reasonOf(e)}`)
    return { ok: false, message: e instanceof OwnWorkspaceError ? e.message : NOT_ADDED }
  }
}
