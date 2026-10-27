'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Marks every unread notification of the signed-in parent read (RLS lets them update their own). */
export async function markAllRead(childId: string): Promise<void> {
  const { userId } = await requireRole('parent')
  const supabase = await createSupabaseServer()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null).like('href', `/p/${childId}%`)
  revalidatePath(`/p/${childId}`, 'layout')
}
