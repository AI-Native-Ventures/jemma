import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsSuggestion } from '@jemma/profiling/logic'
import type { LearnerToday } from '../lib/data/p27'
import type { MyMathsView } from '../lib/data/p80'
import { TABS, activeTabFor } from '../components/blocks/nav'

// P128: the learner has one main page. /k and /k/maths draw the same "My maths": the current thing first (tonight's lesson with Start, or the
// practice card: writing, failed with Try again, ready with Start), then the rest. The separate "Today" home and the Today tab are gone.
// The data, the router and the actions are doubles: no server, no browser, no database.

const state = vi.hoisted(() => ({ today: null as unknown, view: null as unknown, shape: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/k', notFound: () => {
  throw new Error('NEXT_NOT_FOUND')
} }))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p27', () => ({ getLearnerToday: async () => state.today }))
vi.mock('../lib/data/p80', () => ({ getMyMaths: async () => state.view }))
vi.mock('../lib/data/p120', () => ({ getPastPractice: async () => [] }))
vi.mock('../lib/data/own-screens', () => ({ getScreenShape: async () => state.shape }))
vi.mock('../app/k/join/JoinClassCard', () => ({ JoinClassCard: () => null }))

import Home from '../app/k/page'
import MyMathsPage from '../app/k/maths/page'

const score = (right: number, asked: number) => ({ right, asked })
const suggestion: MyMathsSuggestion = { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'new', reason: 'To fix', score: score(2, 6) }
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
const view = (over: Partial<MyMathsView> = {}): MyMathsView =>
  ({
    firstName: 'Amina',
    initial: 'A',
    status: 'free',
    maths: {
      subject: 'Mathematics',
      strands: [
        {
          family: 'fractions',
          label: 'Fractions',
          score: score(9, 16),
          topics: [
            { id: 't-add', name: 'Adding fractions', family: 'fractions', term: 4, position: 1, score: score(2, 6), gap: 'practising' },
            { id: 't-equiv', name: 'Equivalent fractions', family: 'fractions', term: 4, position: 2, score: score(5, 5), gap: 'fixed' },
          ],
        },
      ],
      gaps: [{ topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', stage: 'practising', score: score(2, 6) }],
      suggestions: [
        { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'new', reason: 'To fix', score: score(2, 6) },
        { topicId: 't-equiv', topicName: 'Equivalent fractions', family: 'fractions', why: 'fixed', reason: 'Keep it fixed', score: score(5, 5) },
      ],
    },
    ...over,
  }) as MyMathsView

const home = async () => render(await Home())
const maths = async () => render(await MyMathsPage())
const h1 = () => screen.getByRole('heading', { level: 1 }).textContent
const body = () => document.body.textContent ?? ''
/** The headings (level 2) in page order. */
const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

beforeEach(() => {
  cleanup()
  state.today = today()
  state.view = view()
  state.shape = { workspace: 'school' }
})

describe('/k and /k/maths are the one page', () => {
  it.each([
    ['school, nothing planned', () => today()],
    ['school, a lesson tonight', () => today({ tonight, practice: 'none', suggestion: null })],
    ['school, writing', () => today({ practice: 'writing', suggestion: null })],
    ['school, failed', () => today({ practice: 'failed', suggestion: null })],
  ])('%s: the same markup on both addresses', async (_name, make) => {
    state.today = make()
    const a = await home()
    const first = a.container.innerHTML
    cleanup()
    const b = await maths()
    expect(b.container.innerHTML).toBe(first)
  })

  it('the heading is "My maths" on both, and the only level 1', async () => {
    await home()
    expect(h1()).toBe('My maths')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    cleanup()
    await maths()
    expect(h1()).toBe('My maths')
  })
})

describe('the current thing comes first, in every state', () => {
  const first = () => document.querySelector('section')!
  const topicOrder = (a: string, b: string) => Boolean(screen.getByText(a).compareDocumentPosition(screen.getByText(b)) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('a lesson tonight: its card (Start) is the first card, ahead of the suggestions and the parts', async () => {
    state.today = today({ tonight, practice: 'none', suggestion: null })
    await home()
    expect(within(first()).getByRole('heading', { level: 2, name: 'Fractions of amounts' })).toBeTruthy()
    expect(within(first()).getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('/k/session/s1')
    expect(h2s().slice(0, 2)).toEqual(['Fractions of amounts', 'Suggested for you'])
    expect(topicOrder('Tonight', 'Your gaps')).toBe(true)
  })

  it('writing: the card "Jemma is writing your practice." is first, and the lock note does not say it twice', async () => {
    state.today = today({ practice: 'writing', suggestion: null })
    state.view = view({ status: 'writing' })
    await home()
    expect(within(first()).getByRole('heading', { level: 2, name: 'Jemma is writing your practice.' })).toBeTruthy()
    expect(screen.getAllByText('Jemma is writing your practice.')).toHaveLength(1)
    expect(screen.queryAllByRole('button', { name: /^Practise/ })).toHaveLength(0)
  })

  it('failed: the card with Try again is first', async () => {
    state.today = today({ practice: 'failed', suggestion: null })
    await home()
    expect(within(first()).getByRole('heading', { level: 2, name: 'Jemma could not write your practice.' })).toBeTruthy()
    expect(within(first()).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('ready: the suggestion card with its Practise button is first, and its topic is not listed a second time under "Suggested for you"', async () => {
    await home()
    expect(within(first()).getByRole('heading', { level: 2, name: 'Adding fractions' })).toBeTruthy()
    expect(within(first()).getByRole('button', { name: 'Practise Adding fractions' })).toBeTruthy()
    const list = within(screen.getByRole('region', { name: 'Suggested for you' }))
    expect(list.queryByText('Adding fractions')).toBeNull()
    expect(list.getByText('Equivalent fractions')).toBeTruthy()
    // no link to the page that this is
    expect(screen.queryByRole('link', { name: 'Choose something else' })).toBeNull()
  })

  it('nothing to practise yet: one plain line and no link back to this same page', async () => {
    state.today = today({ practice: 'none', suggestion: null })
    state.view = view({ maths: { subject: 'Mathematics', strands: [], gaps: [], suggestions: [] } as never })
    await home()
    expect(screen.getByText('Practice starts after your teacher marks a test.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'See my maths' })).toBeNull()
  })

  it('then the grades, the suggestions, the gaps (with the fixed-gaps line), the practice and the key and the parts, in that order', async () => {
    state.today = today({ practice: 'none', suggestion: null })
    await home()
    expect(h2s()).toEqual(['Suggested for you', 'Your gaps', 'All of Mathematics'])
    const gaps = screen.getByRole('region', { name: 'Your gaps' })
    expect(within(gaps).getByText(/You've fixed 1 gap so far/)).toBeTruthy()
  })
})

describe('the short line under "My maths" (the old home headings)', () => {
  const line = () => screen.getByRole('heading', { level: 1 }).parentElement!.nextElementSibling!.textContent

  it('a lesson tonight', async () => {
    state.today = today({ tonight, practice: 'none', suggestion: null })
    await home()
    expect(line()).toBe("Hi Amina. One thing tonight, then you're done.")
  })

  it('a learner on their own record', async () => {
    state.today = today({ workspace: 'own' })
    state.shape = { workspace: 'own', schoolGrade: 6, grades: [], picked: null }
    await home()
    expect(line()).toBe('What will you practise today, Amina?')
  })

  it('a school learner with nothing planned, with and without a later lesson booked', async () => {
    await home()
    expect(line()).toBe('No new lesson from your class tonight.')
    cleanup()
    state.today = today({ next: { day: 'Wednesday', topic: 'Adding decimals', minutes: 10, format: 'reading' } })
    await home()
    expect(line()).toBe('No new lesson from your class tonight. Your next lesson is on Wednesday.')
    expect(screen.getByRole('heading', { level: 2, name: 'Adding decimals' })).toBeTruthy()
  })
})

describe('the tabs: My maths and Me, and no Today', () => {
  it('the learner has two tabs: My maths (at /k) and Me', () => {
    expect(TABS.learner.map((t) => t.label)).toEqual(['My maths', 'Me'])
    expect(TABS.learner.map((t) => t.path)).toEqual(['', '/me'])
    expect(JSON.stringify(TABS.learner.map((t) => t.id))).not.toContain('today')
  })

  it('My maths is marked on /k, /k/maths and every screen below them; Me only on its own page', () => {
    for (const path of ['/k', '/k/maths', '/k/maths/fractions', '/k/maths/grades', '/k/own', '/k/upload', '/k/gaps', '/kit']) {
      expect(activeTabFor('learner', '/k', path), path).toBe('maths')
    }
    expect(activeTabFor('learner', '/k', '/k/me')).toBe('me')
    expect(activeTabFor('learner', '/k', '/k/mexico')).toBe('maths')
  })

  it('no screen of the learner says "Today" as a name of a place', async () => {
    await home()
    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull()
    expect(body()).not.toMatch(/Go to today/)
  })
})
