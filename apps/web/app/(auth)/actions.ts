'use server'

import { redirect } from 'next/navigation'
import { checkPassword, createPasswordAccount, verifySignInCode, type PasswordSignUpFailure } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

/**
 * What a form shows after it ran. The form is cleared after every action, so the sign-up and sign-in forms get back what was typed
 * (never the password) and draw it again. `taken`: the email already has an account, so the error carries a link to sign in.
 */
export type FormState = { error?: string; taken?: boolean; name?: string; email?: string; agree?: boolean } | undefined

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The shortest password the sign-up form takes. */
const MIN_PASSWORD = 8

/** Plain words for each way a sign-up can fail. Never the service's own message. */
const SIGN_UP_WORDS: Record<PasswordSignUpFailure, string> = {
  taken: 'That email already has an account. Sign in instead.',
  short: 'Use at least 8 characters.',
  easy: 'That password is too easy to guess. Try another one.',
  email: 'Enter a valid email.',
  confirm: 'Your account is made. Check your email to confirm it, then sign in.',
  other: 'We could not make your account. Wait a minute and try again.',
}

async function emailCode(email: string): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  return error ? 'We could not send a code. Wait a minute and try again.' : null
}

function codePage(email: string): string {
  return `/sign-in/code?email=${encodeURIComponent(email)}`
}

/** Sign-up form: name, email, password and the agreement. A good sign-up goes where a good code goes (the role picker for a new person). */
export async function makeAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim()
  const typed = String(form.get('email') ?? '').trim()
  const email = typed.toLowerCase()
  const password = String(form.get('password') ?? '')
  const agree = form.get('agree') === 'on'
  const fail = (error: string, more: { taken?: boolean } = {}): FormState => ({ error, ...more, name, email: typed, agree })
  if (!name) return fail('Add your name.')
  if (!EMAIL.test(email)) return fail('Enter a valid email.')
  if (password.length < MIN_PASSWORD) return fail(SIGN_UP_WORDS.short)
  if (!agree) return fail('Tick the box to agree to the terms.')
  const made = await createPasswordAccount({ email, password, name })
  if (!made.ok) return fail(SIGN_UP_WORDS[made.why], made.why === 'taken' ? { taken: true } : {})
  redirect(made.next)
}

/** Sign-in form: an email and a password, then the user's home (or the role picker for a person with no role yet). */
export async function signInWithPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const typed = String(form.get('email') ?? '').trim()
  const email = typed.toLowerCase()
  const password = String(form.get('password') ?? '')
  const fail = (error: string): FormState => ({ error, email: typed })
  if (!EMAIL.test(email)) return fail('Enter the email you signed up with.')
  if (!password) return fail('Enter your password.')
  const result = await checkPassword(email, password)
  if (!result.ok) return fail(result.why === 'wrong' ? 'That email and password do not match.' : 'We could not sign you in. Wait a minute and try again.')
  redirect(result.next)
}

/** "Email me a code instead" form: emails a code, then shows the code screen. Needs an email sender, which the preview does not have. */
export async function requestSignInCode(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) return { error: 'Enter the email you signed up with.' }
  const failed = await emailCode(email)
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
