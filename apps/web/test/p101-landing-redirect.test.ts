// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// P101: the landing page lives at its own address now (LANDING_URL, the site getjemma.ainative.ventures). "/" of the app sends a visitor who is
// not signed in there when LANDING_URL is set, and shows the built-in landing page when it is not (local runs, CI). A signed-in person is sent
// home as before. The pure part is tested on its own, then the page with a data double for the cookies and for Supabase (no server, no browser,
// no database).

const state = vi.hoisted(() => ({
  cookieNames: [] as string[],
  user: null as { id: string } | null,
  role: null as 'teacher' | 'parent' | 'learner' | null,
  supabaseCalls: 0,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => state.cookieNames.map((name) => ({ name, value: 'x' })) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => {
    state.supabaseCalls += 1
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }) }) }),
    }
  },
}))

import { landingRedirectUrl } from '../app/_landing/destination'
import Home from '../app/page'

const LANDING = 'https://getjemma.ainative.ventures'

beforeEach(() => {
  state.cookieNames = []
  state.user = null
  state.role = null
  state.supabaseCalls = 0
  vi.stubEnv('LANDING_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('landingRedirectUrl (the pure part)', () => {
  it('is the landing address, as a full address, when LANDING_URL is set', () => {
    expect(landingRedirectUrl(LANDING)).toBe(`${LANDING}/`)
    expect(landingRedirectUrl(`${LANDING}/`)).toBe(`${LANDING}/`)
    expect(landingRedirectUrl(`  ${LANDING}  `)).toBe(`${LANDING}/`)
    expect(landingRedirectUrl('http://localhost:4173')).toBe('http://localhost:4173/')
  })

  it('is null when LANDING_URL is not set, so the built-in landing page shows', () => {
    expect(landingRedirectUrl(undefined)).toBeNull()
    expect(landingRedirectUrl(null)).toBeNull()
    expect(landingRedirectUrl('')).toBeNull()
    expect(landingRedirectUrl('   ')).toBeNull()
  })

  it('is null for a value that is not a web address, never a redirect to something odd', () => {
    for (const bad of ['getjemma', '/landing', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', '//example.com']) {
      expect(landingRedirectUrl(bad), bad).toBeNull()
    }
  })
})

describe('"/" of the app', () => {
  it('sends a visitor who is not signed in to the landing site when LANDING_URL is set', async () => {
    vi.stubEnv('LANDING_URL', LANDING)
    await expect(Home()).rejects.toThrow(`NEXT_REDIRECT ${LANDING}/`)
    expect(state.supabaseCalls).toBe(0)
  })

  it('shows the built-in landing page when LANDING_URL is not set', async () => {
    const page = await Home()
    expect(page).toBeTruthy()
    expect(state.supabaseCalls).toBe(0)
  })

  it('shows the built-in landing page when LANDING_URL is not a web address', async () => {
    vi.stubEnv('LANDING_URL', 'not an address')
    expect(await Home()).toBeTruthy()
  })

  it.each([
    ['teacher', '/t'],
    ['parent', '/p'],
    ['learner', '/k'],
  ] as const)('a signed-in %s still goes to %s, not to the landing site', async (role, home) => {
    vi.stubEnv('LANDING_URL', LANDING)
    state.cookieNames = ['sb-abcdefgh-auth-token']
    state.user = { id: 'u1' }
    state.role = role
    await expect(Home()).rejects.toThrow(`NEXT_REDIRECT ${home}`)
  })

  it('a signed-in person with no profile still goes to the role picker', async () => {
    vi.stubEnv('LANDING_URL', LANDING)
    state.cookieNames = ['sb-abcdefgh-auth-token']
    state.user = { id: 'u1' }
    await expect(Home()).rejects.toThrow('NEXT_REDIRECT /role')
  })

  it('an old session cookie that no longer gives a user is sent to the landing site', async () => {
    vi.stubEnv('LANDING_URL', LANDING)
    state.cookieNames = ['sb-abcdefgh-auth-token']
    await expect(Home()).rejects.toThrow(`NEXT_REDIRECT ${LANDING}/`)
  })
})
