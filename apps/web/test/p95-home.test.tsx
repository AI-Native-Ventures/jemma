import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsSuggestion } from '@jemma/profiling/logic'
import type { LearnerToday } from '../lib/data/p27'

// The learner's home in My own (P95): the switch on top with the one line under it, the card "Pick something to practise" when there is nothing
// planned and nothing suggested, and words that never speak of a teacher or the school. In My school the home says what it always said.
// The data, the router and the actions are doubles.

const state = vi.hoisted(() => ({ today: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/k' }))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p27', () => ({ getLearnerToday: async () => state.today }))

import ChildToday from '../app/k/page'
import { PracticeCard } from '../app/k/PracticeCard'

const suggestion: MyMathsSuggestion = { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'new', reason: 'To fix', score: { right: 2, asked: 6 } }
const today = (over: Partial<LearnerToday> = {}): LearnerToday => ({
  firstName: 'Amina',
  workspace: 'own',
  tonight: null,
  next: null,
  gems: ['full', 'empty', 'empty'],
  fixed: 1,
  toGo: 2,
  practice: 'none',
  suggestion: null,
  ...over,
})
const page = async () => render(await ChildToday())

beforeEach(() => {
  state.today = today()
})

describe('the home in My own', () => {
  it('has the switch at the top, above the heading, with My own pressed and the one line under it', async () => {
    await page()
    const group = screen.getByRole('group', { name: 'Where you practise' })
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Your own practice. Nothing here goes to your school.')).toBeTruthy()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(group.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('with no session and no suggestion it offers the card "Pick something to practise", which links to My maths', async () => {
    await page()
    const card = screen.getByRole('region', { name: 'Pick something to practise' })
    expect(card.textContent).toContain('Pick a topic in My maths to start.')
    const link = screen.getByRole('link', { name: 'See my maths' })
    expect(link.getAttribute('href')).toBe('/k/maths')
    expect(card.contains(link)).toBe(true)
  })

  it('says nothing about a teacher or a test being marked (the only school is the line that says nothing goes there)', async () => {
    await page()
    expect(document.body.textContent).not.toMatch(/teacher|marks a test/i)
    expect(document.body.textContent!.replace('Your own practice. Nothing here goes to your school.', '').replace('My school', '')).not.toMatch(/school/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })

  it('with a suggestion it shows the suggestion as before and not the empty card', async () => {
    state.today = today({ practice: 'ready', suggestion })
    await page()
    expect(screen.getByText('Suggested for you')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise Adding fractions' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Pick something to practise' })).toBeNull()
  })

  it('with a session tonight it shows the switch and the Start card', async () => {
    state.today = today({ tonight: { sessionId: 's1', topic: 'Fractions of amounts', minutes: 10, format: 'reading', preview: null } as LearnerToday['tonight'] })
    await page()
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('/k/session/s1')
    expect(screen.queryByRole('region', { name: 'Pick something to practise' })).toBeNull()
  })
})

describe('the way to the learner\'s own work (P97\'s pages at /k/own)', () => {
  it('My own has one card "Add your own work" with its line, linking to /k/own', async () => {
    await page()
    const link = screen.getByRole('link', { name: /Add your own work/ })
    expect(link.getAttribute('href')).toBe('/k/own')
    expect(link.textContent).toContain('A marked test or your own curriculum.')
    expect(screen.getAllByRole('link', { name: /Add your own work/ })).toHaveLength(1)
  })

  it('the card is also there with a session tonight, and with a suggestion', async () => {
    state.today = today({ tonight: { sessionId: 's1', topic: 'Fractions of amounts', minutes: 10, format: 'reading', preview: null } as LearnerToday['tonight'] })
    await page()
    expect(screen.getAllByRole('link', { name: /Add your own work/ })).toHaveLength(1)
    cleanup()
    state.today = today({ practice: 'ready', suggestion })
    await page()
    expect(screen.getAllByRole('link', { name: /Add your own work/ })).toHaveLength(1)
  })

  it('the card is tall, has room at the sides and no fixed height (the P90 rule)', async () => {
    await page()
    const classes = screen.getByRole('link', { name: /Add your own work/ }).className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('min-h-') || /^py-/.test(c))).toBe(true)
    expect(classes.some((c) => /^px-(4|5|6)$/.test(c) || /^pl-/.test(c))).toBe(true)
    expect(classes.some((c) => /^h-\d|^h-\[/.test(c))).toBe(false)
  })

  it('My school has no such card', async () => {
    state.today = today({ workspace: 'school' })
    await page()
    expect(screen.queryByRole('link', { name: /Add your own work/ })).toBeNull()
    state.today = today({ workspace: 'school', tonight: { sessionId: 's1', topic: 'Fractions of amounts', minutes: 10, format: 'reading', preview: null } as LearnerToday['tonight'] })
    cleanup()
    await page()
    expect(screen.queryByRole('link', { name: /Add your own work/ })).toBeNull()
  })
})

describe('the home in My school', () => {
  beforeEach(() => {
    state.today = today({ workspace: 'school' })
  })

  it('has the switch with My school pressed and no line about your own practice', async () => {
    await page()
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText(/own practice/i)).toBeNull()
  })

  it('with nothing to practise says what it always said, about the teacher', async () => {
    await page()
    expect(screen.getByText('Practice starts after your teacher marks a test.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Pick something to practise' })).toBeNull()
  })

  it('with a session tonight it has the switch too', async () => {
    state.today = today({ workspace: 'school', tonight: { sessionId: 's1', topic: 'Fractions of amounts', minutes: 10, format: 'reading', preview: null } as LearnerToday['tonight'] })
    await page()
    expect(screen.getByRole('group', { name: 'Where you practise' })).toBeTruthy()
  })
})

describe('the practice card by workspace', () => {
  it('own: the states where nothing can be practised (none, or ready with no suggestion) both give the card', () => {
    const { unmount } = render(<PracticeCard state="none" suggestion={null} workspace="own" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Pick something to practise' })).toBeTruthy()
    unmount()
    render(<PracticeCard state="ready" suggestion={null} workspace="own" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Pick something to practise' })).toBeTruthy()
  })

  it('own: the writing and the failed states are the same words as in My school, with nothing about a teacher', () => {
    const { unmount } = render(<PracticeCard state="writing" suggestion={null} workspace="own" />)
    expect(screen.getByText('Jemma is writing your practice.')).toBeTruthy()
    unmount()
    render(<PracticeCard state="failed" suggestion={null} workspace="own" />)
    expect(screen.getByText('Jemma could not write your practice.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/teacher/i)
  })

  it('the school keeps its line when no workspace is given (the card of every caller before My own)', () => {
    render(<PracticeCard state="none" suggestion={null} />)
    expect(screen.getByText('Practice starts after your teacher marks a test.')).toBeTruthy()
  })

  it('the card\'s link is tall and has room at the sides', () => {
    render(<PracticeCard state="none" suggestion={null} workspace="own" />)
    const classes = screen.getByRole('link', { name: 'See my maths' }).className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(classes.some((c) => /^px-(5|6)$/.test(c))).toBe(true)
  })
})
