import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The switch at the top of the learner's home: "My school" and "My own". The action and the router are doubles: no server, no browser.

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })) }))

import { WorkspaceSwitch } from '../app/k/WorkspaceSwitch'
import { setWorkspace } from '../app/k/own-actions'

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(setWorkspace).mockClear()
  vi.mocked(setWorkspace).mockResolvedValue({ ok: true })
})

describe('the two buttons', () => {
  it('shows "My school" and "My own", and marks the current one pressed', () => {
    render(<WorkspaceSwitch current="school" />)
    const school = screen.getByRole('button', { name: 'My school' })
    const own = screen.getByRole('button', { name: 'My own' })
    expect(school.getAttribute('aria-pressed')).toBe('true')
    expect(own.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('in "My own" the other one is pressed', () => {
    render(<WorkspaceSwitch current="own" />)
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('the buttons are in a labelled group', () => {
    render(<WorkspaceSwitch current="school" />)
    expect(screen.getByRole('group', { name: 'Where you practise' })).toBeTruthy()
  })

  it('every button has room at both sides and a tap target of 44 px or more, so a long label can take a second line', () => {
    render(<WorkspaceSwitch current="school" />)
    for (const b of screen.getAllByRole('button')) {
      expect(b.className).toMatch(/\bmin-h-11\b/)
      expect(b.className).toMatch(/\bpx-[4-9]\b/)
      expect(b.className).not.toMatch(/(^|\s)h-\[?\d/)
    }
  })
})

describe('a tap', () => {
  it('on the other workspace asks the server for it, then looks again', async () => {
    render(<WorkspaceSwitch current="school" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    })
    expect(setWorkspace).toHaveBeenCalledTimes(1)
    expect(setWorkspace).toHaveBeenCalledWith('own')
    expect(refresh).toHaveBeenCalled()
  })

  it('on "My school" from "My own" asks for "school"', async () => {
    render(<WorkspaceSwitch current="own" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    })
    expect(setWorkspace).toHaveBeenCalledWith('school')
  })

  it('on the workspace that is already on does nothing', async () => {
    render(<WorkspaceSwitch current="school" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    })
    expect(setWorkspace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('that fails says why in plain words and still looks again', async () => {
    vi.mocked(setWorkspace).mockResolvedValue({ ok: false, message: 'Could not open My own. Try again.' })
    render(<WorkspaceSwitch current="school" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('Could not open My own. Try again.')
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows it is working and does not take a second tap while the first is not answered', async () => {
    let finish: (v: { ok: true }) => void = () => undefined
    vi.mocked(setWorkspace).mockImplementation(() => new Promise((resolve) => (finish = resolve as typeof finish)))
    render(<WorkspaceSwitch current="school" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    })
    // While it works the kit's spinner is inside the button that was tapped, and both buttons are blocked.
    const own = screen.getByRole('button', { name: /^My own/ })
    expect(own.hasAttribute('disabled')).toBe(true)
    expect(own.querySelector('[role="status"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^My school/ }).hasAttribute('disabled')).toBe(true)
    await act(async () => {
      fireEvent.click(own)
    })
    expect(setWorkspace).toHaveBeenCalledTimes(1)
    await act(async () => finish({ ok: true }))
    expect(screen.getByRole('button', { name: 'My own' }).hasAttribute('disabled')).toBe(false)
    expect(document.querySelector('[role="status"]')).toBeNull()
  })
})
