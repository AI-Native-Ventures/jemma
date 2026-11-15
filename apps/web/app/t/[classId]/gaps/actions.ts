'use server'

import { revalidatePath } from 'next/cache'
import { APPROVAL_NOT_SAVED, isApprovalNotSaved, withApproval } from '@/lib/approvals'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type ReteachResult = { ok: true } | { ok: false; message: string }

/**
 * Marks a class reteach as taught. RLS verifies the teacher can see the plan; the service client writes it because there is no update policy.
 * The approval is saved first: when it cannot be saved nothing changes and the answer is the one plain line for the screen to show.
 */
export async function markReteachDone(reteachId: string): Promise<ReteachResult> {
  const { userId } = await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data: plan, error: lookupError } = await supabase
    .from('reteach_plans')
    .select('id, class_id')
    .eq('id', reteachId)
    .maybeSingle()
  if (lookupError) throw new Error(`markReteachDone: ${lookupError.message}`)
  if (!plan) throw new Error('markReteachDone: plan not found')

  const admin = createSupabaseAdmin()
  const school = await admin.from('classes').select('school_id').eq('id', plan.class_id).maybeSingle()
  if (!school.data) {
    // No school means no approval can be saved, so the step does not happen.
    console.error(`approvals: no school found for class ${plan.class_id}, so the reteach ${plan.id} was not done`)
    return { ok: false, message: APPROVAL_NOT_SAVED }
  }
  try {
    await withApproval(admin, { schoolId: school.data.school_id, kind: 'reteach', refId: plan.id, decision: 'confirmed', userId }, async () => {
      const { error } = await admin.from('reteach_plans').update({ done_at: new Date().toISOString() }).eq('id', plan.id).eq('class_id', plan.class_id)
      if (error) throw new Error(`markReteachDone: ${error.message}`)
    })
  } catch (e) {
    if (isApprovalNotSaved(e)) return { ok: false, message: e.message }
    throw e
  }
  revalidatePath(`/t/${plan.class_id}`, 'layout')
  return { ok: true }
}
