import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The screens of "Add your own work" that belong to a marked test (P97): the home of it, the camera screen, and the screen of one test in each of
// its states. The actions, the router and the poll are doubles: no server, no browser.

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
const poll = vi.hoisted(() => ({ calls: [] as { ms: number; active: boolean | undefined }[] }))
vi.mock('@/lib/use-refresh-poll', () => ({ useRefreshPoll: (ms: number, active?: boolean) => poll.calls.push({ ms, active }) }))
vi.mock('../app/k/own/actions', () => ({
  snapOwnTest: vi.fn(async () => ({ ok: true, paperId: 'paper-9' })),
  retryOwnTest: vi.fn(async () => ({ ok: true })),
}))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })) }))
const postFiles = vi.hoisted(() => vi.fn(async () => ({ ok: true, paperId: 'paper-9' }) as { ok: boolean; paperId?: string; message?: string }))
vi.mock('@/lib/upload-client', () => ({ postFiles }))
vi.mock('@/lib/shrink-photo', () => ({ shrinkPhoto: async (f: File) => f }))

import { retryOwnTest } from '../app/k/own/actions'
import { startPractice } from '../app/k/actions'
import { NotOwnScreen, OwnHomeScreen, TestScreen } from '../app/k/own/Screens'
import { SnapTest } from '../app/k/own/test/SnapTest'
import type { OwnTestView } from '../app/k/own/format'

beforeEach(() => {
  refresh.mockClear()
  push.mockClear()
  poll.calls = []
  postFiles.mockClear()
  vi.mocked(retryOwnTest).mockClear()
  vi.mocked(startPractice).mockClear()
})

const questions = (right: number, wrong: number) => [
  ...Array.from({ length: right }, (_, i) => ({ n: i + 1, prompt: `${i + 1}. Simplify ${i + 2}/4`, answer: `${i + 1}/2`, right: true })),
  ...Array.from({ length: wrong }, (_, i) => ({ n: right + i + 1, prompt: `${right + i + 1}. Add 1/2 and 1/3`, answer: i === 0 ? '2/5' : '', right: false })),
]
const marked = (over: Partial<Extract<OwnTestView, { state: 'marked' }>> = {}): OwnTestView => ({
  state: 'marked',
  paperId: 'paper-1',
  right: 6,
  outOf: 8,
  leftOut: 0,
  finding: false,
  questions: questions(6, 2),
  gaps: [{ topicId: 't-add', topicName: 'Adding fractions', wrong: 2 }],
  ...over,
})

describe('the screen of one marked test', () => {
  it('while Jemma reads it: one plain heading, one line, a status that is read out, and the screen looks again every 3 seconds', () => {
    render(<TestScreen view={{ state: 'reading', paperId: 'paper-1' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Jemma is reading your test.' })).toBeTruthy()
    expect(screen.getByText('About a minute. You can wait here.')).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: true })
    expect(screen.queryByText(/right\./)).toBeNull()
  })

  it('marked: "{right} of {n} right.", then each question with its words, what was written, and a tick or a cross that a screen reader says', () => {
    render(<TestScreen view={marked()} />)
    expect(screen.getByRole('heading', { level: 1, name: '6 of 8 right.' })).toBeTruthy()
    const list = screen.getByRole('list', { name: 'Your questions' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(8)
    expect(within(list).getAllByRole('img', { name: 'Right' })).toHaveLength(6)
    expect(within(list).getAllByRole('img', { name: 'Not right' })).toHaveLength(2)
    expect(items[0]!.textContent).toContain('1. Simplify 2/4')
    expect(items[0]!.textContent).toContain('You wrote: 1/2')
    expect(within(items[7]!).getByRole('img', { name: 'Not right' })).toBeTruthy()
    // a question the learner left blank says so
    expect(items[7]!.textContent).toContain('You left this blank.')
    // no polling once marked and nothing is being worked out
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: false })
  })

  it('the gaps of this test come after the questions, each with a Practise button that asks for exactly that topic', async () => {
    render(<TestScreen view={marked()} />)
    const heading = screen.getByRole('heading', { level: 2, name: 'What to practise' })
    expect(heading).toBeTruthy()
    const section = heading.closest('section')!
    expect(within(section).getByText('Adding fractions')).toBeTruthy()
    expect(within(section).getByText('2 wrong in this test')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Practise Adding fractions' }))
    expect(startPractice).toHaveBeenCalledWith({ topicId: 't-add', topicName: 'Adding fractions' })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/k'))
  })

  it('no gaps and nothing being worked out: no "What to practise" at all', () => {
    render(<TestScreen view={marked({ gaps: [], right: 8, questions: questions(8, 0) })} />)
    expect(screen.queryByRole('heading', { name: 'What to practise' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: '8 of 8 right.' })).toBeTruthy()
  })

  it('while Jemma still works out what to practise, the screen says so and keeps looking', () => {
    render(<TestScreen view={marked({ gaps: [], finding: true })} />)
    expect(screen.getByText('Jemma is finding what to practise.')).toBeTruthy()
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: true })
  })

  it('says how many questions Jemma could not read, and says nothing when none were left out', () => {
    const { unmount } = render(<TestScreen view={marked({ leftOut: 2 })} />)
    expect(screen.getByText('Questions Jemma could not read: 2')).toBeTruthy()
    unmount()
    render(<TestScreen view={marked({ leftOut: 0 })} />)
    expect(screen.queryByText(/could not read/)).toBeNull()
  })

  it('failed: one plain heading, "Take the photos again" asks for the same photos to be read again, and "Back" goes to the list', async () => {
    render(<TestScreen view={{ state: 'failed', paperId: 'paper-1' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Jemma could not read this test.' })).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/k/own')
    fireEvent.click(screen.getByRole('button', { name: 'Take the photos again' }))
    await vi.waitFor(() => expect(retryOwnTest).toHaveBeenCalledWith('paper-1'))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: false })
  })

  it('failed: a refusal of the retry is said in plain words under the button', async () => {
    vi.mocked(retryOwnTest).mockResolvedValueOnce({ ok: false, message: 'Jemma could not be reached. Try again in a minute.' })
    render(<TestScreen view={{ state: 'failed', paperId: 'paper-1' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Take the photos again' }))
    await vi.waitFor(() => expect(screen.getByText('Jemma could not be reached. Try again in a minute.')).toBeTruthy())
  })
})

describe('the home of "Add your own work"', () => {
  const home = (over: Partial<Parameters<typeof OwnHomeScreen>[0]> = {}) =>
    render(<OwnHomeScreen firstName="Amina" tests={[]} curricula={[]} {...over} />)

  it('two big choices, with the words of the plan, each a link of its own', () => {
    home()
    expect(screen.getByRole('heading', { level: 1, name: 'Add your own work' })).toBeTruthy()
    const test = screen.getByRole('link', { name: /A marked test/ })
    expect(test.getAttribute('href')).toBe('/k/own/test')
    expect(test.textContent).toContain('Take a photo of a test you got back. Jemma reads the ticks and crosses.')
    const plan = screen.getByRole('link', { name: /Your own curriculum/ })
    expect(plan.getAttribute('href')).toBe('/k/own/curriculum')
    expect(plan.textContent).toContain("Your school's plan or a book's contents. Jemma turns it into topics you check.")
  })

  it('lists what was added: a marked test says its result at once, a test being read or failed says so, each opens its own screen', () => {
    home({
      tests: [
        { id: 'p1', state: 'marked', right: 6, outOf: 8, day: 'Fri 13 Nov' },
        { id: 'p2', state: 'reading', right: 0, outOf: 0, day: 'Sat 14 Nov' },
        { id: 'p3', state: 'failed', right: 0, outOf: 0, day: 'Sat 14 Nov' },
      ],
    })
    expect(screen.getByRole('heading', { level: 2, name: 'What you added' })).toBeTruthy()
    const marked = screen.getByRole('link', { name: /Marked test: 6 of 8 right/ })
    expect(marked.getAttribute('href')).toBe('/k/own/test/p1')
    expect(marked.textContent).toContain('Fri 13 Nov')
    expect(screen.getByRole('link', { name: /Marked test: Jemma is reading it/ }).getAttribute('href')).toBe('/k/own/test/p2')
    expect(screen.getByRole('link', { name: /Marked test: could not be read/ }).getAttribute('href')).toBe('/k/own/test/p3')
  })

  it('lists the own curricula with their state, each opening its own screen; nothing listed means no "What you added"', () => {
    home({
      curricula: [
        { id: 'm1', name: "My school's Term 1 plan", grade: 6, state: 'draft', day: 'Fri 13 Nov' },
        { id: 'm2', name: 'Maths book', grade: 7, state: 'approved', day: 'Fri 13 Nov' },
        { id: 'm3', name: 'Old plan', grade: 5, state: 'reading', day: 'Fri 13 Nov' },
        { id: 'm4', name: 'Bad scan', grade: 5, state: 'failed', day: 'Fri 13 Nov' },
      ],
    })
    const draft = screen.getByRole('link', { name: /My school's Term 1 plan/ })
    expect(draft.getAttribute('href')).toBe('/k/own/curriculum/m1')
    expect(draft.textContent).toContain('Grade 6')
    expect(draft.textContent).toContain('Ready to check')
    expect(screen.getByRole('link', { name: /Maths book/ }).textContent).toContain('Done')
    expect(screen.getByRole('link', { name: /Old plan/ }).textContent).toContain('Jemma is reading it')
    expect(screen.getByRole('link', { name: /Bad scan/ }).textContent).toContain('Could not be read')
    cleanup()
    home()
    expect(screen.queryByRole('heading', { name: 'What you added' })).toBeNull()
  })
})

describe('a learner who is in My school', () => {
  it('is told to switch, and the switch is there', () => {
    render(<NotOwnScreen firstName="Amina" />)
    expect(screen.getByText('Switch to My own to add your own work.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My own' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('link', { name: /A marked test/ })).toBeNull()
  })
})

describe('the camera screen of a marked test', () => {
  const file = (name: string, type = 'image/jpeg') => new File([new Uint8Array(500)], name, { type })
  const input = () => document.querySelector('input[type="file"]') as HTMLInputElement
  const pick = (files: File[]) => fireEvent.change(input(), { target: { files } })

  it('asks for a photo of each page, up to 4, with the back camera and any image', () => {
    render(<SnapTest />)
    expect(screen.getByRole('heading', { level: 1, name: 'Take a photo of each page (up to 4).' })).toBeTruthy()
    expect(input().getAttribute('accept')).toBe('image/*')
    expect(input().getAttribute('capture')).toBe('environment')
    expect(input().multiple).toBe(true)
    // nothing to send yet
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull()
  })

  it('keeps the pages taken, in order, and sends them all through the upload route with the action name, then opens the test', async () => {
    render(<SnapTest />)
    pick([file('a.jpg')])
    pick([file('b.jpg'), file('c.jpg')])
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Send 3 pages to Jemma' }))
    await vi.waitFor(() => expect(postFiles).toHaveBeenCalledTimes(1))
    const [space, action, args, form] = postFiles.mock.calls[0] as unknown as [string, string, string[], FormData]
    expect([space, action, args]).toEqual(['k', 'snapOwnTest', []])
    expect(form.getAll('file').map((f) => (f as File).name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/k/own/test/paper-9'))
  })

  it('a fifth page is not taken: it says so and keeps the four', () => {
    render(<SnapTest />)
    pick([file('1.jpg'), file('2.jpg'), file('3.jpg'), file('4.jpg')])
    expect(screen.getByRole('button', { name: 'Send 4 pages to Jemma' })).toBeTruthy()
    pick([file('5.jpg')])
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('alert').textContent).toBe('Jemma can read up to 4 pages.')
  })

  it('a page can be taken out again before it is sent', () => {
    render(<SnapTest />)
    pick([file('a.jpg'), file('b.jpg')])
    fireEvent.click(screen.getByRole('button', { name: 'Take out page 1' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Send 1 page to Jemma' })).toBeTruthy()
  })

  it('a file that is not an image is not taken, in plain words', () => {
    render(<SnapTest />)
    pick([file('x.pdf', 'application/pdf')])
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('alert').textContent).toBe('Jemma can only read photos.')
  })

  it('when the server refuses, its words are shown and the pages are kept', async () => {
    postFiles.mockResolvedValueOnce({ ok: false, message: 'Switch to My own to add your own work.' })
    render(<SnapTest />)
    pick([file('a.jpg')])
    fireEvent.click(screen.getByRole('button', { name: 'Send 1 page to Jemma' }))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Switch to My own to add your own work.'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('when the upload fails on the way, it says to check the connection and keeps the pages', async () => {
    postFiles.mockRejectedValueOnce(new Error('upload failed (500)'))
    render(<SnapTest />)
    pick([file('a.jpg')])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send 1 page to Jemma' })))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That did not send. Check your connection and try again.'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
