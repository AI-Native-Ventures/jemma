'use server'

import { redirect } from 'next/navigation'
import type { AuthError } from '@supabase/supabase-js'
import type { Tables } from '@jemma/profiling/db'
import { HOMES, type Role } from '@/components/blocks/nav'
import { attemptChildSignIn, type ChildSignInResult } from './child-login'
import { displayNameFor } from './display-name'
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

/** Where a person who has just signed in goes: their home, or the role picker when they have no profile yet. Every way in ends here. */
async function nextPathFor(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, userId: string): Promise<string> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle()
  return profile ? HOMES[profile.role] : ROLE_PATH
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
  return { ok: true, next: await nextPathFor(supabase, data.user.id) }
}

/** Why a sign-up with a password did not work. `confirm`: the project wants the email confirmed first, so no session came back. */
export type PasswordSignUpFailure = 'taken' | 'short' | 'easy' | 'email' | 'confirm' | 'other'

function signUpFailure(error: Pick<AuthError, 'code' | 'message'> & { reasons?: unknown }): PasswordSignUpFailure {
  if (error.code === 'user_already_exists' || error.code === 'email_exists') return 'taken'
  if (error.code === 'weak_password') {
    const reasons = Array.isArray(error.reasons) ? error.reasons : []
    return reasons.includes('pwned') || reasons.includes('characters') ? 'easy' : 'short'
  }
  if (error.code === 'email_address_invalid') return 'email'
  return 'other'
}

/**
 * Makes an account with an email and a password, no email sent (the project confirms new email sign-ups by itself, so a session comes
 * back at once). The name is kept as the user data the profile's display name is read from. `next` is where a good code goes too.
 */
export async function createPasswordAccount(input: {
  email: string
  password: string
  name: string
}): Promise<{ ok: true; next: string } | { ok: false; why: PasswordSignUpFailure }> {
  const supabase = await createSupabaseServer()
  const name = input.name.trim()
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: { data: { full_name: name, name } },
  })
  if (error) return { ok: false, why: signUpFailure(error) }
  // A project that wants a confirmed email hides an email already in use as a user with no identities, and gives a new user no session.
  if (data.user && data.user.identities?.length === 0) return { ok: false, why: 'taken' }
  if (!data.user || !data.session) return { ok: false, why: 'confirm' }
  return { ok: true, next: await nextPathFor(supabase, data.user.id) }
}

/** Checks an email and a password. `wrong`: the pair does not match (or the email has no password, as an account made with a code). */
export async function checkPassword(
  email: string,
  password: string,
): Promise<{ ok: true; next: string } | { ok: false; why: 'wrong' | 'other' }> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) return { ok: false, why: error.code === 'invalid_credentials' ? 'wrong' : 'other' }
  if (!data.user) return { ok: false, why: 'other' }
  return { ok: true, next: await nextPathFor(supabase, data.user.id) }
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
  const name = displayNameFor(data.user)
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
