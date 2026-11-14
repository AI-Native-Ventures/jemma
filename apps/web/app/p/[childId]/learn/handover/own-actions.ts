'use server'

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { HANDOVER_COOKIE, HANDOVER_TTL_SECONDS, OWN_HANDOVER, signHandover } from '@/lib/handover'
import { addOwnGrade, ensureOwnWorkspace, listOwnClasses, OWN_GRADES, OwnWorkspaceError } from '@/lib/own-workspace'
import { createSupabaseServer } from '@/lib/supabase/server'
import { WORKSPACE_COOKIE, workspaceCookieOptions } from '@/lib/workspace'

const isGrade = (grade: unknown): grade is number => typeof grade === 'number' && Number.isInteger(grade) && grade >= OWN_GRADES.from && grade <= OWN_GRADES.to

/**
 * "Practise at home with {name}": the parent hands the phone over with no session to start. The learner's private workspace ("My own") is opened
 * for the learner if it is not (the parent acts for the learner: the same rule as the learner's own switch) and gets the learner's grade if it has
 * no grade yet, then the two cookies are set (the hand-over of the learner's own practice, which opens the learner's own screens, and the
 * workspace "own") and the child lands on the home of My own. The hand-over names the school child, never the twin: a parent never sees the twin as
 * a second child. Only an approved parent can read the child through the parent's own client; for anyone else this is a page that is not found.
 * Nothing here touches the school child's record.
 */
export async function startOwnPractice(childId: string): Promise<never> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()
  const { data: child } = await supabase.from('children').select('id, grade, private_of').eq('id', childId).maybeSingle()
  if (!child || child.private_of) notFound()

  try {
    const twinId = await ensureOwnWorkspace(child.id, auth.user.id)
    if ((await listOwnClasses(twinId)).length === 0 && isGrade(child.grade)) await addOwnGrade(twinId, child.grade, auth.user.id)
  } catch (e) {
    if (e instanceof OwnWorkspaceError) notFound()
    throw e
  }

  const store = await cookies()
  store.set(HANDOVER_COOKIE, await signHandover(OWN_HANDOVER, child.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: HANDOVER_TTL_SECONDS,
  })
  store.set(WORKSPACE_COOKIE, 'own', workspaceCookieOptions())
  redirect('/k')
}
