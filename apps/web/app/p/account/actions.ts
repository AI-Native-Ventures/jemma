'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** "Edit your details": the parent's name, as teachers and the app show it. */
export async function saveParentName(name: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!clean) return { ok: false, message: 'Write your name.' }
  const { userId } = await requireRole('parent')
  const { error } = await createSupabaseAdmin().from('profiles').update({ display_name: clean }).eq('user_id', userId)
  if (error) return { ok: false, message: 'Could not save. Try again.' }
  revalidatePath('/p', 'layout')
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
