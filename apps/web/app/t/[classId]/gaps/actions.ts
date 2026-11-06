'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Marks a class reteach as taught. RLS verifies the teacher can see the plan; the service client writes it because there is no update policy. */
export async function markReteachDone(reteachId: string): Promise<void> {
  await requireRole('teacher')
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
  revalidatePath(`/t/${plan.class_id}`, 'layout')
}
