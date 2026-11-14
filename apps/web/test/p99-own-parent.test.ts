// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// What a parent's screens know about a child whose school does not use Jemma (P99): the child is on their own only when the parent's own client can read
// the child, the child is not a twin, and the school is a personal one (read with the service client, because a parent cannot read a school). The two
// clients and the own-workspace reads are stand-ins: no database.

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  children: [] as Row[],
  schools: {} as Record<string, string>,
  logins: [] as Row[],
  adminReads: [] as string[],
  overview: [] as Row[],
}))

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T): T => fn }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    from: () => {
      const filters: [string, unknown][] = []
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (key: string, value: unknown) => (filters.push([key, value]), chain)
      chain.maybeSingle = async () => ({ data: state.children.find((c) => filters.every(([k, v]) => c[k] === v)) ?? null, error: null })
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = []
      let ids: string[] | null = null
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (key: string, value: unknown) => (filters.push([key, value]), chain)
      chain.in = (_key: string, values: string[]) => ((ids = values), chain)
      chain.maybeSingle = async () => {
        state.adminReads.push(table)
        if (table === 'schools') {
          const id = filters.find(([k]) => k === 'id')![1] as string
          return { data: state.schools[id] ? { kind: state.schools[id] } : null, error: null }
        }
        return { data: state.logins.find((l) => filters.every(([k, v]) => l[k] === v)) ?? null, error: null }
      }
      chain.then = (resolve: (v: unknown) => unknown) => {
        state.adminReads.push(`${table}:in`)
        return Promise.resolve({ data: Object.entries(state.schools).filter(([id]) => ids?.includes(id)).map(([id, kind]) => ({ id, kind })), error: null }).then(resolve)
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/own-workspace', () => ({ getOwnOverview: async () => state.overview }))

import { aloneOf, getAloneSummary, kindOfSchool, kindsOfSchools } from '../lib/data/own-parent'

const KAGISO = { id: 'child-kagiso', first_name: 'Kagiso', grade: 8, school_id: 'school-own', private_of: null }
const AMINA = { id: 'child-amina', first_name: 'Amina', grade: 6, school_id: 'school-hill', private_of: null }
const TWIN = { id: 'child-twin', first_name: 'Amina', grade: 6, school_id: 'school-twin', private_of: 'child-amina' }

beforeEach(() => {
  state.children = [{ ...KAGISO }, { ...AMINA }, { ...TWIN }]
  state.schools = { 'school-own': 'private', 'school-hill': 'school', 'school-twin': 'private' }
  state.logins = []
  state.adminReads = []
  state.overview = []
})

describe('kindOfSchool and kindsOfSchools', () => {
  it('read the kind of a school, and a school that cannot be read is a school', async () => {
    expect(await kindOfSchool('school-own')).toBe('private')
    expect(await kindOfSchool('school-hill')).toBe('school')
    expect(await kindOfSchool('school-gone')).toBe('school')
    const kinds = await kindsOfSchools(['school-own', 'school-hill', 'school-own'])
    expect(kinds.get('school-own')).toBe('private')
    expect(kinds.get('school-hill')).toBe('school')
    expect((await kindsOfSchools([])).size).toBe(0)
  })
})

describe('aloneOf', () => {
  it('a child of a personal school is on their own', async () => {
    expect(await aloneOf('child-kagiso')).toEqual({ id: 'child-kagiso', firstName: 'Kagiso', grade: 8 })
  })

  it('a child of a school is not', async () => {
    expect(await aloneOf('child-amina')).toBeNull()
  })

  it('a twin is not a child to the parent, whatever its school is', async () => {
    expect(await aloneOf('child-twin')).toBeNull()
  })

  it('a child the parent cannot read (not linked) is null, and the school is never read for it', async () => {
    state.children = []
    expect(await aloneOf('child-kagiso')).toBeNull()
    expect(state.adminReads).toEqual([])
  })
})

describe('getAloneSummary', () => {
  it('has the child, the grades with their counts and the sign-in code', async () => {
    state.overview = [{ classId: 'c8', grade: 8, name: 'Grade 8 (my own)', caps: true, topics: 40, score: { right: 3, asked: 5 } }]
    state.logins = [{ child_id: 'child-kagiso', code: 'K7M2QX' }]
    expect(await getAloneSummary('child-kagiso')).toEqual({
      id: 'child-kagiso', firstName: 'Kagiso', grade: 8, grades: state.overview, loginCode: 'K7M2QX',
    })
  })

  it('has no code when none was made', async () => {
    expect((await getAloneSummary('child-kagiso'))?.loginCode).toBeNull()
  })

  it('is null for a child of a school, and reads no login for it', async () => {
    expect(await getAloneSummary('child-amina')).toBeNull()
    expect(state.adminReads).not.toContain('child_logins')
  })
})
