import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'
import type { ScreenShape } from '../lib/data/own-screens'

// "My maths" when the workspace is My own (P95, P95c): the switch on top, a row of chips (one for each CLASS of the learner's private workspace: the
// CAPS class of a grade reads "Grade 6", a curriculum of the learner's own reads "Grade 6 \u00b7 {its name}"; the chosen one filled; and "+ Another
// grade"), one plain line above a class of a grade higher than the learner's own, "No topics yet" for a class with no map, and the links into a part
// that keep the class. The address is `?class=<id>`; `?grade=N` is the old form and means the CAPS class of that grade. In My school the screen is as
// it always was. The data, the router and the actions are doubles.

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
// P120: "Your practice" on My maths reads the learner's finished practices; this test has none.
vi.mock('../lib/data/p120', () => ({ getPastPractice: async () => [] }))
vi.mock('../lib/data/own-screens', () => ({
  getScreenShape: async (query?: unknown) => {
    state.gradeParams.push(query)
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

const OWN_NAME = "My school's Term 1 plan"
/** The CAPS classes of `grades`, then the learner's own curricula `extra` (grade, class id, name), in the order the list gives them: by grade, CAPS first. */
const own = (picked: number | string | null, grades = [6, 7], schoolGrade = 6, extra: { grade: number; classId: string; name: string }[] = []): ScreenShape => {
  const chips = [...grades.map((g) => ({ classId: `c${g}`, grade: g, caps: true, name: `Grade ${g} (my own)` })), ...extra.map((e) => ({ ...e, caps: false }))].sort(
    (a, b) => a.grade - b.grade || Number(b.caps) - Number(a.caps),
  )
  const found = typeof picked === 'string' ? chips.find((c) => c.classId === picked) : chips.find((c) => c.caps && c.grade === picked)
  return { workspace: 'own', schoolGrade, grades: chips, picked: picked === null ? null : (found ?? null) }
}

type Query = { grade?: string; class?: string }
const queryOf = (q?: string | Query): Query => (typeof q === 'string' ? { grade: q } : (q ?? {}))
const page = async (query?: string | Query) => render(await MyMathsPage({ searchParams: Promise.resolve(queryOf(query)) }))
const part = async (family: string, query?: string | Query) => render(await MyMathsPartPage({ params: Promise.resolve({ family }), searchParams: Promise.resolve(queryOf(query)) }))

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
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/k/maths?class=c6', '/k/maths?class=c7', '/k/maths/grades'])
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

  it('hands the address (the class and the grade in it) to the server and shows the map of the chosen class', async () => {
    state.shape = own(7)
    await page('7')
    expect(state.gradeParams).toEqual([{ grade: '7' }])
    expect(state.asked).toEqual(['c7'])
    state.gradeParams = []
    await page({ class: 'c7' })
    expect(state.gradeParams).toEqual([{ class: 'c7' }])
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

describe('the chips of a learner who has their own curriculum of a grade (P95c)', () => {
  const extra = [{ grade: 6, classId: 'own6', name: OWN_NAME }]

  it('has a chip for each class: "Grade 6" for the CAPS class and "Grade 6 \u00b7 {name}" for the own curriculum, in grade order', async () => {
    state.shape = own('c6', [6, 7], 6, extra)
    await page()
    const nav = screen.getByRole('navigation', { name: 'Grades' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Grade 6', `Grade 6 \u00b7 ${OWN_NAME}`, 'Grade 7', '+ Another grade'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/k/maths?class=c6', '/k/maths?class=own6', '/k/maths?class=c7', '/k/maths/grades'])
  })

  it('a long name is cut with an ellipsis in the chip and whole in the aria-label', async () => {
    const long = 'My school curriculum for the whole of the year, all four terms'
    state.shape = own('c6', [6], 6, [{ grade: 6, classId: 'own6', name: long }])
    await page()
    const chip = within(screen.getByRole('navigation', { name: 'Grades' })).getByRole('link', { name: `Grade 6 \u00b7 ${long}` })
    expect(chip.textContent!.endsWith('\u2026')).toBe(true)
    expect(chip.textContent).not.toContain('all four terms')
    expect(chip.getAttribute('aria-label')).toBe(`Grade 6 \u00b7 ${long}`)
  })

  it('the chosen class is the filled one: the own curriculum when it is chosen, never the CAPS class of its grade as well', async () => {
    state.shape = own('own6', [6, 7], 6, extra)
    await page({ class: 'own6' })
    const nav = within(screen.getByRole('navigation', { name: 'Grades' }))
    const current = nav.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.getAttribute('href'))).toEqual(['/k/maths?class=own6'])
    expect(current[0]!.className).toContain('bg-ink')
    expect(nav.getByRole('link', { name: 'Grade 6' }).className).not.toContain('bg-ink')
  })

  it('opens the own curriculum: the map asked for is the own class\'s, and its parts keep ?class= of it', async () => {
    state.shape = own('own6', [6, 7], 6, extra)
    await page({ class: 'own6' })
    expect(state.asked).toEqual(['own6'])
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getByRole('link', { name: /Numbers and operations/ }).getAttribute('href')).toBe('/k/maths/numbers?class=own6')
  })

  it('a part of the own curriculum goes back to the own curriculum', async () => {
    state.shape = own('own6', [6, 7], 6, extra)
    await part('numbers', { class: 'own6' })
    expect(state.asked).toEqual(['own6'])
    expect(document.querySelector('main a[href="/k/maths?class=own6"]')).toBeTruthy()
  })

  it('the old address ?grade=6 is handed to the server as it came (it means the CAPS class), and shows that class\'s map', async () => {
    state.shape = own(6, [6, 7], 6, extra)
    await page({ grade: '6' })
    expect(state.gradeParams).toEqual([{ grade: '6' }])
    expect(state.asked).toEqual(['c6'])
  })

  it('the line "Take your time" follows the grade of the class: an own curriculum of a higher grade has it, of the learner\'s grade has not', async () => {
    state.shape = own('own9', [6], 6, [{ grade: 9, classId: 'own9', name: 'Grade 9 plan' }])
    await page({ class: 'own9' })
    expect(screen.getByText('This is Grade 9 work. Take your time.')).toBeTruthy()
    cleanup()
    state.shape = own('own6', [6], 6, extra)
    await page({ class: 'own6' })
    expect(screen.queryByText(/Take your time/)).toBeNull()
  })

  it('an own class with no topics says "No topics yet for Grade N."', async () => {
    state.shape = own('own6', [6], 6, extra)
    state.view = view(noTopics)
    await page({ class: 'own6' })
    expect(screen.getByText('No topics yet for Grade 6.')).toBeTruthy()
  })
})

describe('the way to the learner\'s own work (P97\'s pages at /k/own)', () => {
  it('My own has one row "Add your own work" with its line, linking to /k/own, right under the grade chips', async () => {
    await page('7')
    const link = screen.getByRole('link', { name: /Add your own work/ })
    expect(link.getAttribute('href')).toBe('/k/own')
    expect(link.textContent).toContain('A marked test or your own curriculum.')
    expect(screen.getAllByRole('link', { name: /Add your own work/ })).toHaveLength(1)
    const chips = screen.getByRole('navigation', { name: 'Grades' })
    expect(chips.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const suggested = screen.getByRole('heading', { level: 2, name: 'Suggested for you' })
    expect(link.compareDocumentPosition(suggested) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is there for a grade with no topics, and for a learner with no grade yet', async () => {
    state.shape = own(9, [6, 9])
    state.view = view(noTopics)
    await page('9')
    expect(screen.getAllByRole('link', { name: /Add your own work/ })).toHaveLength(1)
    cleanup()
    state.shape = own(null, [])
    state.view = view([])
    await page()
    expect(screen.getAllByRole('link', { name: /Add your own work/ })).toHaveLength(1)
  })

  it('the row is tall, has room at the sides and no fixed height', async () => {
    await page('7')
    const classes = screen.getByRole('link', { name: /Add your own work/ }).className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(classes.some((c) => /^px-(4|5|6)$/.test(c) || /^pl-/.test(c))).toBe(true)
    expect(classes.some((c) => /^h-\d|^h-\[/.test(c))).toBe(false)
  })

  it('My school has no such row, and the part page has none', async () => {
    state.shape = { workspace: 'school' }
    await page()
    expect(screen.queryByRole('link', { name: /Add your own work/ })).toBeNull()
    cleanup()
    state.shape = own(7)
    await part('numbers', '7')
    expect(screen.queryByRole('link', { name: /Add your own work/ })).toBeNull()
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
  it('lists the parts of the class\'s own map with the learner\'s count, and each part keeps the class in its link', async () => {
    await page('7')
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getByRole('link', { name: /Numbers and operations/ }).getAttribute('href')).toBe('/k/maths/numbers?class=c7')
    expect(all.getByRole('link', { name: /Patterns and algebra/ }).getAttribute('href')).toBe('/k/maths/patterns?class=c7')
    // the one topic of Numbers and operations is 6 of 10: half a circle, started and not yet secure (P122)
    expect(all.getByText('0 of 1 secure \u00b7 1 started')).toBeTruthy()
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
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('one part of Mathematics in My own', () => {
  it('shows the part of the class in the address and goes back to that class', async () => {
    await part('numbers', { class: 'c7' })
    expect(state.gradeParams).toEqual([{ class: 'c7' }])
    expect(state.asked).toEqual(['c7'])
    expect(screen.getByRole('heading', { level: 1, name: 'Numbers and operations' })).toBeTruthy()
    expect(document.querySelector('main a[href="/k/maths?class=c7"]')).toBeTruthy()
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
