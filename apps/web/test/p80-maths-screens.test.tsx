import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'

// The two "My maths" screens rendered from a count that is handed to them: what they say, which buttons they show, and what they never say.
// The data, the router and the actions are doubles: no server, no browser.

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

const score = (right: number, asked: number) => ({ right, asked })
const strands = (over: Record<string, unknown> = {}) => [
  { family: 'whole_numbers', label: 'Whole numbers', score: score(17, 20), topics: [] },
  {
    family: 'fractions',
    label: 'Fractions',
    score: score(9, 16),
    topics: [
      { id: 't-equiv', name: 'Equivalent fractions', family: 'fractions', term: 4, position: 1, score: score(5, 5), gap: 'fixed' },
      { id: 't-add', name: 'Adding fractions', family: 'fractions', term: 4, position: 2, score: score(2, 6), gap: 'practising' },
      { id: 't-amount', name: 'Fractions of amounts', family: 'fractions', term: 4, position: 3, score: score(0, 0), gap: null },
    ],
    ...over,
  },
  { family: 'decimals', label: 'Decimals', score: score(0, 0), topics: [] },
]
const view = (over: Partial<MyMathsView> = {}): MyMathsView =>
  ({
    firstName: 'Amina',
    initial: 'A',
    status: 'free',
    maths: {
      subject: 'Mathematics',
      strands: strands(),
      gaps: [
        { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', stage: 'practising', score: score(2, 6) },
        { topicId: 't-equiv', topicName: 'Equivalent fractions', family: 'fractions', stage: 'fixed', score: score(5, 5) },
      ],
      suggestions: [
        { topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'practising', reason: 'Practising', score: score(2, 6) },
        { topicId: 't-equiv', topicName: 'Equivalent fractions', family: 'fractions', why: 'fixed', reason: 'Keep it fixed', score: score(5, 5) },
      ],
    },
    ...over,
  }) as MyMathsView

const page = async () => render(await MyMathsPage())
const part = async (family: string) => render(await MyMathsPartPage({ params: Promise.resolve({ family }) }))

beforeEach(() => {
  state.view = view()
})

describe('/k/maths', () => {
  it('says My maths, then Suggested for you, Your gaps and All of Mathematics', async () => {
    await page()
    expect(screen.getByRole('heading', { level: 1, name: 'My maths' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Suggested for you', 'Your gaps', 'All of Mathematics'])
  })

  it('a suggestion has its name, its reason and the learner\'s own count, and a Practise button', async () => {
    await page()
    const suggested = within(screen.getByRole('region', { name: 'Suggested for you' }))
    expect(suggested.getByText('Adding fractions')).toBeTruthy()
    expect(suggested.getByText('Practising')).toBeTruthy()
    expect(suggested.getByText('2 of 6 right')).toBeTruthy()
    expect(suggested.getByText('Keep it fixed')).toBeTruthy()
    expect(suggested.getByText('5 of 5 right')).toBeTruthy()
    expect(suggested.getByRole('button', { name: 'Practise Adding fractions' })).toBeTruthy()
    expect(suggested.getByRole('button', { name: 'Practise Equivalent fractions' })).toBeTruthy()
  })

  it('a gap has its stage in the words of the gaps screen, its count and a Practise button', async () => {
    await page()
    const gaps = within(screen.getByRole('region', { name: 'Your gaps' }))
    expect(gaps.getByText('Practising · 2 of 6 right')).toBeTruthy()
    expect(gaps.getByText('Fixed · 5 of 5 right')).toBeTruthy()
    expect(gaps.getAllByRole('button')).toHaveLength(2)
  })

  it('each part of Mathematics is a row with its count that opens its own screen, and "No score yet" when nothing was asked', async () => {
    await page()
    const all = within(screen.getByRole('region', { name: 'All of Mathematics' }))
    expect(all.getByRole('link', { name: /Whole numbers/ }).getAttribute('href')).toBe('/k/maths/whole_numbers')
    expect(all.getByText('17 of 20 right')).toBeTruthy()
    expect(all.getByRole('link', { name: /Fractions/ }).getAttribute('href')).toBe('/k/maths/fractions')
    expect(all.getByText('9 of 16 right')).toBeTruthy()
    expect(all.getByRole('link', { name: /Decimals/ }).getAttribute('href')).toBe('/k/maths/decimals')
    expect(all.getByText('No score yet')).toBeTruthy()
  })

  it('never says a percent, a grade, a rank or a classmate, and never says strand or subtopic', async () => {
    await page()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/%|percent|grade|rank|classmate|class average|strand|subtopic|out of/i)
  })

  it('while tonight\'s lesson waits there is no Practise button, one line and a link to today', async () => {
    state.view = view({ status: 'due' })
    await page()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/Finish tonight's lesson first\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to today' }).getAttribute('href')).toBe('/k')
    // the counts and the way into each part stay
    expect(screen.getByText('9 of 16 right')).toBeTruthy()
  })

  it('while a practice is being written there is no Practise button either', async () => {
    state.view = view({ status: 'writing' })
    await page()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/Jemma is writing your practice\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to today' }).getAttribute('href')).toBe('/k')
  })

  it('a learner with no gap and nothing to suggest sees only the parts, each with "No score yet"', async () => {
    state.view = view({ maths: { subject: 'Mathematics', strands: strands({ score: score(0, 0), topics: [] }).map((s) => ({ ...s, score: score(0, 0) })), gaps: [], suggestions: [] } as never })
    await page()
    expect(screen.queryByRole('region', { name: 'Suggested for you' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Your gaps' })).toBeNull()
    expect(screen.getAllByText('No score yet')).toHaveLength(3)
  })
})

describe('/k/maths/[family]', () => {
  it('shows the part\'s label and count, a way back, and this year\'s topics with their counts and the stage of a gap, each with Practise', async () => {
    await part('fractions')
    expect(screen.getByRole('heading', { level: 1, name: 'Fractions' })).toBeTruthy()
    expect(screen.getByText('9 of 16 right')).toBeTruthy()
    expect(screen.getByRole('link', { name: /My maths/ }).getAttribute('href')).toBe('/k/maths')
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => within(r).getByText(/Equivalent fractions|Adding fractions|Fractions of amounts/).textContent)).toEqual(['Equivalent fractions', 'Adding fractions', 'Fractions of amounts'])
    expect(within(rows[0]!).getByText('Fixed')).toBeTruthy()
    expect(within(rows[0]!).getByText('5 of 5 right')).toBeTruthy()
    expect(within(rows[1]!).getByText('Practising')).toBeTruthy()
    expect(within(rows[1]!).getByText('2 of 6 right')).toBeTruthy()
    expect(within(rows[2]!).getByText('No score yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise Fractions of amounts' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('a part with no topic of this year\'s map says the teacher has not set them up, with one button to practise the part', async () => {
    await part('decimals')
    expect(screen.getByRole('heading', { level: 1, name: 'Decimals' })).toBeTruthy()
    expect(screen.getByText('No score yet')).toBeTruthy()
    expect(screen.getByText("Your teacher has not set up this year's topics yet.")).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Practise Decimals'])
  })

  it('an unknown part is not found', async () => {
    await expect(part('astrology')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('while tonight\'s lesson waits there is no Practise button, with topics or without', async () => {
    state.view = view({ status: 'due' })
    await part('fractions')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/Finish tonight's lesson first\./)).toBeTruthy()
    document.body.innerHTML = ''
    await part('decimals')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText("Your teacher has not set up this year's topics yet.")).toBeTruthy()
  })

  it('never says a percent, a grade, a rank or a classmate, and never says strand or subtopic', async () => {
    await part('fractions')
    expect(document.body.textContent ?? '').not.toMatch(/%|percent|grade|rank|classmate|class average|strand|subtopic|out of/i)
  })
})
