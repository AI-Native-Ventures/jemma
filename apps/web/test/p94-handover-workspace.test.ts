// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Amina has the phone": the hand-over sets the workspace of the session it hands over, so the learner's screens find that session whether it is
// one of "My school" or of "My own". The parent's client, the cookies and the sign are stand-ins: no database, no browser.

const state = vi.hoisted(() => ({
  session: { id: 's1', child_id: 'child-school', status: 'planned' } as { id: string; child_id: string; status: string } | null,
  kid: { private_of: null } as { private_of: string | null } | null,
  cookies: [] as { name: string; value: string; options: Record<string, unknown> }[],
  updates: [] as unknown[],
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => state.cookies.push({ name, value, options }) }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/data/p25', () => ({ HANDOVER_COOKIE: 'jemma_handover', HANDOVER_TTL_SECONDS: 5400, signHandover: async (sessionId: string, childId: string) => `signed:${sessionId}:${childId}` }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ update: (patch: unknown) => (state.updates.push(patch), { eq: () => ({ eq: async () => ({ error: null }) }) }) }) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'sessions' ? state.session : state.kid, error: null }) }) }) }),
  }),
}))

import { startSession } from '../app/p/[childId]/learn/handover/actions'

beforeEach(() => {
  state.session = { id: 's1', child_id: 'child-school', status: 'planned' }
  state.kid = { private_of: null }
  state.cookies = []
  state.updates = []
})

const run = async (id = 's1') => {
  await expect(startSession(id)).rejects.toThrow(`REDIRECT /k/session/${id}`)
  return Object.fromEntries(state.cookies.map((c) => [c.name, c.value]))
}

describe('startSession', () => {
  it('a session of the school child hands over with the workspace "school"', async () => {
    const set = await run()
    expect(set).toEqual({ jemma_handover: 'signed:s1:child-school', jemma_ws: 'school' })
  })

  it('a session of the private twin signs the twin and sets the workspace "own"', async () => {
    state.session = { id: 's-own', child_id: 'child-own', status: 'planned' }
    state.kid = { private_of: 'child-school' }
    const set = await run('s-own')
    expect(set).toEqual({ jemma_handover: 'signed:s-own:child-own', jemma_ws: 'own' })
  })

  it('the workspace cookie is for this site only and never read by a script', async () => {
    await run()
    expect(state.cookies.find((c) => c.name === 'jemma_ws')!.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('a session the parent cannot read, or that is done, is not found and sets no cookie', async () => {
    state.session = null
    await expect(startSession('s1')).rejects.toThrow('NOT_FOUND')
    state.session = { id: 's1', child_id: 'child-school', status: 'done' }
    await expect(startSession('s1')).rejects.toThrow('NOT_FOUND')
    expect(state.cookies).toEqual([])
  })
})
