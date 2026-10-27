'use server'

import { redirect } from 'next/navigation'
import type { Tables } from '@jemma/profiling/db'
import { HOMES, type Role } from '@/components/blocks/nav'
import { attemptChildSignIn, type ChildSignInResult } from './child-login'
import { createSupabaseAdmin } from './supabase/admin'
import { createSupabaseServer } from './supabase/server'

export type Profile = Tables<'profiles'>

/** Where a signed-in user with no profile goes to pick a role. */
const ROLE_PATH = '/role'

/**
 * Guard for a space. Signed out goes to `/sign-in`, no profile yet to `/role`,
 * and a user in the wrong space goes to their own home.
 */
export async function requireRole(role: Role): Promise<{ userId: string; profile: Profile }> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/sign-in')
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', data.user.id).maybeSingle()
  if (!profile) redirect(ROLE_PATH)
  if (profile.role !== role) redirect(HOMES[profile.role])
  return { userId: data.user.id, profile }
}

/** Emails a 6-digit code (creates the user on first use). */
export async function sendSignInCode(email: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/** Checks the emailed code. `next` is the user's home, or the role picker when they have no profile yet. */
export async function verifySignInCode(
  email: string,
  code: string,
): Promise<{ ok: true; next: string } | { ok: false }> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  })
  if (error || !data.user) return { ok: false }
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  return { ok: true, next: profile ? HOMES[profile.role] : ROLE_PATH }
}

/** First sign-in: pick teacher or parent. A user who already has a role keeps it. Learners are made by `createChildLogin`. */
export async function chooseRole(role: 'teacher' | 'parent'): Promise<void> {
  if (role !== 'teacher' && role !== 'parent') throw new Error('Unknown role')
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/sign-in')
  const admin = createSupabaseAdmin()
  const existing = await admin.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (existing.data) redirect(HOMES[existing.data.role])
  const name = (data.user.email ?? '').split('@')[0] || 'New user'
  const { error } = await admin.from('profiles').insert({ user_id: data.user.id, role, display_name: name })
  if (error) throw new Error(`could not save role: ${error.message}`)
  redirect(HOMES[role])
}

/** Child sign-in with the family code and a 4-digit PIN. Five wrong tries in 15 minutes lock the code. */
export async function signInChild(code: string, pin: string): Promise<ChildSignInResult> {
  const supabase = await createSupabaseServer()
  return attemptChildSignIn(createSupabaseAdmin(), async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return !error
  }, code, pin)
}
