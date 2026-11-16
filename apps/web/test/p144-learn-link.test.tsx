import { render, screen, within } from '@testing-library/react'
import { buildMyMaths } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'

// P144: a topic that has lessons in the library gets a "Learn" button beside "Practise" on its row of "My maths". A topic without lessons looks exactly as it
// did: no button. The row of the second teaching of a topic ("Common fractions (Term 4)") finds the same lessons. The data, the router and the actions are
// doubles: no database, no server, no browser.

const state = vi.hoisted(() => ({ view: null as unknown, names: new Set<string>(), asked: [] as number[] }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p80', () => ({ getMyMaths: async () => state.view }))
vi.mock('../lib/data/own-screens', () => ({ getScreenShape: async () => ({ workspace: 'school' }) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/teaching', () => ({
  libraryNames: async (grade: number) => {
    state.asked.push(grade)
    return state.names
  },
}))

import MyMathsPartPage from '../app/k/maths/[family]/page'
import { LearnLink, PracticeRow } from '../app/k/Practise'

const topic = (id: string, name: string, family: string, term: number, position: number) => ({ id, name, family, term, position, prerequisiteIds: [] as string[] })

const GRADE_6 = [
  topic('t-cf1', 'Common fractions', 'fractions', 1, 1),
  topic('t-cf4', 'Common fractions (Term 4)', 'fractions', 4, 2),
  topic('t-ef', 'Equivalent fractions', 'fractions', 2, 3),
]

const viewOf = (topics: ReturnType<typeof topic>[], source?: MyMathsView['source']): MyMathsView => ({
  firstName: 'Sam',
  initial: 'S',
  status: 'free',
  maths: buildMyMaths({ now: new Date('2026-11-16T10:00:00.000Z'), subject: 'Mathematics', grade: 6, topics, gaps: [], answers: [], sessions: [], history: [] }),
  ...(source ? { source } : {}),
})

const part = async () => render(await MyMathsPartPage({ params: Promise.resolve({ family: 'fractions' }) }))

beforeEach(() => {
  state.names = new Set(['Common fractions'])
  state.asked = []
  state.view = viewOf(GRADE_6, { caps: true, grade: 6 })
})

describe('LearnLink', () => {
  it('draws a link to the lessons of the topic when it has lessons', () => {
    render(<LearnLink topicId="t-cf1" name="Common fractions" hasLessons />)
    const link = screen.getByRole('link', { name: 'Learn Common fractions' })
    expect(link.getAttribute('href')).toBe('/k/learn/t-cf1')
    expect(link.textContent).toBe('Learn')
  })

  it('draws nothing when the topic has no lessons', () => {
    const { container } = render(<LearnLink topicId="t-ef" name="Equivalent fractions" hasLessons={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('draws nothing for a row that has no topic of the map to open', () => {
    const { container } = render(<LearnLink topicId={null} name="Fractions" hasLessons />)
    expect(container.innerHTML).toBe('')
  })
})

describe('PracticeRow', () => {
  it('shows Learn beside Practise only when the topic has lessons', () => {
    const { rerender } = render(<ul><PracticeRow choice={{ topicId: 't1', topicName: 'Trigonometry' }} name="Trigonometry" lines={[]} locked={false} hasLessons /></ul>)
    expect(screen.getByRole('link', { name: 'Learn Trigonometry' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise Trigonometry' })).toBeTruthy()
    rerender(<ul><PracticeRow choice={{ topicId: 't1', topicName: 'Trigonometry' }} name="Trigonometry" lines={[]} locked={false} /></ul>)
    expect(screen.queryByRole('link', { name: /^Learn/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Practise Trigonometry' })).toBeTruthy()
  })

  it('still shows Learn while Practise is hidden (a practice is being written): lessons do not wait for a practice', () => {
    render(<ul><PracticeRow choice={{ topicId: 't1', topicName: 'Trigonometry' }} name="Trigonometry" lines={[]} locked hasLessons /></ul>)
    expect(screen.getByRole('link', { name: 'Learn Trigonometry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Practise/ })).toBeNull()
  })
})

describe('a part of "My maths" for a Grade 6 class on the CAPS map', () => {
  it('asks the library once for the grade of the class', async () => {
    await part()
    expect(state.asked).toEqual([6])
  })

  it('gives Learn to the topic that has lessons and to its second teaching, and not to a topic that has none', async () => {
    await part()
    const links = screen.getAllByRole('link', { name: /^Learn / })
    expect(links.map((l) => [l.getAttribute('aria-label'), l.getAttribute('href')])).toEqual([
      ['Learn Common fractions', '/k/learn/t-cf1'],
      ['Learn Common fractions (Term 4)', '/k/learn/t-cf4'],
    ])
    const rows = screen.getAllByRole('listitem')
    const equivalent = rows.find((li) => li.textContent?.includes('Equivalent fractions'))!
    expect(within(equivalent).queryByRole('link')).toBeNull()
    expect(within(equivalent).getByRole('button', { name: 'Practise Equivalent fractions' })).toBeTruthy()
  })

  it('shows no Learn button at all when the library has no lessons (today\'s page)', async () => {
    state.names = new Set()
    await part()
    expect(screen.queryAllByRole('link', { name: /^Learn / })).toEqual([])
    expect(screen.getAllByRole('button', { name: /^Practise / })).toHaveLength(3)
  })

  it('does not ask for lessons of a class whose grade is not known', async () => {
    state.view = viewOf(GRADE_6)
    await part()
    expect(state.asked).toEqual([])
    expect(screen.queryAllByRole('link', { name: /^Learn / })).toEqual([])
  })
})
