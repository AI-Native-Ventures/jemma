import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildProfileView } from '../lib/data/p19'

// The teacher's learners list opens a learner at /t/[classId]/learners/[childId]/profile, so that is where the link to "{name}'s own practice" must
// be (P95b; it was only on the page the list does not open). It is shown only when the learner has a private workspace, in the style of the Long
// view link above it, and it says it is for looking only. The data is a double.

const state = vi.hoisted(() => ({ twin: null as unknown, asked: [] as string[] }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../lib/own-workspace', () => ({
  twinOfChild: async (childId: string) => {
    state.asked.push(childId)
    return state.twin
  },
}))
vi.mock('../lib/data/p52', () => ({ getLongViewSummary: async () => 'Two patterns to look at.' }))
vi.mock('../lib/data/p19', async (orig) => ({
  ...(await orig<typeof import('../lib/data/p19')>()),
  getChildProfileView: async () =>
    ({
      className: '6B Mathematics', id: 'child-1', name: 'Amina', linkedTo: 'Thandi', average: 62, topGap: 'Adding fractions', misconception: null, needsYou: [], marks: [],
      paper: null, noticed: [], latestNote: null, attendanceLine: '8 of 10 days', tonight: null, term: 4, testId: null,
    }) satisfies ChildProfileView,
}))

import ProfilePage from '../app/t/[classId]/learners/[childId]/profile/page'

const page = async () => render(await ProfilePage({ params: Promise.resolve({ classId: 'class-1', childId: 'child-1' }) }))

beforeEach(() => {
  state.twin = { id: 'twin-1' }
  state.asked = []
})

describe('the link on the profile page', () => {
  it('is there when the learner has a private workspace: "Amina\'s own practice" going to the read-only page', async () => {
    await page()
    const link = screen.getByRole('link', { name: /Amina's own practice/ })
    expect(link.getAttribute('href')).toBe('/t/class-1/learners/child-1/own')
    expect(state.asked).toEqual(['child-1'])
  })

  it('says it is for looking only', async () => {
    await page()
    expect(screen.getByRole('link', { name: /Amina's own practice/ }).textContent).toMatch(/read only/i)
  })

  it('is not there when the learner has no private workspace', async () => {
    state.twin = null
    await page()
    expect(screen.queryByRole('link', { name: /own practice/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Long view/ })).toBeTruthy()
  })

  it('sits with the Long view link, after it, as one of the links of the page', async () => {
    await page()
    const long = screen.getByRole('link', { name: /Long view/ })
    const own = screen.getByRole('link', { name: /Amina's own practice/ })
    expect(long.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(own.getAttribute('style')).toContain('border-radius: 18px')
  })

  it('is a tall row with room all round, and names no he or she and has no em dash', async () => {
    await page()
    const link = screen.getByRole('link', { name: /Amina's own practice/ })
    expect(link.style.padding).not.toBe('')
    expect(link.textContent).not.toMatch(/\b(he|she|his|her)\b/i)
    expect(link.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
