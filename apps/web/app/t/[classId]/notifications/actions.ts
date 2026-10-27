'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Marks the signed-in teacher's unread notifications as read. RLS limits the update to their own rows. */
export async function markAllRead(classId: string): Promise<void> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (error) throw new Error(`markAllRead: ${error.message}`)
  revalidatePath(`/t/${classId}/notifications`)
}
