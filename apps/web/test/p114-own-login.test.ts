// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A learner who signed up alone and linked a parent with a code has a login of their own (P114). The parent must not be able to replace it: `setChildPin`
// refuses when the child has a login and no code made by a parent behind it (a new code would take the login away from the learner), and the parent's page
// summary says so (`ownLogin`) so the "Make a sign-in code" button is not drawn. A child whose code a parent made, and a child with no login, are as before.
// The two clients and the own-workspace reads are stand-ins: no database.

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  user: { id: 'parent-1' } as { id: string } | null,
  links: [{ child_id: 'child-1', parent_id: 'parent-1', status: 'approved' }] as Row[],
  children: [] as Row[],
  schools: {} as Record<string, string>,
  logins: [] as Row[],
  made: [] as string[],
  deleted: [] as string[],
}))

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T): T => fn }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/child-login', () => ({
  createChildLogin: async (_admin: unknown, childId: string) => {
    state.made.push(childId)
    return { code: 'K7M2QX' }
  },
}))
vi.mock('@/lib/own-workspace', () => ({ getOwnOverview: async () => [] }))

/** A table in memory with `select`, `eq`, `in` and `maybeSingle`, enough for the reads these two functions make. */
const table = (rows: Row[]) => {
  const filters: [string, unknown][] = []
  let ids: unknown[] | null = null
  const hit = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v) && (!ids || ids.includes(r.id)))
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (key: string, value: unknown) => (filters.push([key, value]), chain)
  chain.in = (_key: string, values: unknown[]) => ((ids = values), chain)
  chain.update = () => ({ eq: async () => ({ error: null }) })
  chain.maybeSingle = async () => ({ data: hit()[0] ?? null, error: null })
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: hit(), error: null }).then(resolve)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (name: string) => (name === 'parent_links' ? table(state.links) : table(state.children)),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    auth: { admin: { deleteUser: async (id: string) => (state.deleted.push(id), { error: null }) } },
    from: (name: string) => {
      if (name === 'schools') return table(Object.entries(state.schools).map(([id, kind]) => ({ id, kind })))
      if (name === 'child_logins') return table(state.logins)
      return table(state.children)
    },
  }),
}))

import { setChildPin } from '../app/p/[childId]/settings/actions'
import { getAloneSummary } from '../lib/data/own-parent'

const NEO = { id: 'child-1', first_name: 'Neo', grade: 5, school_id: 'school-own', private_of: null, user_id: 'learner-1' }

beforeEach(() => {
  state.user = { id: 'parent-1' }
  state.links = [{ child_id: 'child-1', parent_id: 'parent-1', status: 'approved' }]
  state.children = [{ ...NEO }]
  state.schools = { 'school-own': 'private' }
  state.logins = []
  state.made = []
  state.deleted = []
})

describe('setChildPin for a learner with a login of their own', () => {
  it('is refused in words, and nothing is made or removed', async () => {
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: false, error: 'This learner signs in with their own account.' })
    expect(state.made).toEqual([])
    expect(state.deleted).toEqual([])
  })

  it('a child whose code a parent made earlier gets a new code, as before (the old login is removed first)', async () => {
    state.logins = [{ child_id: 'child-1', user_id: 'made-by-parent', code: 'ABC234' }]
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: true, code: 'K7M2QX' })
    expect(state.deleted).toEqual(['made-by-parent'])
    expect(state.made).toEqual(['child-1'])
  })

  it('a child with no login at all gets a code, as before', async () => {
    state.children = [{ ...NEO, user_id: null }]
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: true, code: 'K7M2QX' })
    expect(state.made).toEqual(['child-1'])
  })

  it('the parent’s own link is still checked first', async () => {
    state.links = []
    expect(await setChildPin('child-1', '4321')).toEqual({ ok: false, error: 'You can only change your own child.' })
  })
})

describe('getAloneSummary for a linked learner', () => {
  it('says ownLogin for a login that no parent made', async () => {
    expect((await getAloneSummary('child-1'))?.ownLogin).toBe(true)
  })

  it('leaves ownLogin out when a parent made the child’s code, or the child has no login', async () => {
    state.logins = [{ child_id: 'child-1', user_id: 'made-by-parent', code: 'ABC234' }]
    const made = await getAloneSummary('child-1')
    expect(made).not.toHaveProperty('ownLogin')
    expect(made?.loginCode).toBe('ABC234')
    state.logins = []
    state.children = [{ ...NEO, user_id: null }]
    expect(await getAloneSummary('child-1')).not.toHaveProperty('ownLogin')
  })
})
