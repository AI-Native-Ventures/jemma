import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// P152: global-error.tsx, the screen that replaces the whole page (root layout included). It renders its own html and body, so these tests render into the
// document itself, and live in their own file: React attaches its click handling to the document only for the first root that is built on it. The page
// reload is a double. No database, no network, no browser.

const reloadPage = vi.fn()
vi.mock('@/lib/reload-page', () => ({ reloadPage: () => reloadPage() }))

import GlobalError from '@/app/global-error'
import { RECOVERY_HELP, RECOVERY_TITLE, forgetTries } from '@/lib/error-recovery'

const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T19:00:00Z'))
  forgetTries()
  reloadPage.mockReset()
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('global-error.tsx', () => {
  it('has its own html and body, shows "Reconnecting", and tries again by itself', async () => {
    const retry = vi.fn()
    render(<GlobalError error={new Error('Failed to fetch')} reset={vi.fn()} retry={retry} />, { container: document })
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(document.body.textContent).toContain('Reconnecting.')
    await tick(999)
    expect(retry).not.toHaveBeenCalled()
    await tick(1)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows the card with inline styles (no stylesheet is loaded here), and Try again loads the whole page again', async () => {
    render(<GlobalError error={new Error('Something else broke')} reset={vi.fn()} />, { container: document })
    expect(document.body.textContent).toContain(RECOVERY_TITLE)
    expect(document.body.textContent).toContain(RECOVERY_HELP)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!
    expect(button.getAttribute('style')).toMatch(/min-height:\s*56px/)
    expect(button.getAttribute('style')).toMatch(/padding:\s*12px 20px/)
    await act(async () => button.click())
    expect(reloadPage).toHaveBeenCalledTimes(1)
    const home = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Go to home')!
    expect(home.getAttribute('href')).toBe('/')
    expect(home.getAttribute('style')).toMatch(/min-height:\s*56px/)
  })

  it('reloads the page once for a missing script', async () => {
    const chunk = Object.assign(new Error('Loading chunk 9 failed.'), { name: 'ChunkLoadError' })
    render(<GlobalError error={chunk} reset={vi.fn()} />, { container: document })
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })
})
