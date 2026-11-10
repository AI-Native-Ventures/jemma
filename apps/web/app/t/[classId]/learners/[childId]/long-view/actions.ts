'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { requireRole } from '@/lib/auth'
import { decidePattern, requestIfEmpty, requestLongView, type Decision } from '@/lib/long-view'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { ok: false; reason: string }

const SCREEN = '/t/[classId]/learners/[childId]/long-view'

/** Teacher only. The decision itself (and every check) lives in `decidePattern`. */
async function decide(decision: Decision, patternId: string): Promise<ActionResult> {
  const { userId } = await requireRole('teacher')
  const teacher = (await createSupabaseServer()) as unknown as JemmaDb
  const r = await decidePattern({ teacher, admin: createSupabaseAdmin(), userId }, decision, patternId)
  if (!r.ok) return r
  revalidatePath(SCREEN, 'page')
  revalidatePath('/t/[classId]', 'page')
  return { ok: true }
}

/** "Looks right": a draft becomes approved. Nothing is shared. */
export async function approvePattern(patternId: string): Promise<ActionResult> {
  return decide('approve', patternId)
}

/** "Not yet": a draft or an approved pattern is set aside. A shared pattern cannot be. */
export async function dismissPattern(patternId: string): Promise<ActionResult> {
  return decide('dismiss', patternId)
}

/** "Bring back": a set aside pattern goes back to a draft. */
export async function restorePattern(patternId: string): Promise<ActionResult> {
  return decide('restore', patternId)
}

/** "We have talked": the pattern is shared with the approved parents and they are told. */
export async function markDiscussed(patternId: string): Promise<ActionResult> {
  return decide('discuss', patternId)
}

/** "Update the Long view": asks the agent to look at the learner's records again. */
export async function updateLongView(childId: string): Promise<ActionResult> {
  await requireRole('teacher')
  const teacher = (await createSupabaseServer()) as unknown as JemmaDb
  const teaches = await teacher.rpc('teaches_child', { child: childId })
  if (teaches.error || teaches.data !== true) return { ok: false, reason: 'Only the class teacher can do this.' }
  const r = await requestLongView([childId])
  if (r.failed.length > 0) return { ok: false, reason: 'Jemma could not be reached. Try again in a minute.' }
  revalidatePath(SCREEN, 'page')
  return { ok: true }
}

/** Called once when the screen opens for a learner with no pattern yet. The checks are made again here, on the server. */
export async function updateOnOpen(childId: string): Promise<ActionResult> {
  await requireRole('teacher')
  const teacher = (await createSupabaseServer()) as unknown as JemmaDb
  const r = await requestIfEmpty({ teacher, admin: createSupabaseAdmin() }, childId)
  if (r === 'refused') return { ok: false, reason: 'Only the class teacher can do this.' }
  if (r === 'sent') revalidatePath(SCREEN, 'page')
  return { ok: true }
}
