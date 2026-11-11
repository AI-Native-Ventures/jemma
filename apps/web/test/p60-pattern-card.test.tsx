import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PatternCard } from '@/app/t/[classId]/learners/[childId]/long-view/PatternCard'
import type { LvEvidence, LvPattern } from '@/lib/data/p52'

// The decisions are server actions, and these tests only look at the source chips.
vi.mock('@/app/t/[classId]/learners/[childId]/long-view/actions', () => ({
  approvePattern: vi.fn(),
  dismissPattern: vi.fn(),
  markDiscussed: vi.fn(),
  restorePattern: vi.fn(),
}))

const answer = (n: number): LvEvidence => ({ kind: 'result', id: `res-${n}`, label: `Class Test 1 · Q${n}`, href: `/t/c/papers/p?q=${n}` })
const record = (n: number): LvEvidence => ({
  kind: 'record',
  id: `rec-${n}`,
  label: `Quiz ${n}, Mrs Naidoo, ${n} Feb 2026`,
  sheet: { title: `Quiz ${n}`, teacher: 'Mrs Naidoo', grade: 5, term: 3, date: `${n} Feb 2026`, marks: '8 out of 20', text: null, late: false },
})

const pattern = (evidence: LvEvidence[]): LvPattern => ({
  id: 'pat-1',
  kind: 'struggle',
  family: 'fractions',
  strand: 'Fractions',
  title: 'Adding fractions is hard when the bottom numbers differ',
  statement: 'Marks in fractions stayed low.',
  runTerms: 3,
  pill: 'Struggle · 3 terms running',
  since: null,
  evidence,
  status: 'draft',
  active: true,
  noLongerShows: false,
  approvedOn: null,
  discussedOn: null,
  discussedBy: null,
  dismissedOn: null,
})

const sources = () => screen.getByRole('region', { name: /^Where this comes from/ })
/** The chips are the links and the buttons that open a sheet. The "Show all" button is not a source. */
const chips = () => within(sources()).queryAllByRole('link').concat(within(sources()).queryAllByRole('button').filter((b) => !b.hasAttribute('aria-expanded')))

describe('the source chips of a pattern', () => {
  it('shows every chip and no button when there are 4 sources or fewer', () => {
    render(<PatternCard p={pattern([answer(1), answer(2), record(3), record(4)])} parentName="Thandi" />)
    expect(chips()).toHaveLength(4)
    expect(within(sources()).queryByRole('button', { name: /^Show/ })).toBeNull()
  })

  it('shows the first 3 chips and "Show all N" when there are more than 4', () => {
    render(<PatternCard p={pattern([answer(1), answer(2), answer(3), answer(4), record(5)])} parentName="Thandi" />)
    expect(chips().map((c) => c.textContent?.trim())).toEqual(['Class Test 1 · Q1', 'Class Test 1 · Q2', 'Class Test 1 · Q3'])
    const more = within(sources()).getByRole('button', { name: 'Show all 5' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows all of them when tapped, in the same order, and "Show fewer" puts them away again', () => {
    render(<PatternCard p={pattern([answer(1), answer(2), answer(3), answer(4), record(5)])} parentName="Thandi" />)
    fireEvent.click(within(sources()).getByRole('button', { name: 'Show all 5' }))
    expect(chips().map((c) => c.textContent?.trim())).toEqual([
      'Class Test 1 · Q1',
      'Class Test 1 · Q2',
      'Class Test 1 · Q3',
      'Class Test 1 · Q4',
      'Quiz 5, Mrs Naidoo, 5 Feb 2026',
    ])
    const fewer = within(sources()).getByRole('button', { name: 'Show fewer' })
    expect(fewer.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(fewer)
    expect(chips()).toHaveLength(3)
    expect(within(sources()).getByRole('button', { name: 'Show all 5' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('still opens the sheet from a chip that was hidden', () => {
    render(<PatternCard p={pattern([answer(1), answer(2), answer(3), answer(4), record(5)])} parentName="Thandi" />)
    fireEvent.click(within(sources()).getByRole('button', { name: 'Show all 5' }))
    fireEvent.click(within(sources()).getByRole('button', { name: /Quiz 5/ }))
    const sheet = screen.getByRole('dialog')
    expect(sheet.textContent).toContain('Quiz 5')
    expect(sheet.textContent).toContain('8 out of 20')
  })

  it('makes the button easy to tap: a real button, at least 44 px tall by its class', () => {
    render(<PatternCard p={pattern([answer(1), answer(2), answer(3), answer(4), record(5)])} parentName="Thandi" />)
    const more = within(sources()).getByRole('button', { name: 'Show all 5' })
    expect(more.tagName).toBe('BUTTON')
    expect(more.getAttribute('type')).toBe('button')
    expect(more.className).toMatch(/min-h-11/)
  })
})
