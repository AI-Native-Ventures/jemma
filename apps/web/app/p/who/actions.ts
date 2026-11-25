'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { checkChildPin } from '@/lib/family-device'
import { HANDOVER_COOKIE, HANDOVER_TTL_SECONDS, OWN_HANDOVER, signHandover } from '@/lib/handover'
import { addOwnGrade, ensureOwnWorkspace, listOwnClasses, OWN_GRADES } from '@/lib/own-workspace'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { WORKSPACE_COOKIE, workspaceCookieOptions } from '@/lib/workspace'

export type PinResult = { ok: false; message: string }

/**
 * "Who's learning?": a child picked their face and typed their PIN. The PIN is checked (a child with no PIN yet goes straight in, as with "Practise
 * at home"), then the phone is handed over to the child's own practice and the child lands on My maths. Only the child of an approved parent.
 */
export async function enterAsChild(childId: string, pin: string): Promise<PinResult> {
  const { userId } = await requireRole('parent')
  const admin = createSupabaseAdmin()
  const { data: link } = await admin.from('parent_links').select('id').eq('parent_id', userId).eq('child_id', childId).eq('status', 'approved').maybeSingle()
  if (!link) return { ok: false, message: 'Ask your grown-up for help.' }
  const checked = await checkChildPin(admin, childId, pin)
  if (!checked.ok && checked.reason === 'locked') return { ok: false, message: 'Too many tries. Wait 15 minutes, or ask your grown-up.' }
  if (!checked.ok && checked.reason === 'wrong') return { ok: false, message: 'That PIN is not right. Try again.' }
  const { data: child } = await admin.from('children').select('id, grade').eq('id', childId).single()
  const twinId = await ensureOwnWorkspace(childId, userId)
  const grade = child?.grade
  if ((await listOwnClasses(twinId)).length === 0 && typeof grade === 'number' && grade >= OWN_GRADES.from && grade <= OWN_GRADES.to) await addOwnGrade(twinId, grade, userId)
  const store = await cookies()
  store.set(HANDOVER_COOKIE, await signHandover(OWN_HANDOVER, childId), { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: HANDOVER_TTL_SECONDS })
  store.set(WORKSPACE_COOKIE, 'own', workspaceCookieOptions())
  redirect('/k')
}
