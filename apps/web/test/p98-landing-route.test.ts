// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P98: what `/` does. A visitor who is not signed in sees the landing page. A signed-in person is sent where sign-in sends them
// (teacher /t, parent /p, learner /k, no profile yet /role). The pure part is tested on its own, then the page with a data double
// for the cookies and for Supabase (no server, no browser, no database).

const state = vi.hoisted(() => ({
  cookieNames: [] as string[],
  user: null as { id: string } | null,
  role: null as 'teacher' | 'parent' | 'learner' | null,
  databaseDown: false,
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
    if (state.databaseDown) throw new Error('fetch failed')
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }) }) }),
    }
  },
}))

import { HOMES } from '@/components/blocks/nav'
import { destinationFor, hasSessionCookie, signedInDestination } from '../app/_landing/destination'
import Home, { metadata } from '../app/page'

beforeEach(() => {
  state.cookieNames = []
  state.user = null
  state.role = null
  state.databaseDown = false
  state.supabaseCalls = 0
})

describe('destinationFor (the pure part of "/")', () => {
  it('a visitor who is not signed in gets no destination: the landing page is shown', () => {
    expect(destinationFor(false, null)).toBeNull()
    expect(destinationFor(false, 'teacher')).toBeNull()
  })

  it('a signed-in teacher, parent and learner go to the same homes as after sign-in', () => {
    expect(destinationFor(true, 'teacher')).toBe('/t')
    expect(destinationFor(true, 'parent')).toBe('/p')
    expect(destinationFor(true, 'learner')).toBe('/k')
    for (const role of ['teacher', 'parent', 'learner'] as const) expect(destinationFor(true, role)).toBe(HOMES[role])
  })

  it('a signed-in person with no profile yet goes to the role picker, as after sign-in', () => {
    expect(destinationFor(true, null)).toBe('/role')
  })
})

describe('hasSessionCookie', () => {
  it('sees the Supabase session cookie, whole or in chunks', () => {
    expect(hasSessionCookie(['sb-abcdefgh-auth-token'])).toBe(true)
    expect(hasSessionCookie(['theme', 'sb-127-auth-token.0', 'sb-127-auth-token.1'])).toBe(true)
  })

  it('does not take other cookies for a session', () => {
    expect(hasSessionCookie([])).toBe(false)
    expect(hasSessionCookie(['jemma_demo', 'theme'])).toBe(false)
    expect(hasSessionCookie(['sb-abcdefgh-auth-token-code-verifier'])).toBe(false)
  })
})

describe('signedInDestination and the page', () => {
  it('a visitor with no session cookie never reaches Supabase and sees the landing page', async () => {
    expect(await signedInDestination()).toBeNull()
    expect(state.supabaseCalls).toBe(0)
    const page = await Home()
    expect(page).toBeTruthy()
    expect(state.supabaseCalls).toBe(0)
  })

  it.each([
    ['teacher', '/t'],
    ['parent', '/p'],
    ['learner', '/k'],
  ] as const)('a signed-in %s is sent to %s', async (role, home) => {
    state.cookieNames = ['sb-abcdefgh-auth-token']
    state.user = { id: 'u1' }
    state.role = role
    await expect(Home()).rejects.toThrow(`NEXT_REDIRECT ${home}`)
  })

  it('a signed-in person with no profile is sent to the role picker', async () => {
    state.cookieNames = ['sb-abcdefgh-auth-token']
    state.user = { id: 'u1' }
    await expect(Home()).rejects.toThrow('NEXT_REDIRECT /role')
  })

  it('an old session cookie that no longer gives a user shows the landing page', async () => {
    state.cookieNames = ['sb-abcdefgh-auth-token']
    expect(await signedInDestination()).toBeNull()
    expect(await Home()).toBeTruthy()
  })

  it('when the database does not answer, the landing page is still shown', async () => {
    state.cookieNames = ['sb-abcdefgh-auth-token']
    state.databaseDown = true
    expect(await signedInDestination()).toBeNull()
    expect(await Home()).toBeTruthy()
  })
})

describe('the page head', () => {
  const DESCRIPTION = 'Jemma teaches you a short lesson, marks your answers, and teaches again what you got wrong. Every lesson is free.'

  it('has the title and a description, and nothing else', () => {
    expect(metadata.title).toBe('Jemma: learn maths until you understand it')
    expect(metadata.description).toBe(DESCRIPTION)
    expect(String(metadata.description).length).toBeGreaterThan(40)
    expect(Object.keys(metadata).sort()).toEqual(['description', 'title'])
  })

  it('every other page of the app has the same description, from the layout', () => {
    const layout = readFileSync(resolve(import.meta.dirname, '../app/layout.tsx'), 'utf8')
    expect(layout).toContain(`  description: '${DESCRIPTION}',`)
    expect(layout.match(/\bdescription:/g)).toHaveLength(1)
  })
})
