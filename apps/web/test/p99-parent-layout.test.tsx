import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The frame of a parent's child space (P99): for a child whose school does not use Jemma it has no tab bar, no navigation, no bell and no school in the
// subtitle, and any address under the child other than the child's page goes back to the page. For a school child it is the frame it always was.
// The sign-in, the database, the path and the data are doubles.

const state = vi.hoisted(() => ({ alone: false, pathname: '/p/child-1', school: 'Hillview Primary' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  usePathname: () => state.pathname,
}))
vi.mock('next/headers', () => ({ headers: async () => ({ get: (name: string) => (name === 'x-pathname' ? state.pathname : null) }) }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Zanele M' } }) }))
vi.mock('@/lib/space', () => ({ activeTab: async () => 'profile' }))
vi.mock('@/lib/data/own-parent', () => ({ aloneOf: async () => (state.alone ? { id: 'child-1', firstName: 'Kagiso', grade: 8 } : null) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is']) chain[m] = () => chain
      chain.maybeSingle = async () => ({ data: { first_name: 'Kagiso', grade: 8, schools: { name: state.school, sandbox_id: null } }, error: null })
      chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ count: table === 'notifications' ? 2 : null, error: null }).then(r)
      return chain
    },
  }),
}))

import ParentChildLayout from '../app/p/[childId]/layout'

const frame = async () => render(await ParentChildLayout({ children: <p>the page</p>, params: Promise.resolve({ childId: 'child-1' }) }))
const body = () => document.body.textContent ?? ''

beforeEach(() => {
  cleanup()
  state.alone = false
  state.pathname = '/p/child-1'
  state.school = 'Hillview Primary'
})

describe('the frame for a child on their own', () => {
  beforeEach(() => {
    state.alone = true
  })

  it('says "On their own" in the subtitle, and no school', async () => {
    state.school = ''
    await frame()
    expect(screen.getAllByText('Grade 8 · On their own').length).toBeGreaterThan(0)
    expect(body()).not.toMatch(/school/i)
  })

  it('has no tab bar and no navigation: nothing to go to but the page', async () => {
    await frame()
    expect(screen.queryByRole('navigation')).toBeNull()
    for (const name of ['Profile', 'Learn', 'Snap', 'Tests']) expect(screen.queryByRole('link', { name })).toBeNull()
    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('has no bell (a school child’s notifications are not here), and the gear goes to the account', async () => {
    await frame()
    expect(screen.queryByRole('link', { name: /Notifications/ })).toBeNull()
    for (const gear of screen.getAllByRole('link', { name: 'Settings' })) expect(gear.getAttribute('href')).toBe('/p/account')
  })

  it('the switch goes to the whole list of children, which has the way to add another', async () => {
    await frame()
    for (const link of screen.getAllByRole('link', { name: /Switch. Now showing Kagiso/ })) expect(link.getAttribute('href')).toBe('/p?all=1')
  })

  it('an address under the child that belongs to a school goes back to the child’s page', async () => {
    for (const path of ['/p/child-1/tests', '/p/child-1/learn', '/p/child-1/snap', '/p/child-1/report', '/p/child-1/settings/login', '/p/child-1/beyond']) {
      state.pathname = path
      await expect(frame(), path).rejects.toThrow('REDIRECT /p/child-1')
    }
  })

  it('the child’s own page, with or without a slash at the end, stays', async () => {
    state.pathname = '/p/child-1/'
    await frame()
    expect(screen.getByText('the page')).toBeTruthy()
  })
})

describe('the frame for a school child', () => {
  it('has the tabs, the bell with its count, the school in the subtitle and the settings of the child, as it always had', async () => {
    await frame()
    const nav = screen.getAllByRole('navigation', { name: 'Kagiso' })[0]!
    expect(within(nav).getAllByRole('link').map((a) => a.textContent?.trim())).toEqual(['Profile', 'Learn', 'Snap', 'Tests'])
    expect(screen.getAllByRole('link', { name: 'Notifications, 2 new' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Grade 8 · Hillview Primary').length).toBeGreaterThan(0)
    for (const gear of screen.getAllByRole('link', { name: 'Settings' })) expect(gear.getAttribute('href')).toBe('/p/child-1/settings')
    for (const link of screen.getAllByRole('link', { name: /Switch. Now showing Kagiso/ })) expect(link.getAttribute('href')).toBe('/p')
  })

  it('does not send any address away', async () => {
    state.pathname = '/p/child-1/tests'
    await frame()
    expect(screen.getByText('the page')).toBeTruthy()
  })
})
