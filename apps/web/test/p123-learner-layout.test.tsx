import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// P123: what the learner's layout draws around a screen now that the phone bar has a Me tab. A learner sees the bar on My maths and Me (the
// laptop sidebar is not drawn on Me, as before; the bar is the phone's). The session flow and the hand-back screen have no bar. A parent's phone with a
// hand-over of the learner's own practice gets the bar with My maths only: the account page is not theirs to open. The cookies, the headers and
// the client are stand-ins: no browser, no server, no database.

const state = vi.hoisted(() => ({
  pathname: '/k',
  cookie: undefined as string | undefined,
  role: 'learner' as 'parent' | 'learner',
  bar: null as null | { role: string; label: string; only?: string[] },
  sidebar: 0,
}))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (n: string) => (n === 'x-pathname' ? state.pathname : null) }),
  cookies: async () => ({ get: (n: string) => (n === 'jemma_handover' && state.cookie ? { name: n, value: state.cookie } : undefined) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: state.role } }) }) }) }),
  }),
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'u1', profile: { display_name: 'Amina M' } }) }))
vi.mock('@/lib/data/p27', () => ({ myChild: async () => ({ child: { first_name: 'Amina', grade: 6, private_of: null, schools: { name: 'Hillview' } } }) }))
vi.mock('@/lib/space', () => ({ activeTab: async () => 'maths' }))
vi.mock('@/components/blocks', () => ({
  Sidebar: () => {
    state.sidebar += 1
    return <aside data-testid="sidebar" />
  },
  TabBar: (props: { role: string; label: string; only?: string[] }) => {
    state.bar = props
    return <nav aria-label={props.label} data-testid="tabbar" />
  },
}))

import LearnerLayout from '../app/k/layout'
import { OWN_HANDOVER, signHandover } from '../lib/handover'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})
beforeEach(() => {
  state.pathname = '/k'
  state.cookie = undefined
  state.role = 'learner'
  state.bar = null
  state.sidebar = 0
})

const page = async () => render(await LearnerLayout({ children: <p>the screen</p> }))

describe('the learner on their own phone', () => {
  it.each(['/k', '/k/maths', '/k/maths/fractions', '/k/own'])('%s: the bar has every tab (no `only`) and the sidebar is there for the laptop', async (path) => {
    state.pathname = path
    await page()
    expect(screen.getByTestId('tabbar')).toBeTruthy()
    expect(state.bar).toMatchObject({ role: 'learner', label: "Amina's Jemma" })
    expect(state.bar?.only).toBeUndefined()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
  })

  it('Me has the bar, so the Me tab is there to be marked and a tap on My maths goes back; the laptop sidebar is still not drawn on Me', async () => {
    state.pathname = '/k/me'
    await page()
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(screen.getByTestId('tabbar')).toBeTruthy()
    expect(state.bar?.only).toBeUndefined()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })

  it.each(['/k/session/abc', '/k/done'])('%s: the screen alone, no bar and no sidebar, as before', async (path) => {
    state.pathname = path
    await page()
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(screen.queryByTestId('tabbar')).toBeNull()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })
})

describe('a parent\'s phone with a hand-over of the learner\'s own practice', () => {
  beforeEach(async () => {
    state.role = 'parent'
    state.cookie = await signHandover(OWN_HANDOVER, 'child-1')
  })

  it.each(['/k', '/k/maths'])('%s: the bar is limited to My maths (the one page, P128), with no Me', async (path) => {
    state.pathname = path
    await page()
    expect(screen.getByTestId('tabbar')).toBeTruthy()
    expect(state.bar).toMatchObject({ role: 'learner', label: 'Practise at home', only: ['maths'] })
    expect(state.bar?.only).not.toContain('me')
    expect(screen.getByRole('link', { name: /Take the phone back/ }).getAttribute('href')).toBe('/p/child-1')
  })

  it('does not open the account page (Me): the phone goes to the parent\'s screens', async () => {
    state.pathname = '/k/me'
    await expect(page()).rejects.toThrow('REDIRECT /p')
  })
})
