// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P111: the action behind "Start practising" on the grade screen. It checks that a person is signed in and has no role yet, that the country is one the app
// knows, hands the rest to the work in the profiling package (the school, the child with the login as user_id, the CAPS class, the profile) and sends the
// learner to /k. A plain refusal comes back as words. Calling it twice never makes a second child. The sign-in check, the profile lookup and the work are
// stand-ins: no database, no browser.

const state = vi.hoisted(() => ({
  user: { id: 'login-1', email: 'naledi@example.test', user_metadata: { full_name: 'Naledi Dlamini' } } as { id: string; email: string; user_metadata: Record<string, unknown> } | null,
  role: null as 'teacher' | 'parent' | 'learner' | null,
  made: [] as { userId: string; displayName: string; grade: unknown; country: unknown }[],
  fail: null as Error | null,
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null, error: null }) }) }) }) }),
}))
vi.mock('@/lib/own-workspace', () => {
  class OwnWorkspaceError extends Error {}
  return {
    OwnWorkspaceError,
    startLearnerAlone: async (input: { userId: string; displayName: string; grade: unknown; country: unknown }) => {
      state.made.push(input)
      if (state.fail) throw state.fail
      return { childId: 'child-1', schoolId: 's', classId: 'c', grade: input.grade, topics: 40, created: true }
    },
  }
})

import { startLearner } from '../app/(auth)/role/learner/actions'
import { OwnWorkspaceError } from '../lib/own-workspace'

beforeEach(() => {
  state.user = { id: 'login-1', email: 'naledi@example.test', user_metadata: { full_name: 'Naledi Dlamini' } }
  state.role = null
  state.made = []
  state.fail = null
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('startLearner (the action)', () => {
  it('makes the learner as the signed-in login, with the account name, and sends the learner to /k', async () => {
    await expect(startLearner({ grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /k')
    expect(state.made).toEqual([{ userId: 'login-1', displayName: 'Naledi Dlamini', grade: 5, country: 'ZA' }])
  })

  it('a person with no name on the account is known by the part of the email before the @', async () => {
    state.user = { id: 'login-2', email: 'sipho@example.test', user_metadata: {} }
    await expect(startLearner({ grade: 3, country: 'ZA' })).rejects.toThrow('REDIRECT /k')
    expect(state.made[0]).toMatchObject({ userId: 'login-2', displayName: 'sipho' })
  })

  it('a person who is not signed in goes to sign in and nothing is made', async () => {
    state.user = null
    await expect(startLearner({ grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /sign-in')
    expect(state.made).toEqual([])
  })

  it('a learner who already started goes straight to /k and nothing is made (a second tap never makes a second child)', async () => {
    state.role = 'learner'
    await expect(startLearner({ grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /k')
    await expect(startLearner({ grade: 8, country: 'ZA' })).rejects.toThrow('REDIRECT /k')
    expect(state.made).toEqual([])
  })

  it('a teacher or a parent cannot become a learner this way: they go to their own home and nothing is made', async () => {
    state.role = 'teacher'
    await expect(startLearner({ grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /t')
    state.role = 'parent'
    await expect(startLearner({ grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /p')
    expect(state.made).toEqual([])
  })

  it('a country the app does not know is refused in words, and nothing is made', async () => {
    for (const country of ['', 'XX', 'za', 'South Africa', 'ZZZ']) {
      expect(await startLearner({ grade: 5, country }), country).toEqual({ ok: false, message: 'Pick the country.' })
    }
    expect(state.made).toEqual([])
  })

  it('the countries the app already knows are all accepted (South Africa, Kenya, Other)', async () => {
    for (const country of ['ZA', 'KE', 'ZZ']) await expect(startLearner({ grade: 5, country })).rejects.toThrow('REDIRECT /k')
    expect(state.made.map((m) => m.country)).toEqual(['ZA', 'KE', 'ZZ'])
  })

  it('a missing grade is a plain refusal of the work, with its own words and no redirect', async () => {
    state.fail = new OwnWorkspaceError('Pick your grade, from 1 to 12.')
    expect(await startLearner({ grade: 0, country: 'ZA' })).toEqual({ ok: false, message: 'Pick your grade, from 1 to 12.' })
    expect(await startLearner({ grade: Number.NaN, country: 'ZA' })).toEqual({ ok: false, message: 'Pick your grade, from 1 to 12.' })
  })

  it('any other failure is one plain sentence, never the reason of the database', async () => {
    state.fail = new Error('duplicate key value violates unique constraint "schools_pkey"')
    const result = await startLearner({ grade: 5, country: 'ZA' })
    expect(result).toEqual({ ok: false, message: 'Could not start your Jemma. Try again.' })
    expect(JSON.stringify(result)).not.toContain('duplicate')
  })
})
