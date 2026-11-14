// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isIndependent, isOwnRecord } from '@jemma/profiling/own-names'

// Which child a learner's screens answer when the child's school does not use Jemma (P99): the child itself, always, whatever the cookie `jemma_ws`
// says, because its own record IS its My own (there is no school workspace and no twin). For the learner's own session and for a parent's hand-over
// (a parent cannot read the school of a child under row level security, so the kind of the school is read apart). The database, the cookies and the
// hand-over are stand-ins: no database, no browser.

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  userId: 'u-kagiso' as string | null,
  cookies: {} as Record<string, string>,
  handover: null as { sessionId: string; childId: string } | null,
  children: [] as Row[],
  schoolKinds: {} as Record<string, string>,
  adminReads: [] as string[],
  queries: [] as { table: string; ops: unknown[][] }[],
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (state.cookies[name] === undefined ? undefined : { value: state.cookies[name] }) }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('../lib/handover', () => ({ HANDOVER_COOKIE: 'jemma_handover', verifyHandover: async () => state.handover }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            state.adminReads.push(`${table}:${id}`)
            return { data: state.schoolKinds[id] ? { kind: state.schoolKinds[id] } : null, error: null }
          },
        }),
      }),
    }),
  }),
}))
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
        return found.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: found[0] ?? null, error: null }
      }
      return chain
    },
  }),
}))

import { myChild } from '../lib/data/p27'

// The embedded school is what the learner's own client reads (the learner's profile is in the school): its name and kind.
const INDEPENDENT = { id: 'child-kagiso', school_id: 'school-own', user_id: 'u-kagiso', private_of: null, first_name: 'Kagiso', grade: 8, parent_first_name: 'Zanele', parent_relation: null, schools: { name: "Kagiso's own", kind: 'private' } }
const SCHOOL_CHILD = { id: 'child-school', school_id: 'school-hill', user_id: 'u-amina', private_of: null, first_name: 'Amina', grade: 6, parent_first_name: 'Thandi', parent_relation: 'mum', schools: { name: 'Hillview Primary', kind: 'school' } }
const TWIN = { id: 'child-own', school_id: 'school-amina-own', user_id: 'u-amina', private_of: 'child-school', first_name: 'Amina', grade: 6, parent_first_name: 'Thandi', parent_relation: 'mum', schools: null }

beforeEach(() => {
  state.userId = 'u-kagiso'
  state.cookies = {}
  state.handover = null
  state.children = [{ ...INDEPENDENT }]
  state.schoolKinds = { 'school-own': 'private', 'school-hill': 'school', 'school-amina-own': 'private' }
  state.adminReads = []
  state.queries = []
})

describe('an independent child in their own session', () => {
  it('answers the child itself whatever the cookie says (none, school, own, odd)', async () => {
    for (const cookie of [undefined, 'school', 'own', 'OWN', '1']) {
      if (cookie === undefined) delete state.cookies.jemma_ws
      else state.cookies.jemma_ws = cookie
      const { child } = await myChild()
      expect(child.id, String(cookie)).toBe('child-kagiso')
    }
  })

  it('stays the child itself even if a row points at it as a twin (there is no twin of a twin)', async () => {
    state.children = [{ ...INDEPENDENT }, { ...TWIN, id: 'child-odd', private_of: 'child-kagiso', schools: null }]
    state.cookies.jemma_ws = 'own'
    expect((await myChild()).child.id).toBe('child-kagiso')
  })

  it('looks for no twin: no query asks for a child by private_of', async () => {
    state.cookies.jemma_ws = 'own'
    await myChild()
    const byTwin = state.queries.filter((q) => q.ops.some((o) => o[0] === 'eq' && o[1] === 'private_of'))
    expect(byTwin).toEqual([])
  })

  it('is an own record and independent, so the learner’s screens have no switch', async () => {
    const { child } = await myChild()
    expect(isOwnRecord(child)).toBe(true)
    expect(isIndependent(child)).toBe(true)
  })

  it('reads the kind of the school from the learner’s own client when it is there (no second read)', async () => {
    await myChild()
    expect(state.adminReads).toEqual([])
  })

  it('a school learner with no twin is still a school child: not an own record', async () => {
    state.userId = 'u-amina'
    state.children = [{ ...SCHOOL_CHILD }]
    state.cookies.jemma_ws = 'own'
    const { child } = await myChild()
    expect(child.id).toBe('child-school')
    expect(isOwnRecord(child)).toBe(false)
    expect(isIndependent(child)).toBe(false)
  })

  it('a school learner with a twin and the cookie "own" still gets the twin', async () => {
    state.userId = 'u-amina'
    state.children = [{ ...SCHOOL_CHILD }, { ...TWIN }]
    state.cookies.jemma_ws = 'own'
    const { child } = await myChild()
    expect(child.id).toBe('child-own')
    expect(isOwnRecord(child)).toBe(true)
    expect(isIndependent(child)).toBe(false)
  })
})

describe('an independent child on a parent’s phone after hand-over', () => {
  beforeEach(() => {
    // A parent's session: the parent has no child of their own login, and row level security hides the school of the child from a parent.
    state.userId = 'u-zanele'
    state.children = [{ ...INDEPENDENT, user_id: null, schools: null }]
    state.handover = { sessionId: 'own', childId: 'child-kagiso' }
  })

  it('answers the child itself whatever the cookie says, and reads the kind of its school apart', async () => {
    state.cookies.jemma_ws = 'school'
    const { child } = await myChild()
    expect(child.id).toBe('child-kagiso')
    expect(isOwnRecord(child)).toBe(true)
    expect(isIndependent(child)).toBe(true)
    expect(state.adminReads).toEqual(['schools:school-own'])
  })

  it('a child of a school is a school child there too (the kind is read, and it is "school")', async () => {
    state.children = [{ ...SCHOOL_CHILD, schools: null }]
    state.handover = { sessionId: 'own', childId: 'child-school' }
    const { child } = await myChild()
    expect(isOwnRecord(child)).toBe(false)
    expect(state.adminReads).toEqual(['schools:school-hill'])
  })

  it('a school that cannot be read counts as a school (the screens never show less than a school child gets)', async () => {
    state.schoolKinds = {}
    const { child } = await myChild()
    expect(child.id).toBe('child-kagiso')
    expect(isOwnRecord(child)).toBe(false)
  })

  it('the twin of a school child never needs the second read: it is an own record by private_of', async () => {
    state.children = [{ ...TWIN }]
    state.handover = { sessionId: 'own', childId: 'child-own' }
    const { child } = await myChild()
    expect(isOwnRecord(child)).toBe(true)
    expect(state.adminReads).toEqual([])
  })
})
