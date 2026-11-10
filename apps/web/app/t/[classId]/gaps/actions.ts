'use server'

import { revalidatePath } from 'next/cache'
import { recordApproval } from '@/lib/approvals'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Marks a class reteach as taught. RLS verifies the teacher can see the plan; the service client writes it because there is no update policy. */
export async function markReteachDone(reteachId: string): Promise<void> {
  const { userId } = await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data: plan, error: lookupError } = await supabase
    .from('reteach_plans')
    .select('id, class_id')
    .eq('id', reteachId)
    .maybeSingle()
  if (lookupError) throw new Error(`markReteachDone: ${lookupError.message}`)
  if (!plan) throw new Error('markReteachDone: plan not found')

  const { error } = await createSupabaseAdmin()
    .from('reteach_plans')
    .update({ done_at: new Date().toISOString() })
    .eq('id', plan.id)
    .eq('class_id', plan.class_id)
  if (error) throw new Error(`markReteachDone: ${error.message}`)
  const admin = createSupabaseAdmin()
  const school = await admin.from('classes').select('school_id').eq('id', plan.class_id).maybeSingle()
  if (school.data) await recordApproval(admin, { schoolId: school.data.school_id, kind: 'reteach', refId: plan.id, decision: 'confirmed', userId })
  else console.error(`approvals: no school found for class ${plan.class_id}, so the reteach ${plan.id} was not recorded`)
  revalidatePath(`/t/${plan.class_id}`, 'layout')
}
