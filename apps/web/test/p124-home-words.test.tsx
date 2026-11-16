import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsSuggestion } from '@jemma/profiling/logic'
import type { LearnerToday } from '../lib/data/p27'

// The learner's home never shows a dead line (P124). Four headings by state: a learner on their own with nothing planned is asked what they will
// practise; a school learner with nothing planned is told plainly that no lesson comes from the class tonight (and, when one is booked, which day);
// a planned lesson keeps "Tonight" and Start. "You've fixed N gaps so far" is there from one fixed gap on, never at none. Nothing on a learner's own
// home speaks of a teacher, a school or a class. The data, the router and the actions are doubles.

const state = vi.hoisted(() => ({ today: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/k' }))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p27', () => ({ getLearnerToday: async () => state.today }))
// The "Join your school class" card reads the database by itself and has its own tests (p112-join-card.test.tsx).
vi.mock('../app/k/join/JoinClassCard', () => ({ JoinClassCard: () => null }))

import ChildToday from '../app/k/page'

const suggestion: MyMathsSuggestion = { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'new', reason: 'To fix', score: { right: 2, asked: 6 } }
const tonight = { sessionId: 's1', topic: 'Fractions of amounts', minutes: 10, format: 'reading', preview: null } as LearnerToday['tonight']
const today = (over: Partial<LearnerToday> = {}): LearnerToday => ({
  firstName: 'Amina',
  workspace: 'school',
  tonight: null,
  next: null,
  gems: ['full', 'empty', 'empty'],
  fixed: 1,
  toGo: 2,
  practice: 'ready',
  suggestion,
  ...over,
})
const page = async () => render(await ChildToday())
const h1 = () => screen.getByRole('heading', { level: 1 }).textContent
const body = () => document.body.textContent ?? ''

beforeEach(() => {
  cleanup()
  state.today = today()
})

describe('the four headings by state', () => {
  it('own record, nothing planned: "What will you practise today, {name}?" with the suggestion right under it', async () => {
    state.today = today({ workspace: 'own' })
    await page()
    expect(h1()).toBe('What will you practise today, Amina?')
    expect(body()).not.toContain('Nothing new tonight')
    const card = screen.getByText('Suggested for you').closest('section')!
    expect(card).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise Adding fractions' })).toBeTruthy()
    // right under the heading: no card between the heading and the suggestion
    const sections = Array.from(document.querySelectorAll('section'))
    expect(sections[0]).toBe(card)
  })

  it('own record on its own (no school at all), nothing planned: the same heading', async () => {
    state.today = today({ workspace: 'own', alone: true, firstName: 'Kagiso' })
    await page()
    expect(h1()).toBe('What will you practise today, Kagiso?')
  })

  it('school learner, nothing planned: "No new lesson from your class tonight." and the line "Pick something to practise." above the suggestion card', async () => {
    await page()
    expect(h1()).toBe('No new lesson from your class tonight.')
    expect(body()).not.toContain('Nothing new tonight')
    const line = screen.getByText('Pick something to practise.')
    const card = screen.getByText('Suggested for you').closest('section')!
    expect(line.tagName).toBe('P')
    expect(line.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise Adding fractions' })).toBeTruthy()
  })

  it('school learner, nothing planned and nothing to suggest: the heading, and no line that points at a card that is not there', async () => {
    state.today = today({ practice: 'none', suggestion: null })
    await page()
    expect(h1()).toBe('No new lesson from your class tonight.')
    expect(screen.queryByText('Pick something to practise.')).toBeNull()
    expect(screen.queryByText('Suggested for you')).toBeNull()
  })

  it('school learner, a later lesson booked: the heading says so and the card of that lesson stays', async () => {
    state.today = today({ next: { day: 'Wednesday', topic: 'Adding decimals', minutes: 10, format: 'reading' } })
    await page()
    expect(h1()).toBe('No new lesson from your class tonight. Your next lesson is on Wednesday.')
    expect(body()).not.toContain('Nothing new tonight')
    expect(screen.getByRole('heading', { level: 2, name: 'Adding decimals' })).toBeTruthy()
    expect(screen.getByText('Suggested for you')).toBeTruthy()
  })

  it('a planned lesson, school or own: "Tonight" and Start, unchanged', async () => {
    for (const workspace of ['school', 'own'] as const) {
      cleanup()
      state.today = today({ workspace, tonight, practice: 'none', suggestion: null })
      await page()
      expect(h1()).toBe("Hi Amina. One thing tonight, then you're done.")
      expect(screen.getByText('Tonight')).toBeTruthy()
      expect(screen.getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('/k/session/s1')
      expect(screen.queryByText('Pick something to practise.')).toBeNull()
    }
  })

  it('the writing state keeps its card under the heading (own and school)', async () => {
    state.today = today({ workspace: 'own', practice: 'writing', suggestion: null })
    await page()
    expect(h1()).toBe('What will you practise today, Amina?')
    expect(screen.getByText('Jemma is writing your practice.')).toBeTruthy()
    cleanup()
    state.today = today({ practice: 'writing', suggestion: null })
    await page()
    expect(h1()).toBe('No new lesson from your class tonight.')
    expect(screen.getByText('Jemma is writing your practice.')).toBeTruthy()
    expect(screen.queryByText('Pick something to practise.')).toBeNull()
  })
})

describe('the line "You\'ve fixed N gaps so far"', () => {
  const fixedLine = () => screen.queryByRole('link', { name: /You've fixed/ })

  it('is hidden at 0, on every screen of the home', async () => {
    for (const over of [{}, { workspace: 'own' as const }, { tonight }, { workspace: 'own' as const, tonight }]) {
      cleanup()
      state.today = today({ fixed: 0, toGo: 3, gems: ['empty', 'empty', 'empty'], ...over })
      await page()
      expect(fixedLine()).toBeNull()
      expect(body()).not.toMatch(/fixed 0|so far/)
    }
  })

  it('is singular at 1', async () => {
    state.today = today({ fixed: 1, toGo: 0, gems: ['full'] })
    await page()
    expect(fixedLine()!.textContent).toContain("You've fixed 1 gap so far")
    expect(body()).not.toContain('1 gaps')
  })

  it('is plural at 2, and at more, and still opens My maths', async () => {
    state.today = today({ fixed: 2, toGo: 0, gems: ['full', 'full'] })
    await page()
    expect(fixedLine()!.textContent).toContain("You've fixed 2 gaps so far")
    expect(fixedLine()!.getAttribute('href')).toBe('/k/maths')
    cleanup()
    state.today = today({ fixed: 3, tonight })
    await page()
    expect(fixedLine()!.textContent).toContain("You've fixed 3 gaps so far")
    expect(screen.getByText('2 more to go')).toBeTruthy()
  })
})

describe('an own record\'s home speaks of no teacher, no school and no class', () => {
  // Only two things on it name the school, both set by the switch (P95): the button "My school" and the line that says nothing here goes there.
  // A learner on their own (no school at all) has neither, so the whole home is checked for it.
  const words = /teacher|school|class/i
  const clean = () => body().replace('Your own practice. Nothing here goes to your school.', '').replace('My school', '')

  it('a twin in My own, nothing planned', async () => {
    state.today = today({ workspace: 'own' })
    await page()
    expect(clean()).not.toMatch(words)
  })

  it('a twin in My own, a lesson planned', async () => {
    state.today = today({ workspace: 'own', tonight })
    await page()
    expect(clean()).not.toMatch(words)
  })

  it('a learner on their own: not one such word, in any state', async () => {
    const own = { workspace: 'own' as const, alone: true, firstName: 'Kagiso' }
    for (const over of [{}, { fixed: 0, toGo: 0, gems: [] }, { practice: 'none' as const, suggestion: null }, { practice: 'writing' as const, suggestion: null }, { practice: 'failed' as const, suggestion: null }, { tonight }]) {
      cleanup()
      state.today = today({ ...own, ...over })
      await page()
      expect(body()).not.toMatch(words)
      expect(body()).not.toContain(String.fromCharCode(0x2014))
    }
  })
})

describe('the school home keeps its own words', () => {
  it('says nothing wrong about "class" on the school side and has no em dash', async () => {
    await page()
    expect(body()).not.toContain(String.fromCharCode(0x2014))
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('true')
  })
})
