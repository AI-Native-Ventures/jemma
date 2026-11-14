// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P100: a teacher or a parent signs up and signs in with an email and a password, and no email is sent. These are the two server actions
// (`makeAccount` and `signInWithPassword`) and the code flow they sit beside. The sign-in service, the profile lookup and the redirect are
// stand-ins: no database, no browser, no network. The passwords here are made up and belong to no account.

type Reply = { data: Record<string, unknown>; error: Record<string, unknown> | null }

const state = vi.hoisted(() => ({
  signUp: null as unknown,
  signIn: null as unknown,
  otp: null as unknown,
  profile: null as { role: string } | null,
  signUpCalls: [] as Record<string, unknown>[],
  signInCalls: [] as Record<string, unknown>[],
  otpSent: [] as Record<string, unknown>[],
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      signUp: async (args: Record<string, unknown>) => (state.signUpCalls.push(args), state.signUp),
      signInWithPassword: async (args: Record<string, unknown>) => (state.signInCalls.push(args), state.signIn),
      signInWithOtp: async (args: Record<string, unknown>) => (state.otpSent.push(args), { error: null }),
      verifyOtp: async () => state.otp,
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }),
  }),
}))

import { checkCode, makeAccount, requestSignInCode, signInWithPassword } from '../app/(auth)/actions'

const FAKE_PASSWORD = 'not-a-real-password-1'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const signUpForm = (over: Record<string, string> = {}) =>
  form({ name: 'Ms Nkosi', email: 'Ms.Nkosi@School.example', password: FAKE_PASSWORD, agree: 'on', ...over })

const newUser = { id: 'user-1', identities: [{ id: 'i1' }] }
const created: Reply = { data: { user: newUser, session: { access_token: 'fake' } }, error: null }
const signedIn: Reply = { data: { user: { id: 'user-2' }, session: { access_token: 'fake' } }, error: null }
const fail = (code: string, message: string, extra: Record<string, unknown> = {}): Reply => ({ data: { user: null, session: null }, error: { code, message, status: 422, ...extra } })

beforeEach(() => {
  state.signUp = created
  state.signIn = signedIn
  state.otp = { data: { user: { id: 'user-1' } }, error: null }
  state.profile = null
  state.signUpCalls = []
  state.signInCalls = []
  state.otpSent = []
})

describe('makeAccount: sign up with an email and a password', () => {
  it('makes the account and goes to the role picker, with no email asked for', async () => {
    await expect(makeAccount(undefined, signUpForm())).rejects.toThrow('REDIRECT /role')
    expect(state.signUpCalls).toHaveLength(1)
    expect(state.otpSent).toEqual([])
  })

  it('gives the service the email in lower case, the password as typed, and the name as the user data', async () => {
    await expect(makeAccount(undefined, signUpForm({ name: '  Ms Nkosi ' }))).rejects.toThrow('REDIRECT')
    const call = state.signUpCalls[0] as { email: string; password: string; options: { data: Record<string, unknown> } }
    expect(call.email).toBe('ms.nkosi@school.example')
    expect(call.password).toBe(FAKE_PASSWORD)
    // The profile's display name is read from `full_name` (lib/display-name.ts), so the name is kept under that key (and as `name`).
    expect(call.options.data).toEqual({ full_name: 'Ms Nkosi', name: 'Ms Nkosi' })
  })

  it('goes where a good code goes: the same page for the same person', async () => {
    // A person with no profile: the role picker, by either way in.
    state.profile = null
    await expect(makeAccount(undefined, signUpForm())).rejects.toThrow('REDIRECT /role')
    await expect(checkCode('ms.nkosi@school.example', '123456')).rejects.toThrow('REDIRECT /role')
    // A person who already has a role (the sign-up page was opened by a signed-in user): their home, by either way in.
    state.profile = { role: 'teacher' }
    await expect(makeAccount(undefined, signUpForm())).rejects.toThrow('REDIRECT /t')
    await expect(checkCode('ms.nkosi@school.example', '123456')).rejects.toThrow('REDIRECT /t')
    state.profile = { role: 'parent' }
    await expect(makeAccount(undefined, signUpForm())).rejects.toThrow('REDIRECT /p')
    await expect(checkCode('ms.nkosi@school.example', '123456')).rejects.toThrow('REDIRECT /p')
  })

  it('says so when the email already has an account, and keeps the name and the email, never the password', async () => {
    state.signUp = fail('user_already_exists', 'User already registered')
    const result = await makeAccount(undefined, signUpForm())
    expect(result).toEqual({
      error: 'That email already has an account. Sign in instead.',
      taken: true,
      name: 'Ms Nkosi',
      email: 'Ms.Nkosi@School.example',
      agree: true,
    })
    expect(JSON.stringify(result)).not.toContain(FAKE_PASSWORD)
  })

  it('says the same when the service hides an existing account (a user with no identities)', async () => {
    state.signUp = { data: { user: { id: 'x', identities: [] }, session: null }, error: null }
    expect(await makeAccount(undefined, signUpForm())).toMatchObject({ error: 'That email already has an account. Sign in instead.', taken: true })
    state.signUp = fail('email_exists', 'A user with this email address has already been registered')
    expect(await makeAccount(undefined, signUpForm())).toMatchObject({ taken: true })
  })

  it('asks for at least 8 characters and does not call the service with a short password', async () => {
    for (const password of ['', 'short', '1234567']) {
      expect(await makeAccount(undefined, signUpForm({ password }))).toMatchObject({ error: 'Use at least 8 characters.' })
    }
    expect(state.signUpCalls).toEqual([])
    await expect(makeAccount(undefined, signUpForm({ password: '12345678' }))).rejects.toThrow('REDIRECT /role')
  })

  it('says it again when the service finds the password too weak, and says why when it is too easy to guess', async () => {
    state.signUp = fail('weak_password', 'Password should be at least 8 characters.', { reasons: ['length'] })
    expect(await makeAccount(undefined, signUpForm())).toMatchObject({ error: 'Use at least 8 characters.' })
    state.signUp = fail('weak_password', 'Password is known to be weak and easy to guess.', { reasons: ['pwned'] })
    expect(await makeAccount(undefined, signUpForm())).toMatchObject({ error: 'That password is too easy to guess. Try another one.' })
  })

  it('needs a name, a valid email and the ticked box, in that order, before it asks the service anything', async () => {
    expect(await makeAccount(undefined, signUpForm({ name: '   ' }))).toMatchObject({ error: 'Add your name.' })
    expect(await makeAccount(undefined, signUpForm({ email: 'not-an-email' }))).toMatchObject({ error: 'Enter a valid email.' })
    expect(await makeAccount(undefined, form({ name: 'Ms Nkosi', email: 'a@b.example', password: FAKE_PASSWORD }))).toMatchObject({
      error: 'Tick the box to agree to the terms.',
    })
    expect(state.signUpCalls).toEqual([])
  })

  it('keeps what was typed when a field is wrong (the form is cleared after every action otherwise)', async () => {
    const result = await makeAccount(undefined, signUpForm({ password: 'short' }))
    expect(result).toMatchObject({ name: 'Ms Nkosi', email: 'Ms.Nkosi@School.example', agree: true })
  })

  it('never shows a raw error: any other failure is a plain line', async () => {
    for (const reply of [
      fail('unexpected_failure', 'relation "auth.users" does not exist: database exploded'),
      fail('over_request_rate_limit', 'Request rate limit reached'),
      fail('signup_disabled', 'Signups not allowed for this instance'),
    ]) {
      state.signUp = reply
      const result = await makeAccount(undefined, signUpForm())
      expect(result?.error).toBe('We could not make your account. Wait a minute and try again.')
      expect(result?.error).not.toMatch(/exploded|relation|rate limit|Signups/)
    }
  })

  it('says to confirm by email when the project does not auto-confirm (no session comes back)', async () => {
    state.signUp = { data: { user: newUser, session: null }, error: null }
    expect(await makeAccount(undefined, signUpForm())).toMatchObject({ error: 'Your account is made. Check your email to confirm it, then sign in.' })
  })

  it('says the email is not valid when the service refuses the address', async () => {
    state.signUp = fail('email_address_invalid', 'Email address "x@y.invalid" is invalid')
    expect(await makeAccount(undefined, signUpForm())).toMatchObject({ error: 'Enter a valid email.' })
  })
})

describe('signInWithPassword: sign in with an email and a password', () => {
  const signInForm = (over: Record<string, string> = {}) => form({ email: ' Ms.Nkosi@School.example ', password: FAKE_PASSWORD, ...over })

  it('goes to the home of the person: /t for a teacher, /p for a parent, /role with no profile yet', async () => {
    state.profile = { role: 'teacher' }
    await expect(signInWithPassword(undefined, signInForm())).rejects.toThrow('REDIRECT /t')
    state.profile = { role: 'parent' }
    await expect(signInWithPassword(undefined, signInForm())).rejects.toThrow('REDIRECT /p')
    state.profile = null
    await expect(signInWithPassword(undefined, signInForm())).rejects.toThrow('REDIRECT /role')
  })

  it('gives the service the email in lower case and the password as typed, and sends no email', async () => {
    state.profile = { role: 'teacher' }
    await expect(signInWithPassword(undefined, signInForm())).rejects.toThrow('REDIRECT')
    expect(state.signInCalls).toEqual([{ email: 'ms.nkosi@school.example', password: FAKE_PASSWORD }])
    expect(state.otpSent).toEqual([])
  })

  it('says "That email and password do not match." for a wrong pair, keeps the email, and never the password', async () => {
    state.signIn = fail('invalid_credentials', 'Invalid login credentials', { status: 400 })
    const result = await signInWithPassword(undefined, signInForm())
    expect(result).toEqual({ error: 'That email and password do not match.', email: 'Ms.Nkosi@School.example' })
    expect(JSON.stringify(result)).not.toContain(FAKE_PASSWORD)
  })

  it('needs a valid email and a password before it asks the service anything', async () => {
    expect(await signInWithPassword(undefined, signInForm({ email: 'nope' }))).toMatchObject({ error: 'Enter the email you signed up with.' })
    expect(await signInWithPassword(undefined, signInForm({ password: '' }))).toMatchObject({ error: 'Enter your password.' })
    expect(state.signInCalls).toEqual([])
  })

  it('never shows a raw error: any other failure is a plain line that does not blame the password', async () => {
    state.signIn = fail('unexpected_failure', 'fetch failed: ECONNREFUSED 127.0.0.1:54321', { status: 500 })
    const result = await signInWithPassword(undefined, signInForm())
    expect(result?.error).toBe('We could not sign you in. Wait a minute and try again.')
    expect(result?.error).not.toMatch(/fetch|ECONNREFUSED/)
  })
})

describe('the code flow is still there (for later, when an email sender is set up)', () => {
  it('requestSignInCode still emails a code and goes to the code screen', async () => {
    await expect(requestSignInCode(undefined, form({ email: 'Ms.Nkosi@School.example' }))).rejects.toThrow(
      'REDIRECT /sign-in/code?email=ms.nkosi%40school.example',
    )
    expect(state.otpSent).toHaveLength(1)
  })

  it('checkCode still says "That code did not work" for a bad code', async () => {
    state.otp = { data: { user: null }, error: { message: 'Token has expired or is invalid' } }
    expect(await checkCode('a@b.example', '000000')).toEqual({ error: 'That code did not work. Check it or send a new one.' })
  })
})
