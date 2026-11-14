// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only the linked parent makes a sign-in code (P99): `setChildPin` checks the parent's approved link before anything is made, so a parent who is not
// linked to the child, a parent whose link is still waiting and nobody signed in are all refused, and no login is made. The sign-in, the database and the
// login maker are stand-ins: no database.

const state = vi.hoisted(() => ({
  user: { id: 'parent-1' } as { id: string } | null,
  links: [] as { child_id: string; parent_id: string; status: string }[],
  made: [] as [string, string][],
  oldLogin: null as { user_id: string } | null,
  deleted: [] as string[],
  setBy: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/child-login', () => ({
  createChildLogin: async (_admin: unknown, childId: string, pin: string) => {
    state.made.push([childId, pin])
    return { code: 'K7M2QX' }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      const filters: [string, unknown][] = []
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (key: string, value: unknown) => (filters.push([key, value]), chain)
      chain.maybeSingle = async () => ({ data: state.links.find((l) => filters.every(([k, v]) => (l as Record<string, unknown>)[k] === v)) ? { id: 'link-1' } : null, error: null })
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    auth: { admin: { deleteUser: async (id: string) => (state.deleted.push(id), { error: null }) } },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'child_logins' ? state.oldLogin : null, error: null }) }) }),
      update: (patch: unknown) => (state.setBy.push(patch), { eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { setChildPin } from '../app/p/[childId]/settings/actions'

beforeEach(() => {
  state.user = { id: 'parent-1' }
  state.links = [{ child_id: 'child-1', parent_id: 'parent-1', status: 'approved' }]
  state.made = []
  state.oldLogin = null
  state.deleted = []
  state.setBy = []
})

describe('setChildPin', () => {
  it('the linked parent makes the code, and the person who set it is recorded', async () => {
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: true, code: 'K7M2QX' })
    expect(state.made).toEqual([['child-1', '4321']])
    expect(state.setBy).toEqual([{ pin_set_by: 'parent-1' }])
  })

  it('an earlier code is removed first, so it stops working', async () => {
    state.oldLogin = { user_id: 'old-user' }
    await setChildPin('child-1', '4321')
    expect(state.deleted).toEqual(['old-user'])
    expect(state.made).toHaveLength(1)
  })

  it('a parent who is not linked to this child is refused, and nothing is made or removed', async () => {
    expect(await setChildPin('child-2', '4321')).toEqual({ ok: false, error: 'You can only change your own child.' })
    expect(state.made).toEqual([])
    expect(state.deleted).toEqual([])
  })

  it('another parent linked to a different child is refused for this one', async () => {
    state.user = { id: 'parent-2' }
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: false, error: 'You can only change your own child.' })
    expect(state.made).toEqual([])
  })

  it('a link that is still waiting is not enough', async () => {
    state.links = [{ child_id: 'child-1', parent_id: 'parent-1', status: 'pending' }]
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: false, error: 'You can only change your own child.' })
    expect(state.made).toEqual([])
  })

  it('nobody signed in is told to sign in, and nothing is made', async () => {
    state.user = null
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: false, error: 'Sign in again.' })
    expect(state.made).toEqual([])
  })

  it('a PIN that is not 4 digits is refused before anything else', async () => {
    for (const pin of ['', '123', '12345', 'abcd', '12 4']) expect(await setChildPin('child-1', pin), pin).toEqual({ ok: false, error: 'Use 4 digits.' })
    expect(state.made).toEqual([])
  })
})
