// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The switch between "My school" and "My own", and adding a grade to "My own". The learner, the private workspace and the cookies are stand-ins:
// no database, no browser. Neither action throws to the screen. P95b: the switch sets cookies and nothing else when it can (the second time to
// My own, and every time to My school), and never revalidates the layout: setting a cookie in an action already draws the page again.

const state = vi.hoisted(() => ({
  child: { id: 'child-school', grade: 6 } as { id: string; grade: number },
  twinClasses: [] as { id: string; grade: number }[],
  ensureFails: null as Error | null,
  addFails: null as Error | null,
  calls: [] as string[],
  cookieSet: [] as { name: string; value: string; options: Record<string, unknown> }[],
  revalidated: [] as string[],
  who: 'ok' as 'ok' | 'nobody',
  /** The cookies the request brings, by name. */
  jar: {} as Record<string, string>,
  /** The user id in the session's token, or null when there is no session. */
  sessionUser: null as string | null,
}))

const { Refused } = vi.hoisted(() => ({ Refused: class extends Error {} }))

/** A token with a payload only, the way a session's access token looks. */
const tokenFor = (sub: string) => {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'ES256' })}.${part({ sub })}.signature`
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in state.jar ? { name, value: state.jar[name] } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => state.cookieSet.push({ name, value, options }),
  }),
}))
// The session is read from its cookie (no network): the only thing the switch asks the client. Any other call is counted, and must stay at none.
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      getSession: async () => ({ data: { session: state.sessionUser ? { access_token: tokenFor(state.sessionUser) } : null } }),
      getUser: async () => (state.calls.push('network getUser'), { data: { user: null } }),
    },
    from: () => (state.calls.push('database from'), { select: () => ({}) }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string, kind?: string) => state.revalidated.push(kind ? `${path} ${kind}` : path) }))
vi.mock('@/lib/data/p27', () => ({
  schoolChildOfRequest: async () => {
    state.calls.push('find the learner')
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
import { OWN_MARKER_COOKIE, signOwnMarker } from '../lib/own-marker'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})

beforeEach(() => {
  state.jar = {}
  state.sessionUser = 'u-amina'
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

const marked = async (userId = 'u-amina') => ({ [OWN_MARKER_COOKIE]: await signOwnMarker(userId) })
const cookieNamed = (name: string) => state.cookieSet.find((c) => c.name === name)

describe('setWorkspace, the first time to My own', () => {
  it('"own" opens the private workspace, adds the school child\'s grade when it has no class, and sets the workspace cookie and the marker', async () => {
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['find the learner', 'ensure child-school u-amina', 'list child-own', 'add child-own 6 u-amina'])
    expect(cookieNamed('jemma_ws')).toEqual({ name: 'jemma_ws', value: 'own', options: expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }) })
    expect(cookieNamed(OWN_MARKER_COOKIE)).toEqual({ name: OWN_MARKER_COOKIE, value: await signOwnMarker('u-amina'), options: expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }) })
  })

  it('does not revalidate the layout: the cookie already makes the action draw the page again, and a second draw is the double work P95b removed', async () => {
    await setWorkspace('own')
    await setWorkspace('school')
    expect(state.revalidated).toEqual([])
  })

  it('"own" adds no grade when the private workspace already has one', async () => {
    state.twinClasses = [{ id: 'c7', grade: 7 }]
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['find the learner', 'ensure child-school u-amina', 'list child-own'])
    expect(cookieNamed('jemma_ws')!.value).toBe('own')
  })

  it('"own" for a learner whose grade has no CAPS map (Grade R) opens it empty: the learner adds a grade themselves', async () => {
    state.child = { id: 'child-school', grade: 0 }
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['find the learner', 'ensure child-school u-amina', 'list child-own'])
    expect(cookieNamed('jemma_ws')!.value).toBe('own')
  })

  it('when the workspace cannot be opened no cookie is set (not the marker either), the words are plain and nothing is thrown', async () => {
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

describe('setWorkspace, every switch after the first (P95b: one cookie, nothing asked of the database)', () => {
  it('"school" only sets the cookie: no database, no session read, nothing made', async () => {
    expect(await setWorkspace('school')).toEqual({ ok: true })
    expect(state.calls).toEqual([])
    expect(state.cookieSet).toEqual([{ name: 'jemma_ws', value: 'school', options: expect.objectContaining({ httpOnly: true }) }])
  })

  it('"own" again, by the login that opened it, only sets the cookie: not one call to the learner, the private workspace, the classes or the network', async () => {
    state.jar = await marked()
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual([])
    expect(state.cookieSet).toEqual([{ name: 'jemma_ws', value: 'own', options: expect.objectContaining({ httpOnly: true }) }])
  })

  it('a second learner on the same device is not skipped past the first-time work: the marker is of the first login', async () => {
    state.jar = await marked('u-first')
    state.sessionUser = 'u-second'
    expect(await setWorkspace('own')).toEqual({ ok: true })
    expect(state.calls).toEqual(['find the learner', 'ensure child-school u-amina', 'list child-own', 'add child-own 6 u-amina'])
  })

  it('a forged marker, or a marker with no session behind it, is not believed', async () => {
    state.jar = { [OWN_MARKER_COOKIE]: 'u-amina.0000' }
    await setWorkspace('own')
    expect(state.calls[0]).toBe('find the learner')
    state.calls = []
    state.jar = await marked()
    state.sessionUser = null
    await setWorkspace('own')
    expect(state.calls[0]).toBe('find the learner')
  })

  it('a hand-over on this phone (a grown-up\'s) always takes the long way, and leaves no marker for the grown-up', async () => {
    state.jar = { ...(await marked()), jemma_handover: 'whatever.child.1.sig' }
    await setWorkspace('own')
    expect(state.calls[0]).toBe('find the learner')
    expect(cookieNamed(OWN_MARKER_COOKIE)).toBeUndefined()
    expect(cookieNamed('jemma_ws')!.value).toBe('own')
  })

  it('the switch back and forth, many times, asks the database nothing after the first time', async () => {
    await setWorkspace('own')
    const afterFirst = state.calls.length
    state.jar = { [OWN_MARKER_COOKIE]: cookieNamed(OWN_MARKER_COOKIE)!.value }
    for (const ws of ['school', 'own', 'school', 'own'] as const) await setWorkspace(ws)
    expect(state.calls.length).toBe(afterFirst)
    expect(state.calls.filter((c) => c.startsWith('network') || c.startsWith('database'))).toEqual([])
  })

  it('anything else is refused and sets nothing', async () => {
    for (const odd of ['both', '', null, undefined, 1, 'OWN'] as unknown[]) {
      const res = await setWorkspace(odd as 'own')
      expect(res).toEqual({ ok: false, message: expect.stringMatching(/\w/) })
    }
    expect(state.cookieSet).toEqual([])
    expect(state.calls).toEqual([])
  })
})

describe('addMyGrade', () => {
  it('opens the private workspace if needed, adds the grade for the person acting and says what was added', async () => {
    expect(await addMyGrade(7)).toEqual({ ok: true, classId: 'class-new', created: true, topics: 24 })
    expect(state.calls).toEqual(['find the learner', 'ensure child-school u-amina', 'add child-own 7 u-amina'])
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
