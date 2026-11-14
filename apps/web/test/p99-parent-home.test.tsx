import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The parent's list of children (P99): a child on their own says "On their own" where a school's name would be, and a school child says its school.
// A parent may have both. The data and the sign-in are doubles.

const state = vi.hoisted(() => ({ kids: [] as unknown[] }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Zanele M' } }) }))
vi.mock('@/lib/demo', () => ({ getDemoState: async () => null }))
vi.mock('@/lib/data/p22', async (orig) => ({
  ...(await orig<typeof import('../lib/data/p22')>()),
  getParentHome: async () => ({ kind: 'children', children: state.kids }),
}))

import ParentHomePage from '../app/p/page'

const kid = (over: Record<string, unknown>) => ({ id: 'c', firstName: 'Kagiso', grade: 8, schoolName: '', alone: true, needs: 0, tonight: null, ...over })
const page = async (all?: string) => render(await ParentHomePage({ searchParams: Promise.resolve({ all }) }))

beforeEach(() => {
  cleanup()
  state.kids = [kid({ id: 'c1' }), kid({ id: 'c2', firstName: 'Amina', grade: 6, schoolName: 'Hillview Primary', alone: false })]
})

describe('the parent’s list of children', () => {
  it('a child on their own says "On their own", and a school child says its school', async () => {
    await page()
    expect(screen.getByText('Grade 8 · On their own')).toBeTruthy()
    expect(screen.getByText('Grade 6 · Hillview Primary')).toBeTruthy()
  })

  it('the card of a child on their own has no empty school name and no dangling dot', async () => {
    await page()
    expect(document.body.textContent).not.toMatch(/Grade 8 · (?!On their own)/)
    expect(document.body.textContent).not.toMatch(/Grade 8 ·\s*$/m)
  })

  it('with one child and no ?all it goes straight to that child, and with ?all=1 it shows the list and the way to add another child', async () => {
    state.kids = [kid({ id: 'c1' })]
    await expect(page()).rejects.toThrow('REDIRECT /p/c1')
    await page('1')
    expect(screen.getByText('Grade 8 · On their own')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Add a child/i }).getAttribute('href')).toBe('/p/add')
  })
})
