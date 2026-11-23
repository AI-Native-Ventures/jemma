import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The switch at the top of the learner's home and of My maths: "My school" and "My own", the current one filled and marked (aria-pressed), and
// one line under it in My own. A tap shows the new state at once (P95b: the server's draw of the page takes seconds on the preview) and calls
// `setWorkspace`; the page the action answers with is the truth, and a refusal puts the old state back. The action is a double. The switch asks
// the router for nothing: setting a cookie in a server action already draws the page again.

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn() }))

import { setWorkspace } from '../app/k/own-actions'
import { WorkspaceSwitch } from '../app/k/WorkspaceSwitch'

// An action that has not answered yet. Every one is answered when its test is over: React waits for every unfinished action of a transition,
// so one left hanging would hold up the next test.
const hanging: (() => void)[] = []
const hang = () => new Promise<{ ok: true }>((resolve) => hanging.push(() => resolve({ ok: true })))
afterEach(async () => {
  await act(async () => hanging.splice(0).forEach((answer) => answer()))
})

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(setWorkspace).mockReset()
  vi.mocked(setWorkspace).mockResolvedValue({ ok: true })
})

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
const note = () => screen.queryByText('Your own practice. Nothing here goes to your school.')

describe('the switch in My school', () => {
  it('shows two buttons, My school and My own, with My school the one pressed', () => {
    render(<WorkspaceSwitch current="school" />)
    const group = screen.getByRole('group', { name: 'Where you practise' })
    const buttons = group.querySelectorAll('button')
    expect([...buttons].map((b) => b.textContent)).toEqual(['My school', 'My own'])
    expect(pressed('My school')).toBe('true')
    expect(pressed('My own')).toBe('false')
  })

  it('says nothing about "your own practice" in My school', () => {
    render(<WorkspaceSwitch current="school" />)
    expect(screen.queryByText(/own practice/i)).toBeNull()
    expect(note()).toBeNull()
  })

  it('the filled button is the pressed one and the other one is an outline', () => {
    render(<WorkspaceSwitch current="school" />)
    expect(screen.getByRole('button', { name: 'My school' }).className).toContain('bg-green')
    expect(screen.getByRole('button', { name: 'My own' }).className).not.toContain('bg-green')
  })
})

describe('the switch in My own', () => {
  it('has My own pressed and the one short line under it', () => {
    render(<WorkspaceSwitch current="own" />)
    expect(pressed('My own')).toBe('true')
    expect(pressed('My school')).toBe('false')
    expect(note()).toBeTruthy()
    expect(screen.getAllByText(/Nothing here goes to your school/)).toHaveLength(1)
  })

  it('the two buttons are equal: the same size, the same room at the sides, the same grid cell width', () => {
    render(<WorkspaceSwitch current="own" />)
    const strip = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => !/^(bg-|text-white|text-ink|border)/.test(c)).sort()
    expect(strip(screen.getByRole('button', { name: 'My school' }))).toEqual(strip(screen.getByRole('button', { name: 'My own' })))
    expect(screen.getByRole('group', { name: 'Where you practise' }).className).toContain('grid-cols-2')
  })

  it('the buttons have room at the sides and a minimum height, never a fixed one', () => {
    render(<WorkspaceSwitch current="own" />)
    for (const name of ['My school', 'My own']) {
      const classes = screen.getByRole('button', { name }).className.split(/\s+/)
      expect(classes.some((c) => /^px-(5|6)$/.test(c))).toBe(true)
      expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
      expect(classes.some((c) => /^h-/.test(c))).toBe(false)
    }
  })
})

describe('a tap shows the new state at once', () => {
  it('before the action has answered: the tapped button is pressed and the other is not, and the line appears', () => {
    vi.mocked(setWorkspace).mockImplementation(hang)
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    expect(pressed('My own')).toBe('true')
    expect(pressed('My school')).toBe('false')
    expect(screen.getByRole('button', { name: 'My own' }).className).toContain('bg-green')
    expect(note()).toBeTruthy()
  })

  it('from My own to My school: the line goes at once', () => {
    vi.mocked(setWorkspace).mockImplementation(hang)
    render(<WorkspaceSwitch current="own" />)
    fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    expect(pressed('My school')).toBe('true')
    expect(note()).toBeNull()
  })

  it('has no spinner in any button and blocks no button while the action works, and says it is busy another way', async () => {
    let finish: (v: { ok: true }) => void = () => {}
    vi.mocked(setWorkspace).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    for (const b of screen.getAllByRole('button')) {
      expect((b as HTMLButtonElement).disabled).toBe(false)
      expect(b.querySelector('[role="status"], svg, .animate-spin')).toBeNull()
    }
    await waitFor(() => expect(screen.getByRole('group', { name: 'Where you practise' }).getAttribute('aria-busy')).toBe('true'))
    expect(screen.getByRole('status').textContent).toBe('Opening My own')
    await act(async () => finish({ ok: true }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Where you practise' }).getAttribute('aria-busy')).toBeNull())
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('a tap and the server', () => {
  it('calls setWorkspace once with the word of the other workspace, and never asks the router to refresh (the action already draws the page again)', async () => {
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    await waitFor(() => expect(setWorkspace).toHaveBeenCalledTimes(1))
    expect(setWorkspace).toHaveBeenCalledWith('own')
    await act(async () => undefined)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('from My own to My school calls setWorkspace("school")', async () => {
    render(<WorkspaceSwitch current="own" />)
    fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    await waitFor(() => expect(setWorkspace).toHaveBeenCalledWith('school'))
  })

  it('on the workspace that is already shown does nothing', () => {
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    expect(setWorkspace).not.toHaveBeenCalled()
  })

  it('stays as tapped when the action has answered but the page has not arrived yet (no flash back to the old state)', async () => {
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    await waitFor(() => expect(setWorkspace).toHaveBeenCalled())
    await act(async () => undefined)
    expect(pressed('My own')).toBe('true')
    expect(note()).toBeTruthy()
  })

  it('follows the page when it arrives: the server\'s word is the truth', async () => {
    const { rerender } = render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    await act(async () => undefined)
    rerender(<WorkspaceSwitch current="own" />)
    expect(pressed('My own')).toBe('true')
    // and a later draw for the other workspace (the other tab, a parent's phone) is followed too
    rerender(<WorkspaceSwitch current="school" />)
    expect(pressed('My school')).toBe('true')
    expect(note()).toBeNull()
  })

  it('a refusal puts the old state back, says why in the action\'s plain words and leaves the learner able to try again', async () => {
    vi.mocked(setWorkspace).mockResolvedValueOnce({ ok: false, message: 'Could not open My own. Try again.' })
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open My own. Try again.')
    await waitFor(() => expect(pressed('My school')).toBe('true'))
    expect(pressed('My own')).toBe('false')
    expect(note()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    await waitFor(() => expect(setWorkspace).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('two quick taps ask for both, in order, and the last tap is the one shown', async () => {
    vi.mocked(setWorkspace).mockImplementation(hang)
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    expect(vi.mocked(setWorkspace).mock.calls.map((c) => c[0])).toEqual(['own', 'school'])
    expect(pressed('My school')).toBe('true')
  })
})
