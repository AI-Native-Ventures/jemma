// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P111: a learner who signed up alone signs in at /sign-in with an email and a password and lands on /k. The destination is the same one every way in
// uses: a learner's home is /k. The sign-in service and the profile lookup are stand-ins: no database, no browser, no network. The password is made up.

const state = vi.hoisted(() => ({ role: 'learner' as 'teacher' | 'parent' | 'learner' | null, cookieNames: [] as string[], signInCalls: [] as Record<string, unknown>[] }))

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => state.cookieNames.map((name) => ({ name, value: 'x' })) }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      signInWithPassword: async (args: Record<string, unknown>) => (state.signInCalls.push(args), { data: { user: { id: 'login-1' }, session: { access_token: 'fake' } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'login-1' } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null, error: null }) }) }) }),
  }),
}))

import { HOMES } from '@/components/blocks/nav'
import { destinationFor, signedInDestination } from '../app/_landing/destination'
import { signInWithPassword } from '../app/(auth)/actions'

const FAKE_PASSWORD = 'not-a-real-password-1'
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  state.role = 'learner'
  state.cookieNames = ['sb-abc-auth-token']
  state.signInCalls = []
})

describe('where a learner goes', () => {
  it('the home of the learner role is /k', () => {
    expect(HOMES.learner).toBe('/k')
    expect(destinationFor(true, 'learner')).toBe('/k')
  })

  it('"/" sends a signed-in learner to /k', async () => {
    expect(await signedInDestination()).toBe('/k')
  })

  it('signing in with an email and a password as a learner lands on /k', async () => {
    await expect(signInWithPassword(undefined, form({ email: 'Naledi@Example.test', password: FAKE_PASSWORD }))).rejects.toThrow('REDIRECT /k')
    expect(state.signInCalls).toEqual([{ email: 'naledi@example.test', password: FAKE_PASSWORD }])
  })

  it('a teacher and a parent land where they always did, and a person with no role lands on the role screen', async () => {
    state.role = 'teacher'
    await expect(signInWithPassword(undefined, form({ email: 'a@example.test', password: FAKE_PASSWORD }))).rejects.toThrow('REDIRECT /t')
    state.role = 'parent'
    await expect(signInWithPassword(undefined, form({ email: 'a@example.test', password: FAKE_PASSWORD }))).rejects.toThrow('REDIRECT /p')
    state.role = null
    await expect(signInWithPassword(undefined, form({ email: 'a@example.test', password: FAKE_PASSWORD }))).rejects.toThrow('REDIRECT /role')
  })
})
