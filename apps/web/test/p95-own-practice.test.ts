// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Practise at home with {name}" (P95): the parent's button starts a hand-over with the workspace set to My own, so the child lands on My own's
// home. It checks the parent through the parent's own client (a child the parent cannot read is not found), opens My own for the learner when it
// is not open, adds the learner's grade when My own has none, and sets the two cookies. The client, the own-workspace functions and the cookies are
// stand-ins: no database, no browser.

const state = vi.hoisted(() => ({
  user: { id: 'parent-1' } as { id: string } | null,
  child: { id: 'child-school', grade: 6, private_of: null } as { id: string; grade: number; private_of: string | null } | null,
  classes: [] as { id: string; name: string; grade: number }[],
  ensureError: null as Error | null,
  cookies: [] as { name: string; value: string; options: Record<string, unknown> }[],
  ensured: [] as unknown[][],
  added: [] as unknown[][],
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
vi.mock('@/lib/handover', () => ({ HANDOVER_COOKIE: 'jemma_handover', HANDOVER_TTL_SECONDS: 5400, OWN_HANDOVER: 'own', signHandover: async (marker: string, childId: string) => `signed:${marker}:${childId}` }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.child, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/own-workspace', () => {
  class OwnWorkspaceError extends Error {}
  return {
    OwnWorkspaceError,
    OWN_GRADES: { from: 1, to: 12 },
    ensureOwnWorkspace: async (...args: unknown[]) => {
      state.ensured.push(args)
      if (state.ensureError) throw state.ensureError
      return 'twin-1'
    },
    listOwnClasses: async () => state.classes,
    addOwnGrade: async (...args: unknown[]) => {
      state.added.push(args)
      return { classId: 'c', grade: args[1], created: true, topics: 40 }
    },
  }
})

import { startOwnPractice } from '../app/p/[childId]/learn/handover/own-actions'

beforeEach(() => {
  state.user = { id: 'parent-1' }
  state.child = { id: 'child-school', grade: 6, private_of: null }
  state.classes = []
  state.ensureError = null
  state.cookies = []
  state.ensured = []
  state.added = []
})

const run = async (childId = 'child-school') => {
  await expect(startOwnPractice(childId)).rejects.toThrow('REDIRECT /k')
  return Object.fromEntries(state.cookies.map((c) => [c.name, c.value]))
}

describe('startOwnPractice', () => {
  it('opens My own for the learner as the parent, adds the learner\'s grade, hands over with the workspace "own" and lands on the home', async () => {
    const set = await run()
    expect(state.ensured).toEqual([['child-school', 'parent-1']])
    expect(state.added).toEqual([['twin-1', 6, 'parent-1']])
    expect(set).toEqual({ jemma_handover: 'signed:own:child-school', jemma_ws: 'own' })
  })

  it('the hand-over names the school child, never the twin (a parent never sees the twin as a second child)', async () => {
    await run()
    expect(state.cookies.find((c) => c.name === 'jemma_handover')!.value).toBe('signed:own:child-school')
  })

  it('adds no grade when My own already has one', async () => {
    state.classes = [{ id: 'c6', name: 'Grade 6 (my own)', grade: 6 }]
    await run()
    expect(state.added).toEqual([])
  })

  it('a school child with a grade My own has no map for (Grade R) opens My own with no grade added, and the learner adds one', async () => {
    state.child = { id: 'child-school', grade: 0, private_of: null }
    await run()
    expect(state.added).toEqual([])
    expect(state.cookies.map((c) => c.name).sort()).toEqual(['jemma_handover', 'jemma_ws'])
  })

  it('both cookies are for this site only and never read by a script, and the hand-over lasts as long as any hand-over', async () => {
    await run()
    for (const c of state.cookies) expect(c.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    expect(state.cookies.find((c) => c.name === 'jemma_handover')!.options.maxAge).toBe(5400)
  })

  it('a child the parent cannot read (not linked, or not approved) is not found, and no cookie is set', async () => {
    state.child = null
    await expect(startOwnPractice('child-x')).rejects.toThrow('NOT_FOUND')
    expect(state.cookies).toEqual([])
    expect(state.ensured).toEqual([])
  })

  it('the private twin itself is not a learner to hand over (it is not found)', async () => {
    state.child = { id: 'twin-1', grade: 6, private_of: 'child-school' }
    await expect(startOwnPractice('twin-1')).rejects.toThrow('NOT_FOUND')
    expect(state.cookies).toEqual([])
  })

  it('nobody signed in is not found', async () => {
    state.user = null
    await expect(startOwnPractice('child-school')).rejects.toThrow('NOT_FOUND')
    expect(state.cookies).toEqual([])
  })

  it('a person My own refuses (not the learner, not an approved parent) is not found, and no cookie is set', async () => {
    const { OwnWorkspaceError } = await import('@/lib/own-workspace')
    state.ensureError = new OwnWorkspaceError('You cannot open My own for this learner.')
    await expect(startOwnPractice('child-school')).rejects.toThrow('NOT_FOUND')
    expect(state.cookies).toEqual([])
  })
})
