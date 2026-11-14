// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The switch between "My school" and "My own", and adding a grade to "My own". The learner, the private workspace and the cookies are stand-ins:
// no database, no browser. Neither action throws to the screen.

const state = vi.hoisted(() => ({
  child: { id: 'child-school', grade: 6 } as { id: string; grade: number },
  twinClasses: [] as { id: string; grade: number }[],
  ensureFails: null as Error | null,
  addFails: null as Error | null,
  calls: [] as string[],
  cookieSet: [] as { name: string; value: string; options: Record<string, unknown> }[],
  revalidated: [] as string[],
  who: 'ok' as 'ok' | 'nobody',
}))

const { Refused } = vi.hoisted(() => ({ Refused: class extends Error {} }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => state.cookieSet.push({ name, value, options }) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string, kind?: string) => state.revalidated.push(kind ? `${path} ${kind}` : path) }))
vi.mock('@/lib/data/p27', () => ({
  schoolChildOfRequest: async () => {
    if (state.who === 'nobody') throw new Error('NOT_FOUND')
    return { supabase: {}, userId: 'u-amina', child: state.child }
  },
}))
vi.mock('@/lib/own-workspace', () => ({
  OWN_GRADES: { from: 1, to: 12 },
  OwnWorkspaceError: Refused,
  ensureOwnWorkspace: async (childId: string, actor: string) => {
    state.calls.push(`ensure ${childId} ${actor}`)
    if (state.ensureFails) throw state.ensureFails
    return 'child-own'
  },
  listOwnClasses: async (twinId: string) => (state.calls.push(`list ${twinId}`), state.twinClasses),
  addOwnGrade: async (twinId: string, grade: number, actor: string) => {
    state.calls.push(`add ${twinId} ${grade} ${actor}`)
    if (state.addFails) throw state.addFails
    return { classId: 'class-new', grade, created: true, topics: 24 }
  },
}))

import { addMyGrade, setWorkspace } from '../app/k/own-actions'

beforeEach(() => {
  state.child = { id: 'child-school', grade: 6 }
  state.twinClasses = []
  state.ensureFails = null
  state.addFails = null
  state.calls = []
  state.cookieSet = []
  state.revalidated = []
  state.who = 'ok'
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('setWorkspace', () => {
  it('"own" opens the private workspace, adds the school child\'s grade when it has no class, and sets the cookie', async () => {
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['ensure child-school u-amina', 'list child-own', 'add child-own 6 u-amina'])
    expect(state.cookieSet).toEqual([{ name: 'jemma_ws', value: 'own', options: expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }) }])
    expect(state.revalidated).toContain('/k layout')
  })

  it('"own" adds no grade when the private workspace already has one', async () => {
    state.twinClasses = [{ id: 'c7', grade: 7 }]
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['ensure child-school u-amina', 'list child-own'])
    expect(state.cookieSet[0]!.value).toBe('own')
  })

  it('"own" for a learner whose grade has no CAPS map (Grade R) opens it empty: the learner adds a grade themselves', async () => {
    state.child = { id: 'child-school', grade: 0 }
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['ensure child-school u-amina', 'list child-own'])
    expect(state.cookieSet[0]!.value).toBe('own')
  })

  it('"school" only sets the cookie: no database, nothing made', async () => {
    expect(await setWorkspace('school')).toEqual({ ok: true })
    expect(state.calls).toEqual([])
    expect(state.cookieSet).toEqual([{ name: 'jemma_ws', value: 'school', options: expect.objectContaining({ httpOnly: true }) }])
  })

  it('anything else is refused and sets nothing', async () => {
    for (const odd of ['both', '', null, undefined, 1, 'OWN'] as unknown[]) {
      const res = await setWorkspace(odd as 'own')
      expect(res).toEqual({ ok: false, message: expect.stringMatching(/\w/) })
    }
    expect(state.cookieSet).toEqual([])
    expect(state.calls).toEqual([])
  })

  it('when the workspace cannot be opened the cookie is not set, the words are plain and nothing is thrown', async () => {
    state.ensureFails = new Error('connection refused')
    const res = await setWorkspace('own')
    expect(res).toEqual({ ok: false, message: 'Could not open My own. Try again.' })
    expect(state.cookieSet).toEqual([])
    state.ensureFails = new Refused('You cannot open My own for this learner.')
    expect(await setWorkspace('own')).toEqual({ ok: false, message: 'You cannot open My own for this learner.' })
    expect(state.cookieSet).toEqual([])
  })

  it('a request from nobody (not a learner, not a hand-over) is an answer, not a thrown error', async () => {
    state.who = 'nobody'
    expect((await setWorkspace('own')).ok).toBe(false)
    expect(state.cookieSet).toEqual([])
  })
})

describe('addMyGrade', () => {
  it('opens the private workspace if needed, adds the grade for the person acting and says what was added', async () => {
    expect(await addMyGrade(7)).toEqual({ ok: true, classId: 'class-new', created: true, topics: 24 })
    expect(state.calls).toEqual(['ensure child-school u-amina', 'add child-own 7 u-amina'])
    expect(state.revalidated).toContain('/k layout')
    expect(state.cookieSet).toEqual([])
  })

  it('Grade 13, Grade 0 and a grade that is not a whole number are refused before anything is made', async () => {
    for (const bad of [13, 0, -1, 6.5, Number.NaN, '7', null] as unknown[]) {
      expect(await addMyGrade(bad as number), String(bad)).toEqual({ ok: false, message: 'Pick a grade from 1 to 12.' })
    }
    expect(state.calls).toEqual([])
  })

  it('a refusal of the workspace is said in its own words, any other failure in plain ones, and nothing is thrown', async () => {
    state.addFails = new Refused('Pick a grade from 1 to 12.')
    expect(await addMyGrade(7)).toEqual({ ok: false, message: 'Pick a grade from 1 to 12.' })
    state.addFails = new Error('timeout')
    expect(await addMyGrade(7)).toEqual({ ok: false, message: 'Could not add that grade. Try again.' })
  })
})
