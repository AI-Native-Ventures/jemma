'use server'

import { revalidatePath } from 'next/cache'
import { addMadeUpLearners } from '../../../../../../supabase/seed/demo-learners'
import { addMadeUpPractice } from '../../../../../../supabase/seed/made-up-practice'
import { requireRole } from '@/lib/auth'
import { requestLongView } from '@/lib/long-view'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { demoOn } from '@/lib/demo-switch'

export type MadeUpResult = { ok: true; added: number; asked: number } | { ok: false; reason: string }

/**
 * Teacher only, and only in a demo sandbox school (`addMadeUpLearners` checks the sandbox). Adds six made-up learners with up to three
 * years of history to the class, then asks for a Long view update for each. The update can fail without the learners being lost: the
 * Long view screen asks again when it is opened with no pattern.
 */
export async function addMadeUpLearnersAction(classId: string): Promise<MadeUpResult> {
  if (!demoOn()) return { ok: false, reason: 'Made-up learners are only for the demo.' }
  const { userId } = await requireRole('teacher')
  const admin = createSupabaseAdmin()
  const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', classId).maybeSingle()
  if (!cls || cls.teacher_id !== userId) return { ok: false, reason: 'You do not teach this class.' }
  const made = await addMadeUpLearners(admin, { classId })
  if (!made.ok) return { ok: false, reason: made.error }
  // Practice they did at home, so the Topics screens have something to show. Best effort: it never fails the adding.
  await addMadeUpPractice(admin, { classId, childIds: made.childIds })
  const asked = await requestLongView(made.childIds)
  revalidatePath('/t/[classId]/learners', 'page')
  revalidatePath('/t/[classId]', 'page')
  revalidatePath('/t/[classId]/topics', 'layout')
  return { ok: true, added: made.childIds.length, asked: asked.sent.length }
}
