import { cleanup, render, screen, within } from '@testing-library/react'
import { buildMyMaths } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenShape } from '../lib/data/own-screens'
import type { MyMathsView } from '../lib/data/p80'

// P122: "My maths" shows progress at a glance. Each part has one circle for each topic of the part (filled by the learner's score, drawn like the
// teacher's Long view), with one short line under them, and each topic row of a part page starts with its circle. The data, the router and the
// actions are doubles: no database, no server, no browser.

const state = vi.hoisted(() => ({ view: null as unknown, shape: { workspace: 'school' } as unknown }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p80', () => ({ getMyMaths: async () => state.view }))
// P142: a part page asks the teaching library which topics have lessons; here none does, and nothing reaches a database.
vi.mock('../lib/data/teaching', () => ({ libraryNames: async () => new Set<string>() }))
vi.mock('../lib/data/own-screens', () => ({ getScreenShape: async () => state.shape }))
// P128: the page is also the learner's home, so it reads what the home read. The workspace follows the shape the test chose; nothing planned, nothing to practise.
vi.mock('../lib/data/p27', () => ({
  getLearnerToday: async () => ({ firstName: 'Amina', workspace: (state.shape as { workspace: string }).workspace, tonight: null, next: null, gems: [], fixed: 0, toGo: 0, practice: 'none', suggestion: null }),
}))
vi.mock('../app/k/join/JoinClassCard', () => ({ JoinClassCard: () => null }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))

import MyMathsPage from '../app/k/maths/page'
import MyMathsPartPage from '../app/k/maths/[family]/page'

const NOW = new Date('2026-11-16T10:00:00.000Z')
const topic = (id: string, name: string, family: string, term: number, position: number) => ({ id, name, family, term, position, prerequisiteIds: [] as string[] })
const marked = (topicId: string, topicName: string, family: string, right: number, wrong: number) =>
  Array.from({ length: right + wrong }, (_, i) => ({ topicId, topicName, family, correct: i < right, paperStatus: 'marked', testHeld: false as boolean | null }))
const practised = (topicId: string, topicName: string, family: string, right: number, wrong: number) => ({
  topicId,
  topicName,
  family,
  status: 'done',
  finishedAt: '2026-11-15T10:00:00.000Z',
  items: Array.from({ length: right + wrong }, (_, i) => ({ phase: 'try', correct: i < right })),
})

// Ten algebra topics, ten circles: full (5 of 5), full (4 of 5), half (3 of 5), empty (2 of 5), empty (0 of 3) and five not tried.
const ALGEBRA = Array.from({ length: 10 }, (_, i) => topic(`a${i + 1}`, `Algebra topic ${i + 1}`, 'algebra', 1 + Math.floor(i / 4), i + 1))
const OTHER = [topic('f1', 'Straight line graphs', 'functions', 1, 1), topic('f2', 'Parabolas', 'functions', 1, 2)]

const viewOf = (topics: ReturnType<typeof topic>[], answers: ReturnType<typeof marked> = [], sessions: ReturnType<typeof practised>[] = [], source?: MyMathsView['source'], grade = 9): MyMathsView => ({
  firstName: 'Sam',
  initial: 'S',
  status: 'free',
  maths: buildMyMaths({ now: NOW, subject: 'Mathematics', grade, topics, gaps: [], answers, sessions, history: [] }),
  ...(source ? { source } : {}),
})

const ANSWERS = [
  ...marked('a1', 'Algebra topic 1', 'algebra', 5, 0),
  ...marked('a2', 'Algebra topic 2', 'algebra', 4, 1),
  ...marked('a3', 'Algebra topic 3', 'algebra', 3, 2),
  ...marked('a4', 'Algebra topic 4', 'algebra', 2, 3),
  ...marked('a5', 'Algebra topic 5', 'algebra', 0, 3),
]

const page = async (query: { class?: string; grade?: string } = {}) => render(await MyMathsPage({ searchParams: Promise.resolve(query) }))
const part = async (family: string, query: { class?: string } = {}) => render(await MyMathsPartPage({ params: Promise.resolve({ family }), searchParams: Promise.resolve(query) }))
const levelsIn = (el: HTMLElement): string[] => [...el.querySelectorAll('svg[data-dot]')].map((d) => d.getAttribute('data-dot') ?? '')
const row = (name: RegExp) => within(screen.getByRole('region', { name: 'All of Mathematics' })).getByRole('link', { name })

beforeEach(() => {
  state.view = viewOf([...ALGEBRA, ...OTHER], ANSWERS)
  state.shape = { workspace: 'school' }
})

describe('/k/maths: the circles of a part', () => {
  it('a part with 10 topics has 10 circles, filled in map order by each topic score', async () => {
    await page()
    const algebra = row(/Algebra/)
    expect(levelsIn(algebra)).toEqual(['full', 'full', 'half', 'empty', 'empty', 'none', 'none', 'none', 'none', 'none'])
    expect(algebra.querySelectorAll('svg[data-dot]')).toHaveLength(10)
  })

  it('draws each level like the Long view: solid, left half filled, white with an outline, dashed', async () => {
    await page()
    const dots = [...row(/Algebra/).querySelectorAll('svg[data-dot]')]
    const byLevel = (l: string) => dots.find((d) => d.getAttribute('data-dot') === l)!
    expect(byLevel('full').querySelector('circle')?.getAttribute('fill')).toBe('#1F1D36')
    expect(byLevel('half').querySelector('circle')?.getAttribute('fill')).toBe('#FFFFFF')
    expect(byLevel('half').querySelector('path')?.getAttribute('d')).toBe('M7 1.7a5.3 5.3 0 0 0 0 10.6z')
    expect(byLevel('half').querySelector('path')?.getAttribute('fill')).toBe('#1F1D36')
    expect(byLevel('empty').querySelector('circle')?.getAttribute('fill')).toBe('#FFFFFF')
    expect(byLevel('empty').querySelector('circle')?.getAttribute('stroke')).toBe('#1F1D36')
    expect(byLevel('empty').querySelector('path')).toBeNull()
    expect(byLevel('none').querySelector('circle')?.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(byLevel('none').querySelector('circle')?.getAttribute('stroke')).toBe('#8C89A3')
  })

  it('says one short line under the circles: "2 of 10 secure · 3 started"', async () => {
    await page()
    expect(within(row(/Algebra/)).getByText('2 of 10 secure · 3 started')).toBeTruthy()
  })

  it('the circles have one label for a screen reader, and the row is still a link into the part', async () => {
    await page()
    const algebra = row(/Algebra/)
    expect(algebra.getAttribute('href')).toBe('/k/maths/algebra')
    expect(within(algebra).getByRole('img', { name: 'Algebra: 2 of 10 topics at 80 percent or more, 3 started, 5 not tried' })).toBeTruthy()
    // the circles alone are hidden from a screen reader: only the group speaks
    expect(algebra.querySelectorAll('svg[data-dot][aria-hidden="true"]')).toHaveLength(10)
  })

  it('a part where no topic was tried says "Not started yet" and shows only dashed circles', async () => {
    await page()
    const functions = row(/Functions/)
    expect(levelsIn(functions)).toEqual(['none', 'none'])
    expect(within(functions).getByText('Not started yet')).toBeTruthy()
  })

  it('a topic counts the school marks and the practice together, exactly as its row says: 3 of 5 on paper is half, with 5 of 5 in practices it is 8 of 10 and full', async () => {
    state.view = viewOf([...ALGEBRA], marked('a1', 'Algebra topic 1', 'algebra', 3, 2))
    await page()
    expect(levelsIn(row(/Algebra/))[0]).toBe('half')
    cleanup()
    state.view = viewOf([...ALGEBRA], marked('a1', 'Algebra topic 1', 'algebra', 3, 2), [practised('a1', 'Algebra topic 1', 'algebra', 5, 0)])
    await page()
    expect(levelsIn(row(/Algebra/))[0]).toBe('full')
    cleanup()
    await part('algebra')
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('8 of 10 right')).toBeTruthy()
  })

  it('a part with no topic in the map keeps its count in words and has no circle', async () => {
    const answers = marked('x', 'Fractions', 'fractions', 3, 2)
    state.view = viewOf([], answers, [], undefined, 6)
    await page()
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getByText('3 of 5 right')).toBeTruthy()
    expect(all.getAllByText('No score yet')).toHaveLength(5)
    expect(document.querySelectorAll('svg[data-dot]')).toHaveLength(0)
    // no circle on the screen, so no key either
    expect(document.querySelectorAll('[data-legend]')).toHaveLength(0)
  })
})

describe('/k/maths: the key', () => {
  it('shows once, above the list: 80% or more, 50 to 79, below 50, not tried', async () => {
    await page()
    const keys = document.querySelectorAll('[data-legend]')
    expect(keys).toHaveLength(1)
    expect(keys[0]!.textContent).toBe('80% or more50 to 79below 50not tried')
    expect(levelsIn(keys[0] as HTMLElement)).toEqual(['full', 'half', 'empty', 'none'])
    // above the list of parts, under its heading
    const section = screen.getByRole('region', { name: 'All of Mathematics' })
    expect(section.firstElementChild?.tagName).toBe('H2')
    expect(section.children[1]).toBe(keys[0])
    expect(section.children[2]?.tagName).toBe('UL')
  })
})

describe('/k/maths/[family]: a circle for each topic', () => {
  it('each topic row starts with its circle, then the name and the count as before', async () => {
    state.view = viewOf(ALGEBRA, ANSWERS, [], { caps: true, grade: 9 })
    await part('algebra')
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => levelsIn(r))).toEqual([['full'], ['full'], ['half'], ['empty'], ['empty'], ['none'], ['none'], ['none'], ['none'], ['none']])
    // the circle comes first in its row, before the name
    expect(rows[2]!.querySelector('svg[data-dot]')!.compareDocumentPosition(within(rows[2]!).getByText('Algebra topic 3'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(within(rows[2]!).getByText('3 of 5 right')).toBeTruthy()
    expect(within(rows[5]!).getByText('No score yet')).toBeTruthy()
  })

  it('stays under the term headings of the CAPS map', async () => {
    state.view = viewOf(ALGEBRA, ANSWERS, [], { caps: true, grade: 9 })
    await part('algebra')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Term 1', 'Term 2', 'Term 3'])
    expect(levelsIn(within(screen.getByRole('region', { name: 'Term 1' })).getByRole('list'))).toEqual(['full', 'full', 'half', 'empty'])
    expect(levelsIn(within(screen.getByRole('region', { name: 'Term 3' })).getByRole('list'))).toEqual(['none', 'none'])
  })

  it('a map that is not CAPS keeps its flat list, each topic with its circle', async () => {
    state.view = viewOf(ALGEBRA, ANSWERS)
    await part('algebra')
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    expect(levelsIn(screen.getByRole('list'))).toHaveLength(10)
  })

  it('the circle of a topic has a label for a screen reader', async () => {
    state.view = viewOf(ALGEBRA, ANSWERS)
    await part('algebra')
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByRole('img', { name: '80 percent or more' })).toBeTruthy()
    expect(within(rows[2]!).getByRole('img', { name: '50 to 79 percent' })).toBeTruthy()
    expect(within(rows[3]!).getByRole('img', { name: 'below 50 percent' })).toBeTruthy()
    expect(within(rows[9]!).getByRole('img', { name: 'not tried yet' })).toBeTruthy()
  })

  it('has the key once above the topics, and a part with no topic has no key', async () => {
    state.view = viewOf(ALGEBRA, ANSWERS)
    await part('algebra')
    expect(document.querySelectorAll('[data-legend]')).toHaveLength(1)
    expect(screen.getAllByText('80% or more')).toHaveLength(1)
  })

  it('a part with no topic in the map has no circle and no key, only its one button', async () => {
    state.view = viewOf([], [], [], undefined, 6)
    await part('decimals')
    expect(document.querySelectorAll('svg[data-dot]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-legend]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Practise Decimals' })).toBeTruthy()
  })

  it('a topic while tonight\'s lesson waits still has its circle, and no Practise button', async () => {
    state.view = { ...viewOf(ALGEBRA, ANSWERS), status: 'due' } as MyMathsView
    await part('algebra')
    expect(levelsIn(screen.getAllByRole('listitem')[0]!)).toEqual(['full'])
    expect(screen.queryAllByRole('button', { name: /^Practise/ })).toHaveLength(0)
  })
})

describe('both workspaces, primary and senior', () => {
  const own = (grade: number): ScreenShape => ({ workspace: 'own', schoolGrade: 6, grades: [{ classId: `c${grade}`, grade, caps: true, name: `Grade ${grade} (my own)` }], picked: { classId: `c${grade}`, grade, caps: true, name: `Grade ${grade} (my own)` } }) as ScreenShape

  it('My own, a primary grade: the six parts of a CAPS class have circles and the link keeps the class', async () => {
    const primary = [topic('n1', 'Whole numbers to 1 000', 'whole_numbers', 1, 1), topic('n2', 'Whole numbers to 10 000', 'whole_numbers', 1, 2), topic('fr1', 'Common fractions', 'fractions', 1, 3)]
    state.shape = own(6)
    state.view = viewOf(primary, [...marked('n1', 'Whole numbers to 1 000', 'whole_numbers', 4, 1), ...marked('fr1', 'Common fractions', 'fractions', 1, 4)], [], { caps: true, grade: 6 }, 6)
    await page({ class: 'c6' })
    const whole = row(/Whole numbers/)
    expect(levelsIn(whole)).toEqual(['full', 'none'])
    expect(within(whole).getByText('1 of 2 secure')).toBeTruthy()
    expect(whole.getAttribute('href')).toBe('/k/maths/whole_numbers?class=c6')
    expect(levelsIn(row(/Fractions/))).toEqual(['empty'])
    expect(within(row(/Fractions/)).getByText('0 of 1 secure · 1 started')).toBeTruthy()
  })

  it('My own, a senior grade: the families of the map have circles', async () => {
    state.shape = own(9)
    state.view = viewOf([...ALGEBRA, ...OTHER], ANSWERS, [], { caps: true, grade: 9 })
    await page({ class: 'c9' })
    expect(levelsIn(row(/Algebra/))).toHaveLength(10)
    expect(levelsIn(row(/Functions/))).toEqual(['none', 'none'])
    expect(document.querySelectorAll('[data-legend]')).toHaveLength(1)
  })

  it('My own, a part page keeps the class on the way back and has a circle for each topic', async () => {
    state.shape = own(9)
    state.view = viewOf(ALGEBRA, ANSWERS, [], { caps: true, grade: 9 })
    await part('algebra', { class: 'c9' })
    expect(screen.getByRole('link', { name: /My maths/ }).getAttribute('href')).toBe('/k/maths?class=c9')
    // ten topics, and the four circles of the key
    expect(document.querySelectorAll('main svg[data-dot]')).toHaveLength(10 + 4)
    expect(document.querySelectorAll('main li svg[data-dot]')).toHaveLength(10)
  })
})

describe('the words stay plain', () => {
  it('say no strand, no subtopic and no em dash on either screen, and no percent outside the key', async () => {
    await page()
    const clean = (text: string) => text.replace('80% or more', '')
    expect(clean(document.body.textContent ?? '')).not.toMatch(/%|percent|rank|classmate|class average|strand|subtopic|out of/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
