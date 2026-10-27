'use server'

import { redirect } from 'next/navigation'
import { verifySignInCode } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

export type FormState = { error?: string } | undefined

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function emailCode(email: string, name?: string): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, ...(name ? { data: { full_name: name } } : {}) },
  })
  return error ? 'We could not send a code. Wait a minute and try again.' : null
}

function codePage(email: string): string {
  return `/sign-in/code?email=${encodeURIComponent(email)}`
}

/** Sign-in form: emails a code, then shows the code screen. */
export async function requestSignInCode(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) return { error: 'Enter the email you signed up with.' }
  const failed = await emailCode(email)
  if (failed) return { error: failed }
  redirect(codePage(email))
}

/** Sign-up form: same as sign-in, plus the name and the agreement. */
export async function requestSignUpCode(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!name) return { error: 'Add your name.' }
  if (!EMAIL.test(email)) return { error: 'Enter a valid email.' }
  if (form.get('agree') !== 'on') return { error: 'Tick the box to agree before we send a code.' }
  const failed = await emailCode(email, name)
  if (failed) return { error: failed }
  redirect(codePage(email))
}

/** Code screen: "Send a new code". */
export async function resendCode(email: string): Promise<FormState> {
  const failed = await emailCode(email.trim().toLowerCase())
  return failed ? { error: failed } : undefined
}

/** Code screen: checks the code, then goes to the user's home (or the role picker on first sign-in). */
export async function checkCode(email: string, code: string): Promise<FormState> {
  const result = await verifySignInCode(email, code)
  if (!result.ok) return { error: 'That code did not work. Check it or send a new one.' }
  redirect(result.next)
}
