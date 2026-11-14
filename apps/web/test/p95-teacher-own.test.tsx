import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OwnSummary } from '../lib/own-workspace'

// The teacher's read-only page of a learner's own practice (P95), /t/[classId]/learners/[childId]/own, and the link to it on the learner's page.
// The page shows the grades, in each the topics practised with the learner's own counts, the open and the fixed private gaps and the last
// finished sessions. It has no form and no button: a teacher can look and nothing changes. The data is a double.

const state = vi.hoisted(() => ({ summary: null as unknown, twin: null as unknown, asked: [] as unknown[][] }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../lib/own-workspace', () => ({
  getOwnWorkspaceForTeacher: async (...args: unknown[]) => {
    state.asked.push(args)
    return state.summary
  },
  twinOfChild: async () => state.twin,
}))
vi.mock('../lib/data/p19', () => ({
  getLearnerView: async () => ({
    className: '6B Mathematics', id: 'child-1', name: 'Amina', grade: 6, linkedTo: 'Thandi', average: 62, present: 8, recorded: 10, openGaps: 2,
    summary: 'Solid on whole numbers.', term: 4, notes: [], attendance: [], awayLabel: null,
  }),
}))
vi.mock('../app/t/[classId]/learners/[childId]/NoteForm', () => ({ NoteForm: () => <div data-testid="note-form" /> }))

import OwnPracticePage from '../app/t/[classId]/learners/[childId]/own/page'
import LearnerPage from '../app/t/[classId]/learners/[childId]/page'

const grade = (g: number, practised: OwnSummary['grades'][number]['practised'] = [], score = { right: 0, asked: 0 }) => ({
  classId: `c${g}`, grade: g, name: `Grade ${g} (my own)`, topics: 40, score, practised,
})
const summary = (over: Partial<OwnSummary> = {}): OwnSummary => ({
  firstName: 'Amina',
  grades: [
    grade(6, [{ topicId: 't1', name: 'Equivalent fractions', term: 4, score: { right: 4, asked: 5 } }, { topicId: 't2', name: 'Whole numbers to 1 000 000', term: 1, score: { right: 2, asked: 5 } }], { right: 6, asked: 10 }),
    grade(7),
  ],
  gaps: { open: [{ topicName: 'Adding fractions', stage: 'practising', grade: 6 }], fixed: [{ topicName: 'Equivalent fractions', stage: 'fixed', grade: 6 }] },
  sessions: [
    { date: '2026-11-13T17:30:00.000Z', topic: 'Equivalent fractions', right: 4, asked: 5 },
    { date: '2026-11-11T16:05:00.000Z', topic: 'Whole numbers to 1 000 000', right: 2, asked: 5 },
  ],
  ...over,
})
const page = async () => render(await OwnPracticePage({ params: Promise.resolve({ classId: 'class-1', childId: 'child-1' }) }))
const learner = async () => render(await LearnerPage({ params: Promise.resolve({ classId: 'class-1', childId: 'child-1' }) }))

beforeEach(() => {
  state.summary = summary()
  state.twin = { id: 'twin-1' }
  state.asked = []
})

describe('the read-only page', () => {
  it('asks for this class and this learner, and says whose it is', async () => {
    await page()
    expect(state.asked).toEqual([['class-1', 'child-1']])
    expect(screen.getByRole('heading', { level: 1, name: "Amina's own practice" })).toBeTruthy()
  })

  it('has the header line that says the teacher can look and that nothing changes the school record', async () => {
    await page()
    expect(screen.getByText('What Amina practised on their own. You can look; nothing here changes their school record.')).toBeTruthy()
  })

  it('has no form and no button, nothing that writes: only the link back', async () => {
    const { container } = await page()
    expect(container.querySelectorAll('form, button, input, select, textarea, [role="button"]')).toHaveLength(0)
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/t/class-1/learners/child-1'])
  })

  it('lists each grade with the topics practised and the learner\'s own count', async () => {
    await page()
    const six = within(screen.getByRole('region', { name: 'Grade 6' }))
    expect(six.getByText('Equivalent fractions')).toBeTruthy()
    expect(six.getByText('4 of 5 right')).toBeTruthy()
    expect(six.getByText('Whole numbers to 1 000 000')).toBeTruthy()
    expect(six.getByText('2 of 5 right')).toBeTruthy()
    expect(six.getByText('6 of 10 right')).toBeTruthy()
  })

  it('says a grade with nothing practised has nothing practised, and shows no empty list', async () => {
    await page()
    const seven = within(screen.getByRole('region', { name: 'Grade 7' }))
    expect(seven.getByText('Nothing practised yet.')).toBeTruthy()
    expect(seven.queryByRole('list')).toBeNull()
  })

  it('has the open and the fixed private gaps, each with its stage', async () => {
    await page()
    const open = within(screen.getByRole('region', { name: 'Open gaps' }))
    expect(open.getByText('Adding fractions')).toBeTruthy()
    expect(open.getByText(/Practising/)).toBeTruthy()
    const fixed = within(screen.getByRole('region', { name: 'Fixed gaps' }))
    expect(fixed.getByText('Equivalent fractions')).toBeTruthy()
  })

  it('says so when there are no gaps, in plain words', async () => {
    state.summary = summary({ gaps: { open: [], fixed: [] } })
    await page()
    expect(within(screen.getByRole('region', { name: 'Open gaps' })).getByText('No open gaps.')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Fixed gaps' })).getByText('No fixed gaps yet.')).toBeTruthy()
  })

  it('has the last finished sessions with the date, the topic and right of asked', async () => {
    await page()
    const last = within(screen.getByRole('region', { name: 'Last sessions' }))
    const rows = last.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('Fri 13 Nov')
    expect(rows[0]!.textContent).toContain('Equivalent fractions')
    expect(rows[0]!.textContent).toContain('4 of 5 right')
    expect(rows[1]!.textContent).toContain('Wed 11 Nov')
  })

  it('says so when there is no finished session', async () => {
    state.summary = summary({ sessions: [] })
    await page()
    expect(within(screen.getByRole('region', { name: 'Last sessions' })).getByText('No finished sessions yet.')).toBeTruthy()
  })

  it('never shows a percent, and has no em dash and no he or she', async () => {
    await page()
    const text = document.body.textContent!
    expect(text).not.toMatch(/%/)
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\b(he|she|his|her)\b/i)
  })

  it('a learner with no private workspace, or a teacher who does not teach the class, is a page that is not found', async () => {
    state.summary = null
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('the link on the learner\'s page', () => {
  it('is there when the learner has a private workspace: "Amina\'s own practice" going to the read-only page', async () => {
    await learner()
    const link = screen.getByRole('link', { name: /Amina's own practice/ })
    expect(link.getAttribute('href')).toBe('/t/class-1/learners/child-1/own')
  })

  it('is not there when the learner has none', async () => {
    state.twin = null
    await learner()
    expect(screen.queryByRole('link', { name: /own practice/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Long view/ })).toBeTruthy()
  })

  it('the link says it is for looking only', async () => {
    await learner()
    expect(screen.getByRole('link', { name: /Amina's own practice/ }).textContent).toMatch(/read only/i)
  })
})
