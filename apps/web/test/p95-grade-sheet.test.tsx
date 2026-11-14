import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page where a learner adds another grade (/k/maths/grades): the 12 grades as large chips, the learner's school grade marked "your grade", the
// grades already added marked "added". A tap calls `addMyGrade`, says "Loading Grade N..." while it works, then opens My maths at that grade.
// The data, the router and the action are doubles.

const state = vi.hoisted(() => ({ sheet: null as unknown, push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('../app/k/own-actions', () => ({ addMyGrade: vi.fn(), setWorkspace: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/own-screens', () => ({ getGradeSheet: async () => state.sheet }))

import GradesPage from '../app/k/maths/grades/page'
import { addMyGrade } from '../app/k/own-actions'

const ok = (classId = 'c9', created = true, topics = 40) => ({ ok: true as const, classId, created, topics })
const page = async () => render(await GradesPage())

beforeEach(() => {
  state.sheet = { firstName: 'Amina', schoolGrade: 6, added: [6, 7] }
  state.push.mockClear()
  state.refresh.mockClear()
  vi.mocked(addMyGrade).mockReset()
  vi.mocked(addMyGrade).mockResolvedValue(ok())
})

describe('the grade sheet', () => {
  it('says what it is for, and has a way back to My maths', async () => {
    await page()
    expect(screen.getByRole('heading', { level: 1, name: 'Add a grade' })).toBeTruthy()
    expect(document.querySelector('main a[href="/k/maths"]')).toBeTruthy()
  })

  it('has the 12 grades as buttons, in order', async () => {
    await page()
    const grid = screen.getByRole('group', { name: 'Grades' })
    const names = within(grid).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toHaveLength(12)
    expect(names.map((n) => Number(/Grade (\d+)/.exec(n!)![1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('marks the learner\'s school grade "your grade" and the grades already added "added"', async () => {
    await page()
    expect(screen.getByRole('button', { name: 'Grade 6' }).textContent).toContain('your grade')
    expect(screen.getByRole('button', { name: 'Grade 6' }).textContent).toContain('added')
    expect(screen.getByRole('button', { name: 'Grade 7' }).textContent).toContain('added')
    expect(screen.getByRole('button', { name: 'Grade 7' }).textContent).not.toContain('your grade')
    expect(screen.getByRole('button', { name: 'Grade 9' }).textContent).toBe('Grade 9')
    expect(screen.getAllByText('added')).toHaveLength(2)
    expect(screen.getAllByText('your grade')).toHaveLength(1)
  })

  it('every chip is large, with room at the sides and a minimum height (never a fixed one)', async () => {
    await page()
    for (const b of screen.getByRole('group', { name: 'Grades' }).querySelectorAll('button')) {
      const classes = b.className.split(/\s+/)
      expect(classes.some((c) => /^px-(5|6)$/.test(c))).toBe(true)
      expect(classes.some((c) => /^min-h-(\[(6\d|7\d|8\d)px\]|1[6-9]|2\d)$/.test(c))).toBe(true)
      expect(classes.some((c) => /^h-\d|^h-\[/.test(c))).toBe(false)
    }
    expect(screen.getByRole('group', { name: 'Grades' }).className).toContain('grid')
  })

  it('has no switch of My school and My own, and says nothing about a teacher', async () => {
    await page()
    expect(screen.queryByRole('group', { name: 'Where you practise' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/your teacher|—/i)
  })

  it('a learner who is in My school is sent back to My maths (there is no grade to add there)', async () => {
    state.sheet = null
    await expect(GradesPage()).rejects.toThrow('REDIRECT /k/maths')
  })
})

describe('a tap on a grade', () => {
  it('calls addMyGrade with the number, says "Loading Grade 9..." while it works, then opens My maths at that grade', async () => {
    let finish: (v: ReturnType<typeof ok>) => void = () => {}
    vi.mocked(addMyGrade).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    await page()
    fireEvent.click(screen.getByRole('button', { name: 'Grade 9' }))
    expect(addMyGrade).toHaveBeenCalledWith(9)
    const status = await screen.findByRole('status')
    expect(status.textContent).toBe('Loading Grade 9...')
    expect(state.push).not.toHaveBeenCalled()
    finish(ok('c9'))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/k/maths?grade=9'))
  })

  it('blocks a second tap while the first one works', async () => {
    let finish: (v: ReturnType<typeof ok>) => void = () => {}
    vi.mocked(addMyGrade).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    await page()
    fireEvent.click(screen.getByRole('button', { name: 'Grade 9' }))
    await screen.findByRole('status')
    for (const b of screen.getByRole('group', { name: 'Grades' }).querySelectorAll('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Grade 10' }))
    expect(addMyGrade).toHaveBeenCalledTimes(1)
    // The first one finishes, so no unfinished action is left to hold up the next test (React waits for every action of a transition).
    finish(ok('c9'))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/k/maths?grade=9'))
  })

  it('a grade that was added before opens My maths at that grade too', async () => {
    vi.mocked(addMyGrade).mockResolvedValueOnce(ok('c7', false, 38))
    await page()
    fireEvent.click(screen.getByRole('button', { name: 'Grade 7' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/k/maths?grade=7'))
  })

  it('a grade outside South Africa that has no map is still added: it opens My maths at that grade', async () => {
    vi.mocked(addMyGrade).mockResolvedValueOnce(ok('c11', true, 0))
    await page()
    fireEvent.click(screen.getByRole('button', { name: 'Grade 11' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/k/maths?grade=11'))
  })

  it('a refusal is said in the action\'s plain words, the learner stays, and can tap again', async () => {
    vi.mocked(addMyGrade).mockResolvedValueOnce({ ok: false, message: 'Could not add that grade. Try again.' })
    await page()
    fireEvent.click(screen.getByRole('button', { name: 'Grade 9' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not add that grade. Try again.')
    expect(state.push).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Grade 9' }) as HTMLButtonElement).disabled).toBe(false))
  })
})
