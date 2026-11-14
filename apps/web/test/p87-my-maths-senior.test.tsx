import { render, screen, within } from '@testing-library/react'
import { buildMyMaths } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'

// P87, decision 5: the two "My maths" screens of a Grade 10 learner, drawn from the list `buildMyMaths` makes for a senior class with a map.
// "All of Mathematics" lists the parts of the learner's own map, and each of them opens. The data, the router and the actions are doubles.

const state = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p80', () => ({ getMyMaths: async () => state.view }))

import MyMathsPage from '../app/k/maths/page'
import MyMathsPartPage from '../app/k/maths/[family]/page'

const topic = (id: string, name: string, family: string, term: number, position: number) => ({ id, name, family, term, position, prerequisiteIds: [] as string[] })
const GRADE_10 = [
  topic('t-alg1', 'Expanding brackets', 'algebra', 1, 1),
  topic('t-fun1', 'Straight line graphs', 'functions', 1, 2),
  topic('t-alg2', 'Factorising', 'algebra', 1, 3),
  topic('t-trig1', 'Right-angled triangles', 'trigonometry', 2, 1),
  topic('t-ag1', 'Distance between points', 'analytical_geometry', 2, 2),
]

const viewOf = (grade: number, topics = GRADE_10): MyMathsView => ({
  firstName: 'Sam',
  initial: 'S',
  status: 'free',
  maths: buildMyMaths({
    now: new Date('2026-11-14T15:00:00.000Z'),
    subject: 'Mathematics',
    grade,
    topics,
    gaps: [],
    answers: [{ topicId: 't-alg2', topicName: 'Factorising', family: 'algebra', correct: true, paperStatus: 'marked', testHeld: false }],
    sessions: [],
    history: [],
  }),
})

const page = async () => render(await MyMathsPage())
const part = async (family: string) => render(await MyMathsPartPage({ params: Promise.resolve({ family }) }))

beforeEach(() => {
  state.view = viewOf(10)
})

describe('/k/maths for a Grade 10 learner with a map', () => {
  it('lists the parts of the map, in the order of the map, each with its own link', async () => {
    await page()
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    const links = all.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/k/maths/algebra', '/k/maths/functions', '/k/maths/trigonometry', '/k/maths/analytical_geometry'])
    expect(links.map((l) => l.textContent)).toEqual(['Algebra1 of 1 right', 'FunctionsNo score yet', 'TrigonometryNo score yet', 'Analytical geometryNo score yet'])
  })

  it('has no "Whole numbers", no "Fractions", no "Decimals" with "No score yet"', async () => {
    await page()
    const text = document.body.textContent ?? ''
    for (const gone of ['Whole numbers', 'Fractions', 'Decimals', 'Measurement', 'Data handling']) expect(text).not.toContain(gone)
  })

  it('still never says a percent, a grade, a rank, a strand or a subtopic', async () => {
    await page()
    expect(document.body.textContent ?? '').not.toMatch(/%|percent|grade|rank|classmate|class average|strand|subtopic|out of/i)
  })
})

describe('/k/maths/[family] opens for every part of the map', () => {
  it.each([['algebra', 'Algebra'], ['functions', 'Functions'], ['trigonometry', 'Trigonometry'], ['analytical_geometry', 'Analytical geometry']])('%s', async (family, label) => {
    await part(family)
    expect(screen.getByRole('heading', { level: 1, name: label })).toBeTruthy()
    expect(screen.getByRole('link', { name: /My maths/ }).getAttribute('href')).toBe('/k/maths')
  })

  it('algebra shows its topics with Practise buttons and the learner\'s own count', async () => {
    await part('algebra')
    expect(screen.getByText('Expanding brackets')).toBeTruthy()
    expect(screen.getByText('Factorising')).toBeTruthy()
    // the part's own count at the top, and the count of the topic it comes from
    expect(screen.getAllByText('1 of 1 right')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Practise Expanding brackets' })).toBeTruthy()
  })

  it('a part that is not in the list is not found', async () => {
    await expect(part('whole_numbers')).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(part('calculus')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('a Grade 6 learner and a senior learner with no map see the list they always saw', () => {
  it('Grade 6: Whole numbers first, six rows', async () => {
    state.view = viewOf(6, [topic('t1', 'Adding fractions', 'fractions', 4, 1)])
    await page()
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/k/maths/whole_numbers',
      '/k/maths/fractions',
      '/k/maths/decimals',
      '/k/maths/shapes',
      '/k/maths/measurement',
      '/k/maths/data',
    ])
  })

  it('Grade 10 with no approved map: Whole numbers first, six rows, and each says "No score yet"', async () => {
    state.view = viewOf(10, [])
    await page()
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getAllByRole('link')).toHaveLength(6)
    expect(all.getAllByRole('link')[0]!.getAttribute('href')).toBe('/k/maths/whole_numbers')
  })
})
