'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Marks a class reteach as taught. Teachers have no update policy on `reteach_plans`, so the write uses the service client after RLS confirms the teacher can see the plan. */
export async function markReteachDone(reteachId: string): Promise<void> {
  await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data: plan } = await supabase.from('reteach_plans').select('id, class_id').eq('id', reteachId).maybeSingle()
  if (!plan) throw new Error('markReteachDone: plan not found')
  const { error } = await createSupabaseAdmin()
    .from('reteach_plans')
    .update({ done_at: new Date().toISOString() })
    .eq('id', plan.id)
  if (error) throw new Error(`markReteachDone: ${error.message}`)
  revalidatePath(`/t/${plan.class_id}`, 'layout')
}
