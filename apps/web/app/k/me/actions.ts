'use server'

import { redirect } from 'next/navigation'
import { isCodeLoginEmail } from '@/lib/child-login'
import { createSupabaseServer } from '@/lib/supabase/server'

/**
 * "I'm done for today": signs the learner out. A learner with a code and a PIN goes back to the code screen; a learner who signed up alone (P111, a real email
 * and a password) goes back to the email and password sign-in, where they can sign in again.
 */
export async function signOutChild(): Promise<void> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  const alone = data.user !== null && !isCodeLoginEmail(data.user.email)
  await supabase.auth.signOut()
  redirect(alone ? '/sign-in' : '/k/sign-in')
}
