import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AloneSummary } from '../lib/data/own-parent'

// The page of a child whose school does not use Jemma, for the parent who added them (P99): the child's name, "Practising on their own", the button
// "Practise at home with {name}", what the child has practised, and the sign-in code with the button that makes one. Not one line of a school child's
// profile (no school, class, teacher, marked test, "Needs you", attendance). A school child's page is as it always was. The data and the actions are doubles.

const state = vi.hoisted(() => ({ summary: null as unknown, profileCalls: 0 }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/p/child-1',
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Zanele M' } }) }))
vi.mock('@/lib/data/own-parent', () => ({ getAloneSummary: async () => state.summary }))
vi.mock('@/lib/data/p23', () => ({
  getProfile: async () => {
    state.profileCalls++
    return null
  },
}))
vi.mock('@/lib/data/p36', () => ({ getProfileExtras: async () => ({}) }))
vi.mock('@/lib/data/p52', () => ({ getSharedLongView: async () => null }))
vi.mock('../app/p/[childId]/learn/handover/own-actions', () => ({ startOwnPractice: async () => undefined }))
vi.mock('../app/p/[childId]/settings/actions', () => ({ setChildPin: async () => ({ ok: true, code: 'K7M2QX' }) }))

import ParentProfilePage from '../app/p/[childId]/page'

const summary = (over: Partial<AloneSummary> = {}): AloneSummary => ({
  id: 'child-1',
  firstName: 'Kagiso',
  grade: 8,
  grades: [
    { classId: 'c8', grade: 8, name: 'Grade 8 (my own)', caps: true, topics: 40, score: { right: 3, asked: 5 } },
    { classId: 'c9', grade: 9, name: 'Grade 9 (my own)', caps: true, topics: 38, score: { right: 0, asked: 0 } },
  ],
  loginCode: null,
  ...over,
})
const page = async () => render(await ParentProfilePage({ params: Promise.resolve({ childId: 'child-1' }) }))
const body = () => document.body.textContent ?? ''

beforeEach(() => {
  cleanup()
  state.summary = summary()
  state.profileCalls = 0
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
})

describe('the page of a child on their own', () => {
  it('has the name as the heading, "Practising on their own" and the grade', async () => {
    await page()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kagiso')
    expect(screen.getByText('Practising on their own')).toBeTruthy()
    // The grade is under the name and again in the list of what has been practised.
    expect(screen.getAllByText('Grade 8')).toHaveLength(2)
  })

  it('has the two buttons: "Practise at home with Kagiso" and "Make a sign-in code for Kagiso"', async () => {
    await page()
    expect(screen.getByRole('button', { name: 'Practise at home with Kagiso' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make a sign-in code for Kagiso' })).toBeTruthy()
  })

  it('"Practise at home" is a submit button of a form, so the hand-over starts on the server, and the page says nothing about a school record', async () => {
    await page()
    const button = screen.getByRole('button', { name: 'Practise at home with Kagiso' }) as HTMLButtonElement
    expect(button.type).toBe('submit')
    expect(button.closest('form')).toBeTruthy()
    const card = screen.getByRole('region', { name: 'Practise at home' })
    expect(card.textContent).toContain('Kagiso picks a topic from any grade.')
    expect(card.textContent).not.toMatch(/school/i)
  })

  it('lists the grades with the child’s own count, and "No score yet" for one not started', async () => {
    await page()
    const list = within(screen.getByRole('region', { name: 'What Kagiso has practised' }))
    expect(list.getByText('3 of 5 right')).toBeTruthy()
    expect(list.getByText('No score yet')).toBeTruthy()
    expect(list.getByText('Grade 9')).toBeTruthy()
  })

  it('says "Nothing yet" for a child with no class (a grade outside the maps)', async () => {
    state.summary = summary({ grades: [] })
    await page()
    expect(screen.getByText(/Nothing yet/)).toBeTruthy()
  })

  it('with a sign-in code shows the code and offers a new one, not a first one', async () => {
    state.summary = summary({ loginCode: 'K7M2QX' })
    await page()
    expect(screen.getByLabelText("Kagiso's code is K7M2QX").textContent).toBe('K7M2QX')
    expect(screen.getByRole('button', { name: 'Make a new code' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make a sign-in code for Kagiso' })).toBeNull()
  })

  it('has no line of a school child’s profile: no school, class, teacher, marked test, Needs you or attendance', async () => {
    await page()
    expect(body()).not.toMatch(/school|teacher|\bclass|marked|needs you|beyond the tests|attendance|marks by topic|long view/i)
    expect(body()).not.toContain(String.fromCharCode(0x2014))
  })

  it('does not read the school child’s profile at all', async () => {
    await page()
    expect(state.profileCalls).toBe(0)
  })

  it('every button has room: a minimum height, room at the sides, and words that may take a second line', async () => {
    await page()
    for (const button of screen.getAllByRole('button')) {
      expect(button.className, button.textContent ?? '').toMatch(/min-h-14/)
      expect(button.className).toMatch(/px-5/)
      expect(button.className).toMatch(/text-balance/)
      expect(button.className).not.toMatch(/(^|\s)h-\[/)
    }
  })
})

describe('the page of a school child', () => {
  it('is the profile as it always was: it reads the profile (and is not found when there is none)', async () => {
    state.summary = null
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(state.profileCalls).toBe(1)
  })
})
