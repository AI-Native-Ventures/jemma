import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ChildProfileView, LearnerView, LearnersView } from '../lib/data/p19'
import type { LearnerDetailExtras } from '../lib/data/p33'

// On the laptop the teacher's learners page is a list with the chosen learner's profile beside it, and it never opens /profile. So the link to
// "{name}'s own practice" is in that pane too (P95b), next to "Long view", only when the learner has a private workspace.

import { LaptopLearners } from '../app/t/[classId]/learners/LaptopLearners'

const v = {
  className: '6B Mathematics', headline: 'Five learners.', todayLabel: 'Today', registerTaken: true, joinCode: 'ABC234',
  learners: [{ id: 'child-1', name: 'Amina', topGap: 'Adding fractions', average: 62, present: 8, recorded: 10 }],
} as unknown as LearnersView
const view = { id: 'child-1', name: 'Amina', grade: 6, linkedTo: 'Thandi', notes: [], present: 8, recorded: 10, awayLabel: null } as unknown as LearnerView
const profile = { term: 4, average: 62, topGap: 'Adding fractions', misconception: null, marks: [], noticed: [], testId: null } as unknown as ChildProfileView
const extras: LearnerDetailExtras = { days: [], daysLabel: 'Term 4 school days', tonight: null }

const laptop = (hasOwn?: boolean) => render(<LaptopLearners v={v} classId="class-1" selected="child-1" detail={{ view, profile, extras }} hasOwn={hasOwn} />)

describe('the learner pane on the laptop', () => {
  it('has the link "Amina\'s own practice" to the read-only page when the learner has a private workspace, beside Long view', () => {
    laptop(true)
    const link = screen.getByRole('link', { name: "Amina's own practice" })
    expect(link.getAttribute('href')).toBe('/t/class-1/learners/child-1/own')
    const long = screen.getByRole('link', { name: 'Long view' })
    expect(long.parentElement).toBe(link.parentElement)
    expect(long.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no such link when the learner has none, or when nothing is said', () => {
    laptop(false)
    expect(screen.queryByRole('link', { name: /own practice/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Long view' })).toBeTruthy()
    document.body.innerHTML = ''
    laptop()
    expect(screen.queryByRole('link', { name: /own practice/ })).toBeNull()
  })

  it('the link is as tall and has the same room at the sides as the Long view button next to it', () => {
    laptop(true)
    const classes = (name: string) => screen.getByRole('link', { name }).className.split(/\s+/)
    for (const c of ['h-[46px]', 'px-[18px]', 'flex-none']) expect(classes("Amina's own practice")).toContain(c)
    expect(classes("Amina's own practice")).toEqual(expect.arrayContaining(classes('Long view')))
  })
})
