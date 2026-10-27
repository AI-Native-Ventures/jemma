'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'

/** "I'm done for today": signs the child out and goes back to the sign-in screen. */
export async function signOutChild(): Promise<void> {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  redirect('/k/sign-in')
}
