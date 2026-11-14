// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "My child's school doesn't use Jemma" (P99): the parent's action `addChildAlone({ firstName, grade, country })` checks that a parent is signed in,
// that the country is one the app knows, hands the rest to the work in the profiling package, and sends the parent to the child's page. A plain refusal
// comes back as words. The sign-in check and the work are stand-ins: no database, no browser.

const state = vi.hoisted(() => ({
  made: [] as { parentId: string; firstName: unknown; grade: unknown; country: unknown }[],
  fail: null as Error | null,
  signedIn: true,
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/auth', () => ({
  requireRole: async (role: string) => {
    if (!state.signedIn) throw new Error(`REDIRECT /sign-in (needs ${role})`)
    return { userId: 'parent-1', profile: { display_name: 'Zanele M' } }
  },
}))
vi.mock('@/lib/data/p22', () => ({ cleanCode: (c: string) => c, createLinkRequest: vi.fn(), findClass: vi.fn() }))
vi.mock('@/lib/own-workspace', () => {
  class OwnWorkspaceError extends Error {}
  return {
    OwnWorkspaceError,
    addChildAlone: async (input: { parentId: string; firstName: unknown; grade: unknown; country: unknown }) => {
      state.made.push(input)
      if (state.fail) throw state.fail
      return { childId: `child-${state.made.length}`, schoolId: 's', classId: 'c', grade: input.grade, topics: 40 }
    },
  }
})

import { addChildAlone } from '../app/p/add/actions'
import { OwnWorkspaceError } from '../lib/own-workspace'

beforeEach(() => {
  state.made = []
  state.fail = null
  state.signedIn = true
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('addChildAlone (the action)', () => {
  it('makes the child as the signed-in parent and sends the parent to the child’s page', async () => {
    await expect(addChildAlone({ firstName: 'Kagiso', grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /p/child-1')
    expect(state.made).toEqual([{ parentId: 'parent-1', firstName: 'Kagiso', grade: 5, country: 'ZA' }])
  })

  it('a parent may add a second child: it is a second call and lands on the second child', async () => {
    await expect(addChildAlone({ firstName: 'Kagiso', grade: 8, country: 'ZA' })).rejects.toThrow('REDIRECT /p/child-1')
    await expect(addChildAlone({ firstName: 'Naledi', grade: 3, country: 'KE' })).rejects.toThrow('REDIRECT /p/child-2')
    expect(state.made.map((m) => m.firstName)).toEqual(['Kagiso', 'Naledi'])
  })

  it('a person who is not a signed-in parent never reaches the work', async () => {
    state.signedIn = false
    await expect(addChildAlone({ firstName: 'Kagiso', grade: 5, country: 'ZA' })).rejects.toThrow('REDIRECT /sign-in')
    expect(state.made).toEqual([])
  })

  it('a country the app does not know is refused in words, and nothing is made', async () => {
    for (const country of ['', 'XX', 'za', 'South Africa', 'ZZZ']) {
      expect(await addChildAlone({ firstName: 'Kagiso', grade: 5, country }), country).toEqual({ ok: false, message: 'Pick the country.' })
    }
    expect(state.made).toEqual([])
  })

  it('the countries the app already knows are all accepted (South Africa, Kenya, Other)', async () => {
    for (const country of ['ZA', 'KE', 'ZZ']) await expect(addChildAlone({ firstName: 'Kagiso', grade: 5, country })).rejects.toThrow('REDIRECT /p/')
    expect(state.made.map((m) => m.country)).toEqual(['ZA', 'KE', 'ZZ'])
  })

  it('a plain refusal of the work (no name, a bad grade) comes back as its own words, with no redirect', async () => {
    state.fail = new OwnWorkspaceError('Type your child’s first name.')
    expect(await addChildAlone({ firstName: '', grade: 5, country: 'ZA' })).toEqual({ ok: false, message: 'Type your child’s first name.' })
    state.fail = new OwnWorkspaceError('Pick a grade from 1 to 12.')
    expect(await addChildAlone({ firstName: 'Kagiso', grade: 0, country: 'ZA' })).toEqual({ ok: false, message: 'Pick a grade from 1 to 12.' })
  })

  it('any other failure is one plain sentence, never the reason of the database', async () => {
    state.fail = new Error('duplicate key value violates unique constraint "schools_pkey"')
    const result = await addChildAlone({ firstName: 'Kagiso', grade: 5, country: 'ZA' })
    expect(result).toEqual({ ok: false, message: 'Could not add your child. Try again.' })
    expect(JSON.stringify(result)).not.toContain('duplicate')
  })
})
