'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { schoolChildOfRequest } from '@/lib/data/p27'
import { addOwnGrade, ensureOwnWorkspace, listOwnClasses, OWN_GRADES, OwnWorkspaceError } from '@/lib/own-workspace'
import { WORKSPACE_COOKIE, workspaceCookieOptions } from '@/lib/workspace'
import type { ActionResult } from './actions'

/** What the learner's own workspace screens say when something goes wrong. Never a stack, never a code. */
const NOT_OPENED = 'Could not open My own. Try again.'
const NOT_ADDED = 'Could not add that grade. Try again.'
const BAD_GRADE = `Pick a grade from ${OWN_GRADES.from} to ${OWN_GRADES.to}.`

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isGrade = (grade: unknown): grade is number => typeof grade === 'number' && Number.isInteger(grade) && grade >= OWN_GRADES.from && grade <= OWN_GRADES.to

/**
 * The switch at the top of the learner's home: "My school" or "My own". Writes the cookie `jemma_ws`, which `myChild` reads, so every learner
 * screen and action then works on that workspace. "My own" opens the private workspace if the learner has none (`ensureOwnWorkspace`) and, when it
 * has no grade yet, adds the grade of the school child (`addOwnGrade`; a grade with no CAPS map, such as Grade R, opens it empty, and the learner
 * adds a grade). The cookie is only set once the workspace is open. A learner (or the parent of a hand-over) is found the way the learner's
 * screens find them. Never throws to the screen.
 */
export async function setWorkspace(ws: 'school' | 'own'): Promise<ActionResult> {
  if (ws !== 'school' && ws !== 'own') return { ok: false, message: 'Pick My school or My own.' }
  try {
    if (ws === 'own') {
      const { userId, child } = await schoolChildOfRequest()
      const twinId = await ensureOwnWorkspace(child.id, userId)
      if ((await listOwnClasses(twinId)).length === 0 && isGrade(child.grade)) await addOwnGrade(twinId, child.grade, userId)
    }
    ;(await cookies()).set(WORKSPACE_COOKIE, ws, workspaceCookieOptions())
    revalidatePath('/k', 'layout')
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
