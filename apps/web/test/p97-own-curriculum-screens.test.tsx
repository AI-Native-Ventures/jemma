import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The screens of "Your own curriculum" (P97): the upload form, and the screen of one curriculum in each of its states (Jemma reading it, a draft to
// check, done, not readable). The actions, the router, the upload and the poll are doubles: no server, no browser.

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
const poll = vi.hoisted(() => ({ calls: [] as { ms: number; active: boolean | undefined }[] }))
vi.mock('@/lib/use-refresh-poll', () => ({ useRefreshPoll: (ms: number, active?: boolean) => poll.calls.push({ ms, active }) }))
vi.mock('../app/k/own/actions', () => ({
  removeOwnTopic: vi.fn(async () => ({ ok: true })),
  approveOwnCurriculum: vi.fn(async () => ({ ok: true })),
  uploadOwnCurriculum: vi.fn(),
}))
const postFiles = vi.hoisted(() => vi.fn(async () => ({ ok: true, mapId: 'map-9' }) as { ok: boolean; mapId?: string; message?: string }))
vi.mock('@/lib/upload-client', () => ({ postFiles }))
vi.mock('@/lib/shrink-photo', () => ({ shrinkPhoto: async (f: File) => f }))

import { approveOwnCurriculum, removeOwnTopic } from '../app/k/own/actions'
import { CurriculumScreen } from '../app/k/own/CurriculumScreens'
import { CurriculumUpload } from '../app/k/own/curriculum/CurriculumUpload'
import type { OwnCurriculumView, OwnMapView } from '../app/k/own/format'

beforeEach(() => {
  refresh.mockClear()
  push.mockClear()
  poll.calls = []
  postFiles.mockClear()
  vi.mocked(removeOwnTopic).mockClear()
  vi.mocked(approveOwnCurriculum).mockClear()
})

const review = (over: Partial<OwnMapView> = {}): OwnMapView => ({
  mapId: 'map-1',
  classId: 'class-1',
  grade: 6,
  name: "My school's Term 1 plan",
  topicCount: 3,
  terms: [
    { term: 1, topics: [{ name: 'Whole numbers', needs: null, note: null }, { name: 'Fractions', needs: 'Needs topic 1', note: null }] },
    { term: 2, topics: [{ name: 'Decimals', needs: 'Needs Fractions (T1)', note: 'The plan lists it in Term 2 and Term 3.' }] },
  ],
  leftOut: [{ name: 'Probability', reason: 'It is not in Grade 6.' }],
  ...over,
})

describe('the screen of one own curriculum', () => {
  it('while Jemma reads it: one plain heading, one line, a status that is read out, and the screen looks again every 3 seconds', () => {
    render(<CurriculumScreen view={{ state: 'reading', mapId: 'map-1', name: 'Plan' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Jemma is reading your curriculum.' })).toBeTruthy()
    expect(screen.getByText('A minute or two. You can wait here.')).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: true })
  })

  it('not readable: one plain heading, "Try another file" goes to the upload screen, "Back" to the list', () => {
    render(<CurriculumScreen view={{ state: 'failed', mapId: 'map-1', name: 'Plan' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Jemma could not read this file.' })).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Try another file' }).getAttribute('href')).toBe('/k/own/curriculum')
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/k/own')
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: false })
  })

  it('done: "Done. Find it in My maths." with a link to My maths at the grade', () => {
    const view: OwnCurriculumView = { state: 'approved', mapId: 'map-1', name: "My school's Term 1 plan", grade: 7, classId: 'class-1' }
    render(<CurriculumScreen view={view} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Done. Find it in My maths.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open My maths' }).getAttribute('href')).toBe('/k/maths?class=class-1')
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/k/own')
    expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: false })
  })

  describe('a draft to check', () => {
    const draft = (over: Partial<OwnMapView> = {}) => render(<CurriculumScreen view={{ state: 'draft', review: review(over) }} />)

    it('says what it is: the name, the grade and how many topics, and what to do', () => {
      draft()
      expect(screen.getByRole('heading', { level: 1, name: 'Check your topics.' })).toBeTruthy()
      expect(screen.getByText(/My school's Term 1 plan/).textContent).toContain('Grade 6')
      expect(screen.getByText(/My school's Term 1 plan/).textContent).toContain('3 topics')
      expect(screen.getByText('Take out any topic that does not belong. Then tap "These look right".')).toBeTruthy()
    })

    it('lists the topics term by term, each with what it needs and, where Jemma was not sure, why', () => {
      draft()
      const term1 = screen.getByRole('heading', { level: 2, name: 'Term 1' }).closest('section')!
      expect(within(term1).getAllByRole('listitem')).toHaveLength(2)
      expect(within(term1).getByText('Whole numbers')).toBeTruthy()
      expect(within(term1).getByText('Needs topic 1')).toBeTruthy()
      const term2 = screen.getByRole('heading', { level: 2, name: 'Term 2' }).closest('section')!
      expect(within(term2).getByText('Needs Fractions (T1)')).toBeTruthy()
      expect(within(term2).getByText('Jemma is not sure. The plan lists it in Term 2 and Term 3.')).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Term 3' })).toBeNull()
    })

    it('lists what Jemma left out, with its reason', () => {
      draft()
      const left = screen.getByRole('heading', { level: 2, name: 'Jemma left these out' }).closest('section')!
      expect(within(left).getByText('Probability')).toBeTruthy()
      expect(within(left).getByText('It is not in Grade 6.')).toBeTruthy()
      cleanup()
      draft({ leftOut: [] })
      expect(screen.queryByRole('heading', { name: 'Jemma left these out' })).toBeNull()
    })

    it('"Take out" removes that topic and the screen looks again', async () => {
      draft()
      fireEvent.click(screen.getByRole('button', { name: 'Take out Fractions' }))
      await vi.waitFor(() => expect(removeOwnTopic).toHaveBeenCalledWith('map-1', 'Fractions'))
      await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
      expect(approveOwnCurriculum).not.toHaveBeenCalled()
    })

    it('"These look right" approves the curriculum and the screen looks again', async () => {
      draft()
      fireEvent.click(screen.getByRole('button', { name: 'These look right' }))
      await vi.waitFor(() => expect(approveOwnCurriculum).toHaveBeenCalledWith('map-1'))
      await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
      expect(removeOwnTopic).not.toHaveBeenCalled()
    })

    it('a refusal is said in plain words under the button', async () => {
      vi.mocked(approveOwnCurriculum).mockResolvedValueOnce({ ok: false, message: 'Keep at least one topic.' })
      draft()
      fireEvent.click(screen.getByRole('button', { name: 'These look right' }))
      await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Keep at least one topic.'))
    })

    it('with no topic left there is nothing to approve: the button waits and the screen says to keep one', () => {
      draft({ terms: [], topicCount: 0 })
      expect((screen.getByRole('button', { name: 'These look right' }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText('Keep at least one topic.')).toBeTruthy()
    })

    it('does not poll: nothing is being read', () => {
      draft()
      expect(poll.calls.at(-1)).toEqual({ ms: 3000, active: false })
    })
  })
})

describe('the upload form of an own curriculum', () => {
  const pdf = (name = 'plan.pdf') => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])], name, { type: 'application/pdf' })
  const jpg = (name = 'page.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], name, { type: 'image/jpeg' })
  const inputs = () => [...document.querySelectorAll('input[type="file"]')] as HTMLInputElement[]
  const nameBox = () => screen.getByLabelText('Name it, like "My school\'s Term 1 plan"') as HTMLInputElement
  const pick = (input: HTMLInputElement, files: File[]) => fireEvent.change(input, { target: { files } })

  it('asks for the grade (1 to 12, the school grade first chosen), a name, and then a file or photos', () => {
    render(<CurriculumUpload defaultGrade={6} />)
    const grade = screen.getByLabelText('Grade') as HTMLSelectElement
    expect([...grade.options].map((o) => o.textContent)).toEqual(Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`))
    expect(grade.value).toBe('6')
    expect(nameBox().maxLength).toBe(60)
    expect(screen.getByRole('button', { name: 'Take photos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a file' })).toBeTruthy()
  })

  it('takes a PDF or photos of the pages: the camera one asks for the back camera and photos only', () => {
    render(<CurriculumUpload defaultGrade={6} />)
    const [photos, file] = inputs()
    expect(photos!.accept).toBe('image/jpeg,image/png')
    expect(photos!.getAttribute('capture')).toBe('environment')
    expect(photos!.multiple).toBe(true)
    expect(file!.accept).toBe('application/pdf,image/jpeg,image/png')
    expect(file!.multiple).toBe(true)
  })

  it('without a name nothing is opened: it says to name it first', () => {
    render(<CurriculumUpload defaultGrade={6} />)
    const opened = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Add a file' }))
    expect(opened).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Give your curriculum a name first.')
    opened.mockRestore()
  })

  it('with a name the buttons open the pickers', () => {
    render(<CurriculumUpload defaultGrade={6} />)
    fireEvent.change(nameBox(), { target: { value: 'My plan' } })
    const opened = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Add a file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take photos' }))
    expect(opened).toHaveBeenCalledTimes(2)
    opened.mockRestore()
  })

  it('sends the grade, the name and every file through the upload route with the action name, then opens the curriculum', async () => {
    render(<CurriculumUpload defaultGrade={6} />)
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '7' } })
    fireEvent.change(nameBox(), { target: { value: "  My school's Term 1 plan " } })
    pick(inputs()[1]!, [pdf('a.pdf'), jpg('b.jpg')])
    await vi.waitFor(() => expect(postFiles).toHaveBeenCalledTimes(1))
    const [space, action, args, form] = postFiles.mock.calls[0] as unknown as [string, string, string[], FormData]
    expect([space, action, args]).toEqual(['k', 'uploadOwnCurriculum', ['7', "My school's Term 1 plan"]])
    expect(form.getAll('file').map((f) => (f as File).name)).toEqual(['a.pdf', 'b.jpg'])
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/k/own/curriculum/map-9'))
  })

  it('says no here, before anything is sent, to a file that is not a PDF, a JPG or a PNG', async () => {
    render(<CurriculumUpload defaultGrade={6} />)
    fireEvent.change(nameBox(), { target: { value: 'My plan' } })
    pick(inputs()[1]!, [new File(['hello there, friend'], 'notes.txt', { type: 'text/plain' })])
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('"notes.txt" is not a PDF, JPG or PNG file. Jemma can only read those three kinds.'))
    expect(postFiles).not.toHaveBeenCalled()
  })

  it('shows what the server said when it refuses, and says to check the connection when the upload fails on the way', async () => {
    postFiles.mockResolvedValueOnce({ ok: false, message: 'Switch to My own to add your own work.' })
    render(<CurriculumUpload defaultGrade={6} />)
    fireEvent.change(nameBox(), { target: { value: 'My plan' } })
    pick(inputs()[1]!, [pdf()])
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Switch to My own to add your own work.'))
    expect(push).not.toHaveBeenCalled()
    postFiles.mockRejectedValueOnce(new Error('upload failed (500)'))
    await act(async () => pick(inputs()[1]!, [pdf()]))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That did not upload. Check your connection and try again.'))
  })
})
