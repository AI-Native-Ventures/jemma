// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P95b: a learner's screen asks "who is this learner?" from the layout, from the page and from the data loaders, and each ask used to be the
// same three trips to the database (the login, the child, the private twin). `myChild` is wrapped in React's `cache`, which Next keeps for one
// request: the second and third ask of the same draw are the first one's answer. Here `cache` is a stand-in that remembers until a new request
// begins (outside Next it does not remember at all, which is why the other tests of `myChild` see every ask). No database, no browser.

const state = vi.hoisted(() => ({
  cookies: { jemma_ws: 'own' } as Record<string, string>,
  trips: [] as string[],
  memos: [] as { forget: () => void }[],
}))

vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
    let memo: { value: unknown } | null = null
    state.memos.push({ forget: () => (memo = null) })
    return ((...args: never[]) => (memo ??= { value: fn(...args) }).value) as T
  },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (state.cookies[name] === undefined ? undefined : { value: state.cookies[name] }) }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('../lib/handover', () => ({ HANDOVER_COOKIE: 'jemma_handover', verifyHandover: async () => null }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => (state.trips.push('login'), { data: { user: { id: 'u-amina' } } }) },
    from: (table: string) => {
      state.trips.push(`from ${table}`)
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is']) chain[method] = () => chain
      chain.maybeSingle = async () => ({ data: { id: 'child-own', first_name: 'Amina', grade: 6, private_of: 'child-school' }, error: null })
      return chain
    },
  }),
}))

import { myChild } from '../lib/data/p27'

/** A new request begins: whatever `cache` remembered is forgotten. */
const newRequest = () => state.memos.forEach((m) => m.forget())

beforeEach(() => {
  state.trips = []
  newRequest()
})

describe('myChild within one request', () => {
  it('answers the second and the third ask with the first one\'s answer, and asks the database once', async () => {
    const first = await myChild()
    const tripsForOne = state.trips.length
    expect(tripsForOne).toBeGreaterThan(0)
    const second = await myChild()
    const third = await myChild()
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(state.trips).toHaveLength(tripsForOne)
  })

  it('asks again in the next request: nothing is kept from one request to the next', async () => {
    await myChild()
    const tripsForOne = state.trips.length
    newRequest()
    await myChild()
    expect(state.trips).toHaveLength(tripsForOne * 2)
  })
})
