import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'
import type { ScreenShape } from '../lib/data/own-screens'

// "My maths" when the workspace is My own (P95): the switch on top, a row of grade chips (one for each grade the learner added, the chosen one
// filled, and "+ Another grade"), one plain line above a grade higher than the learner's own, "No topics yet" for a grade with no map, and the
// links into a part that keep the grade. In My school the screen is as it always was. The data, the router and the actions are doubles.

const state = vi.hoisted(() => ({ view: null as unknown, shape: null as unknown, asked: [] as (string | undefined)[], gradeParams: [] as unknown[] }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p80', () => ({
  getMyMaths: async (classId?: string) => {
    state.asked.push(classId)
    return state.view
  },
}))
vi.mock('../lib/data/own-screens', () => ({
  getScreenShape: async (grade?: unknown) => {
    state.gradeParams.push(grade)
    return state.shape
  },
}))

import MyMathsPage from '../app/k/maths/page'
import MyMathsPartPage from '../app/k/maths/[family]/page'

const score = (right: number, asked: number) => ({ right, asked })
const topic = (id: string, name: string, family: string, s = score(0, 0)) => ({ id, name, family, term: 1, position: 1, score: s, gap: null })
const withTopics = [
  { family: 'numbers', label: 'Numbers and operations', score: score(6, 10), topics: [topic('t1', 'Whole numbers to 1 000 000', 'numbers', score(6, 10))] },
  { family: 'patterns', label: 'Patterns and algebra', score: score(0, 0), topics: [topic('t2', 'Numeric patterns', 'patterns')] },
]
const noTopics = [
  { family: 'whole_numbers', label: 'Whole numbers', score: score(0, 0), topics: [] },
  { family: 'fractions', label: 'Fractions', score: score(0, 0), topics: [] },
]
const view = (strands: unknown[], suggestions: unknown[] = []): MyMathsView =>
  ({ firstName: 'Amina', initial: 'A', status: 'free', maths: { subject: 'Mathematics', strands, gaps: [], suggestions } }) as unknown as MyMathsView

const own = (picked: number | null, grades = [6, 7], schoolGrade = 6): ScreenShape => ({
  workspace: 'own',
  schoolGrade,
  grades: grades.map((g) => ({ classId: `c${g}`, grade: g })),
  picked: picked === null ? null : { classId: `c${picked}`, grade: picked },
})

const page = async (grade?: string) => render(await MyMathsPage({ searchParams: Promise.resolve(grade ? { grade } : {}) }))
const part = async (family: string, grade?: string) => render(await MyMathsPartPage({ params: Promise.resolve({ family }), searchParams: Promise.resolve(grade ? { grade } : {}) }))

beforeEach(() => {
  state.view = view(withTopics, [{ topicId: 't1', topicName: 'Whole numbers to 1 000 000', family: 'numbers', why: 'practising', reason: 'Practising', score: score(6, 10) }])
  state.shape = own(7)
  state.asked = []
  state.gradeParams = []
})

describe('the switch on My maths', () => {
  it('is at the top of the page, above the heading, with My own pressed in My own', async () => {
    await page()
    const group = screen.getByRole('group', { name: 'Where you practise' })
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('false')
    const heading = screen.getByRole('heading', { level: 1, name: 'My maths' })
    expect(group.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Your own practice. Nothing here goes to your school.')).toBeTruthy()
  })

  it('in My school it is there with My school pressed and no line about your own practice', async () => {
    state.shape = { workspace: 'school' }
    await page()
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText(/own practice/i)).toBeNull()
  })
})

describe('the grade chips', () => {
  it('has one chip for each grade the learner added and "+ Another grade" last', async () => {
    await page('7')
    const nav = screen.getByRole('navigation', { name: 'Grades' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Grade 6', 'Grade 7', '+ Another grade'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/k/maths?grade=6', '/k/maths?grade=7', '/k/maths/grades'])
  })

  it('the chosen grade is the filled one, and only that one is marked as the current page', async () => {
    await page('7')
    const nav = within(screen.getByRole('navigation', { name: 'Grades' }))
    expect(nav.getByRole('link', { name: 'Grade 7' }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('link', { name: 'Grade 7' }).className).toContain('bg-ink')
    expect(nav.getByRole('link', { name: 'Grade 6' }).getAttribute('aria-current')).toBeNull()
    expect(nav.getByRole('link', { name: 'Grade 6' }).className).not.toContain('bg-ink')
    expect(nav.getByRole('link', { name: '+ Another grade' }).getAttribute('aria-current')).toBeNull()
  })

  it('asks for the address\'s grade and shows the map of the chosen class', async () => {
    state.shape = own(7)
    await page('7')
    expect(state.gradeParams).toEqual(['7'])
    expect(state.asked).toEqual(['c7'])
  })

  it('the chips wrap (no sideways scroll) and each has room and a minimum height', async () => {
    await page('7')
    const nav = screen.getByRole('navigation', { name: 'Grades' })
    expect(nav.querySelector('ul')!.className).toContain('flex-wrap')
    for (const a of nav.querySelectorAll('a')) {
      const classes = a.className.split(/\s+/)
      expect(classes.some((c) => /^px-(4|5)$/.test(c))).toBe(true)
      expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
      expect(classes.some((c) => /^h-\d|^h-\[/.test(c))).toBe(false)
    }
  })

  it('has no chips in My school', async () => {
    state.shape = { workspace: 'school' }
    await page()
    expect(screen.queryByRole('navigation', { name: 'Grades' })).toBeNull()
    expect(state.asked).toEqual([undefined])
  })

  it('a learner with no grade yet has only "+ Another grade" and a line that says to add one', async () => {
    state.shape = own(null, [])
    state.view = view([])
    await page()
    const nav = within(screen.getByRole('navigation', { name: 'Grades' }))
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual(['+ Another grade'])
    expect(screen.getByText('Add a grade to start.')).toBeTruthy()
  })
})

describe('a grade above the learner\'s own', () => {
  it('has one plain line above its topics', async () => {
    state.shape = own(9, [6, 9])
    await page('9')
    const line = screen.getByText('This is Grade 9 work. Take your time.')
    expect(line.tagName).toBe('P')
    const suggested = screen.getByRole('heading', { level: 2, name: 'Suggested for you' })
    expect(line.compareDocumentPosition(suggested) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('only words: no warning colour, no alert role', async () => {
    state.shape = own(9, [6, 9])
    await page('9')
    const line = screen.getByText('This is Grade 9 work. Take your time.')
    expect(line.getAttribute('role')).toBeNull()
    expect(line.className).not.toMatch(/coral|red|amber|yellow|warn|border|bg-/)
  })

  it('the learner\'s own grade and a lower one have no such line', async () => {
    state.shape = own(6, [5, 6, 9])
    await page('6')
    expect(screen.queryByText(/work\. Take your time/)).toBeNull()
    await page('5')
    expect(screen.queryByText(/work\. Take your time/)).toBeNull()
  })

  it('My school never has it', async () => {
    state.shape = { workspace: 'school' }
    await page()
    expect(screen.queryByText(/Take your time/)).toBeNull()
  })
})

describe('the topics of a grade', () => {
  it('lists the parts of the grade\'s own map with the learner\'s count, and each part keeps the grade in its link', async () => {
    await page('7')
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getByRole('link', { name: /Numbers and operations/ }).getAttribute('href')).toBe('/k/maths/numbers?grade=7')
    expect(all.getByRole('link', { name: /Patterns and algebra/ }).getAttribute('href')).toBe('/k/maths/patterns?grade=7')
    expect(all.getByText('6 of 10 right')).toBeTruthy()
  })

  it('in My school a part\'s link has no grade', async () => {
    state.shape = { workspace: 'school' }
    await page()
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getByRole('link', { name: /Numbers and operations/ }).getAttribute('href')).toBe('/k/maths/numbers')
  })

  it('a grade with no topics says so and shows no empty list of parts', async () => {
    state.shape = own(9, [6, 9])
    state.view = view(noTopics)
    await page('9')
    expect(screen.getByText('No topics yet for Grade 9.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'All of Mathematics' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Suggested for you' })).toBeNull()
  })

  it('says nothing about a teacher or the school in My own', async () => {
    await page('7')
    expect(document.body.textContent).not.toMatch(/your teacher|the teacher/i)
    expect(document.body.textContent).not.toContain('—')
  })
})

describe('one part of Mathematics in My own', () => {
  it('shows the part of the grade in the address and goes back to that grade', async () => {
    await part('numbers', '7')
    expect(state.gradeParams).toEqual(['7'])
    expect(state.asked).toEqual(['c7'])
    expect(screen.getByRole('heading', { level: 1, name: 'Numbers and operations' })).toBeTruthy()
    expect(document.querySelector('main a[href="/k/maths?grade=7"]')).toBeTruthy()
  })

  it('in My school the way back is the plain My maths link', async () => {
    state.shape = { workspace: 'school' }
    await part('numbers')
    expect(document.querySelector('main a[href="/k/maths"]')).toBeTruthy()
  })

  it('a part with no topic of its own says "No topics yet for Grade N." and never "your teacher"', async () => {
    state.shape = own(9, [6, 9])
    state.view = view(noTopics)
    await part('fractions', '9')
    expect(screen.getByText('No topics yet for Grade 9.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/your teacher/i)
  })

  it('in My school the same part keeps the words it always had', async () => {
    state.shape = { workspace: 'school' }
    state.view = view(noTopics)
    await part('fractions')
    expect(screen.getByText("Your teacher has not set up this year's topics yet.")).toBeTruthy()
  })
})
