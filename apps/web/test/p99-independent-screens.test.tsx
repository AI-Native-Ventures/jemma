import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'
import type { ScreenShape } from '../lib/data/own-screens'
import type { LearnerToday } from '../lib/data/p27'

// The learner's screens for a child whose school does not use Jemma (P99): their own record is their My own, so there is no switch ("My school | My
// own") and the line under it is "Your own practice." with nothing about a school. Home, My maths and Add your own work all work, and not one line of
// them speaks of a teacher or a school. The data, the router and the actions are doubles.

const state = vi.hoisted(() => ({ today: null as unknown, view: null as unknown, shape: null as unknown, own: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/k', notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p27', () => ({ getLearnerToday: async () => state.today }))
// P112: the "Join your school class" card reads the database by itself; it has its own tests (p112-join-card.test.tsx).
vi.mock('../app/k/join/JoinClassCard', () => ({ JoinClassCard: () => null }))
vi.mock('../lib/data/p80', () => ({ getMyMaths: async () => state.view }))
// P120: "Your practice" on My maths reads the learner's finished practices; this test has none.
vi.mock('../lib/data/p120', () => ({ getPastPractice: async () => [] }))
vi.mock('../lib/data/own-screens', () => ({ getScreenShape: async () => state.shape }))
vi.mock('../lib/data/own-uploads', () => ({ getOwnHome: async () => state.own }))

import ChildToday from '../app/k/page'
import MyMathsPage from '../app/k/maths/page'
import AddOwnWorkPage from '../app/k/own/page'
import { CurriculumUpload } from '../app/k/own/curriculum/CurriculumUpload'
import { OWN_NOTE, OWN_NOTE_ALONE } from '../lib/own-grades'
import { WorkspaceSwitch } from '../app/k/WorkspaceSwitch'

vi.mock('@/lib/upload-client', () => ({ postFiles: vi.fn() }))
vi.mock('@/lib/shrink-photo', () => ({ shrinkPhoto: async (f: File) => f }))

const today = (over: Partial<LearnerToday> = {}): LearnerToday => ({
  firstName: 'Kagiso',
  workspace: 'own',
  alone: true,
  tonight: null,
  next: null,
  gems: ['full', 'empty'],
  fixed: 1,
  toGo: 1,
  practice: 'none',
  suggestion: null,
  ...over,
})
const score = (right: number, asked: number) => ({ right, asked })
const view = (): MyMathsView =>
  ({
    firstName: 'Kagiso',
    initial: 'K',
    status: 'free',
    maths: { subject: 'Mathematics', gaps: [], suggestions: [], strands: [{ family: 'algebra', label: 'Algebra', score: score(3, 5), topics: [{ id: 't1', name: 'Algebraic expressions', family: 'algebra', term: 1, position: 1, score: score(3, 5), gap: null }] }] },
  }) as unknown as MyMathsView
const chips = [8, 9].map((g) => ({ classId: `c${g}`, grade: g, caps: true, name: `Grade ${g} (my own)` }))
const shape = (over: Record<string, unknown> = {}): ScreenShape => ({ workspace: 'own', schoolGrade: 8, grades: chips, picked: chips[0]!, alone: true, ...over }) as ScreenShape

const body = () => document.body.textContent ?? ''

beforeEach(() => {
  cleanup()
  state.today = today()
  state.view = view()
  state.shape = shape()
  state.own = { workspace: 'own', firstName: 'Kagiso', tests: [], curricula: [], alone: true }
})

describe('the line and the switch', () => {
  it('the line for a child with no school is "Your own practice." and the other line is unchanged', () => {
    expect(OWN_NOTE_ALONE).toBe('Your own practice.')
    expect(OWN_NOTE).toBe('Your own practice. Nothing here goes to your school.')
  })

  it('WorkspaceSwitch with alone shows the line and no buttons at all', () => {
    render(<WorkspaceSwitch current="own" alone />)
    expect(screen.getByText('Your own practice.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Where you practise' })).toBeNull()
  })

  it('WorkspaceSwitch without alone is the switch it always was', () => {
    render(<WorkspaceSwitch current="own" />)
    expect(screen.getByRole('button', { name: 'My school' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Your own practice. Nothing here goes to your school.')).toBeTruthy()
  })
})

describe('the home', () => {
  it('has no switch and the line "Your own practice."', async () => {
    render(await ChildToday())
    expect(screen.queryByRole('group', { name: 'Where you practise' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'My school' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'My own' })).toBeNull()
    expect(screen.getByText('Your own practice.')).toBeTruthy()
  })

  it('says nothing about a school or a teacher', async () => {
    render(await ChildToday())
    expect(body()).not.toMatch(/school|teacher/i)
    expect(body()).not.toContain(String.fromCharCode(0x2014))
  })

  it('with a session tonight it has the line, the Start card and no switch', async () => {
    state.today = today({ tonight: { sessionId: 's1', topic: 'Algebraic expressions', minutes: 10, format: 'reading', preview: null } as LearnerToday['tonight'] })
    render(await ChildToday())
    expect(screen.queryByRole('group', { name: 'Where you practise' })).toBeNull()
    expect(screen.getByText('Your own practice.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('/k/session/s1')
    expect(body()).not.toMatch(/school|teacher/i)
  })

  it('has the way to Add your own work', async () => {
    render(await ChildToday())
    expect(screen.getByRole('link', { name: /Add your own work/ }).getAttribute('href')).toBe('/k/own')
  })

  it('a school learner’s home (no alone) still has the switch', async () => {
    state.today = today({ alone: false, workspace: 'school' })
    state.shape = { workspace: 'school' }
    render(await ChildToday())
    expect(screen.getByRole('group', { name: 'Where you practise' })).toBeTruthy()
  })
})

describe('My maths', () => {
  it('has the grade chips, + Another grade, no switch and the line "Your own practice."', async () => {
    render(await MyMathsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Your own practice.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Where you practise' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'My school' })).toBeNull()
    expect(screen.getAllByRole('link', { name: /^Grade (8|9)$/ })).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Another grade/ }).getAttribute('href')).toBe('/k/maths/grades')
    expect(body()).not.toMatch(/school|teacher/i)
  })

  it('a grade above the child’s own is "Take your time" and still says nothing of a school', async () => {
    state.shape = shape({ picked: chips[1] })
    render(await MyMathsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('This is Grade 9 work. Take your time.')).toBeTruthy()
    expect(body()).not.toMatch(/school|teacher/i)
  })
})

describe('Add your own work', () => {
  it('has no switch, the line, the two choices and no word of a school', async () => {
    render(await AddOwnWorkPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Add your own work' })).toBeTruthy()
    expect(screen.getByText('Your own practice.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Where you practise' })).toBeNull()
    expect(screen.getByRole('link', { name: /A marked test/ }).getAttribute('href')).toBe('/k/own/test')
    expect(screen.getByRole('link', { name: /Your own curriculum/ }).getAttribute('href')).toBe('/k/own/curriculum')
    expect(body()).not.toMatch(/school|teacher/i)
  })

  it('a twin’s own work keeps the school words it had', async () => {
    state.own = { workspace: 'own', firstName: 'Amina', tests: [], curricula: [] }
    render(await AddOwnWorkPage())
    expect(screen.getByRole('group', { name: 'Where you practise' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Your own curriculum/ }).textContent).toContain("Your school's plan or a book's contents. Jemma turns it into topics you check.")
  })

  it('the curriculum upload names the name box without a school in it for a child with no school', () => {
    render(<CurriculumUpload defaultGrade={8} alone />)
    expect(screen.getByLabelText('Name it, like "Term 1 plan"')).toBeTruthy()
    expect(body()).not.toMatch(/school|teacher/i)
    cleanup()
    render(<CurriculumUpload defaultGrade={6} />)
    expect(screen.getByLabelText('Name it, like "My school\'s Term 1 plan"')).toBeTruthy()
  })
})
