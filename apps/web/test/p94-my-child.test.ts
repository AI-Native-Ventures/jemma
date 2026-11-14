// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Which child a learner's screens answer: the school child ("My school") or the private twin ("My own"), by the cookie `jemma_ws`, for the
// learner's own session and for a parent's hand-over. The database, the cookies and the hand-over are stand-ins: no database, no browser.

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  userId: 'u-amina' as string | null,
  cookies: {} as Record<string, string>,
  handover: null as { sessionId: string; childId: string } | null,
  children: [] as Row[],
  queries: [] as { table: string; ops: unknown[][] }[],
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (state.cookies[name] === undefined ? undefined : { value: state.cookies[name] }) }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('../lib/handover', () => ({ HANDOVER_COOKIE: 'jemma_handover', verifyHandover: async () => state.handover }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    from: (table: string) => {
      const query = { table, ops: [] as unknown[][] }
      state.queries.push(query)
      const rows = () => {
        let found = table === 'children' ? state.children : []
        for (const [method, ...args] of query.ops) {
          if (method === 'eq') found = found.filter((r) => r[args[0] as string] === args[1])
          if (method === 'is') found = found.filter((r) => (r[args[0] as string] ?? null) === args[1])
        }
        return found
      }
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is']) chain[method] = (...args: unknown[]) => (query.ops.push([method, ...args]), chain)
      chain.maybeSingle = async () => {
        const found = rows()
        // Like the database: two rows where one was expected is an error, and the caller gets no child.
        return found.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: found[0] ?? null, error: null }
      }
      return chain
    },
  }),
}))

import { myChild } from '../lib/data/p27'

const SCHOOL_CHILD = { id: 'child-school', user_id: 'u-amina', private_of: null, first_name: 'Amina', grade: 6, parent_first_name: 'Thandi', parent_relation: 'mum' }
const TWIN = { id: 'child-own', user_id: 'u-amina', private_of: 'child-school', first_name: 'Amina', grade: 6, parent_first_name: 'Thandi', parent_relation: 'mum' }

beforeEach(() => {
  state.userId = 'u-amina'
  state.cookies = {}
  state.handover = null
  state.children = [{ ...SCHOOL_CHILD }, { ...TWIN }]
  state.queries = []
})

const idOf = async () => (await myChild()).child.id

describe('a learner in their own session', () => {
  it('with no cookie, or the cookie "school", answers the school child, though two children have this login', async () => {
    expect(await idOf()).toBe('child-school')
    state.cookies.jemma_ws = 'school'
    expect(await idOf()).toBe('child-school')
  })

  it('with the cookie "own" answers the twin, found by the school child', async () => {
    state.cookies.jemma_ws = 'own'
    const { child } = await myChild()
    expect(child.id).toBe('child-own')
    expect(child).toMatchObject({ first_name: 'Amina', parent_relation: 'mum', private_of: 'child-school' })
    expect(state.queries.some((q) => q.ops.some((o) => o[0] === 'eq' && o[1] === 'private_of' && o[2] === 'child-school'))).toBe(true)
  })

  it('"own" for a learner who has no twin yet answers the school child', async () => {
    state.cookies.jemma_ws = 'own'
    state.children = [{ ...SCHOOL_CHILD }]
    expect(await idOf()).toBe('child-school')
  })

  it('a cookie that holds anything else is "school"', async () => {
    for (const odd of ['', 'OWN', 'own;school', 'both', '1']) {
      state.cookies.jemma_ws = odd
      expect(await idOf(), odd).toBe('child-school')
    }
  })

  it('the first look for the learner always asks for the school child (private_of is null), never just by login', async () => {
    await myChild()
    const first = state.queries.find((q) => q.table === 'children')!
    expect(first.ops).toContainEqual(['eq', 'user_id', 'u-amina'])
    expect(first.ops).toContainEqual(['is', 'private_of', null])
  })

  it('nobody signed in is not found', async () => {
    state.userId = null
    await expect(myChild()).rejects.toThrow('NOT_FOUND')
  })
})

describe('a parent after hand-over', () => {
  beforeEach(() => {
    // A parent's session: the parent has no child of their own login.
    state.userId = 'u-thandi'
    state.children = [{ ...SCHOOL_CHILD }, { ...TWIN }]
  })

  it('without the cookie of a hand-over is not found', async () => {
    await expect(myChild()).rejects.toThrow('NOT_FOUND')
  })

  it('the cookie "school" answers the school child, and "own" the twin', async () => {
    state.handover = { sessionId: 's1', childId: 'child-school' }
    expect(await idOf()).toBe('child-school')
    state.cookies.jemma_ws = 'school'
    expect(await idOf()).toBe('child-school')
    state.cookies.jemma_ws = 'own'
    expect(await idOf()).toBe('child-own')
  })

  it('a hand-over of one of the twin\'s own sessions answers the twin whatever the cookie says: the signed cookie names the child of that session', async () => {
    state.handover = { sessionId: 's-own', childId: 'child-own' }
    expect(await idOf()).toBe('child-own')
    state.cookies.jemma_ws = 'school'
    expect(await idOf()).toBe('child-own')
    state.cookies.jemma_ws = 'own'
    expect(await idOf()).toBe('child-own')
  })

  it('"own" for a child with no twin answers the child the cookie names', async () => {
    state.cookies.jemma_ws = 'own'
    state.children = [{ ...SCHOOL_CHILD }]
    state.handover = { sessionId: 's1', childId: 'child-school' }
    expect(await idOf()).toBe('child-school')
  })

  it('a hand-over for a child the parent cannot read is not found', async () => {
    state.children = []
    state.handover = { sessionId: 's1', childId: 'child-school' }
    await expect(myChild()).rejects.toThrow('NOT_FOUND')
  })
})
