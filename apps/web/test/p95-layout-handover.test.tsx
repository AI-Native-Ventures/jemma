import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The learner's layout on a parent's phone (P95). A hand-over of one session shows only that screen, as always. A hand-over of the learner's own
// practice ("Practise at home") shows the learner's screens with the tab bar and a way for the grown-up to take the phone back. A parent with no
// valid hand-over is sent to the parent's screens. The cookies, the headers and the client are stand-ins; the sign is real with a made-up key.

const state = vi.hoisted(() => ({ pathname: '/k', cookie: undefined as string | undefined, role: 'parent' as 'parent' | 'learner' }))
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
vi.mock('@/lib/space', () => ({ activeTab: async () => 'today' }))
vi.mock('@/components/blocks', () => ({
  Sidebar: () => <aside data-testid="sidebar" />,
  TabBar: ({ label }: { label: string }) => <nav aria-label={label} data-testid="tabbar" />,
}))

import LearnerLayout from '../app/k/layout'
import { OWN_HANDOVER, signHandover } from '../lib/handover'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})
beforeEach(() => {
  state.pathname = '/k'
  state.cookie = undefined
  state.role = 'parent'
})

const page = async () => render(await LearnerLayout({ children: <p>the screen</p> }))

describe('a parent\'s phone with a hand-over of the learner\'s own practice', () => {
  beforeEach(async () => {
    state.cookie = await signHandover(OWN_HANDOVER, 'child-1')
  })

  it('shows the screen with the learner\'s tab bar and a link that takes the phone back to the parent\'s screens', async () => {
    await page()
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(screen.getByTestId('tabbar')).toBeTruthy()
    const back = screen.getByRole('link', { name: /Take the phone back/ })
    expect(back.getAttribute('href')).toBe('/p/child-1')
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })

  it('the way back is tall and has room at the sides', async () => {
    await page()
    const classes = screen.getByRole('link', { name: /Take the phone back/ }).className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(classes.some((c) => /^px-(4|5|6)$/.test(c))).toBe(true)
  })

  it('on a session or the hand-back screen it shows the screen alone, as every hand-over does', async () => {
    state.pathname = '/k/session/abc'
    await page()
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(screen.queryByTestId('tabbar')).toBeNull()
    expect(screen.queryByRole('link', { name: /Take the phone back/ })).toBeNull()
  })

  it('on a screen the hand-over does not open (the account page) it sends the phone to the parent\'s screens', async () => {
    state.pathname = '/k/me'
    await expect(page()).rejects.toThrow('REDIRECT /p')
  })
})

describe('a parent\'s phone with a hand-over of one session', () => {
  it('shows only that session\'s screen, with no tab bar and no way into the rest', async () => {
    state.cookie = await signHandover('s-1', 'child-1')
    state.pathname = '/k/session/s-1'
    await page()
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(screen.queryByTestId('tabbar')).toBeNull()
    expect(screen.queryByRole('link', { name: /Take the phone back/ })).toBeNull()
  })

  it('does not open the home', async () => {
    state.cookie = await signHandover('s-1', 'child-1')
    state.pathname = '/k'
    await expect(page()).rejects.toThrow('REDIRECT /p')
  })
})

describe('a parent with no hand-over', () => {
  it('is sent to the parent\'s screens', async () => {
    await expect(page()).rejects.toThrow('REDIRECT /p')
  })
})

describe('the learner', () => {
  it('has the sidebar and the tab bar as before, and no way back for a grown-up', async () => {
    state.role = 'learner'
    await page()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    expect(screen.getByTestId('tabbar')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Take the phone back/ })).toBeNull()
  })
})
