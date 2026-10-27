'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTeacher } from '@/lib/data/p21'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function saveName(name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) return
  const { admin, userId } = await requireTeacher()
  const { error } = await admin.from('profiles').update({ display_name: clean }).eq('user_id', userId)
  if (error) throw new Error(`could not save name: ${error.message}`)
  revalidatePath('/t', 'layout')
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
