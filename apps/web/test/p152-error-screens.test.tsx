import { act, render } from '@testing-library/react'
import { Component, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// P152: every error screen first tries again by itself when the failure looks like a lost connection, and only then shows a calm card. The page
// reload is a double (a test page cannot be reloaded). No database, no network, no browser.

const reloadPage = vi.fn()
vi.mock('@/lib/reload-page', () => ({ reloadPage: () => reloadPage() }))
let pathname: string | null = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import AppError from '@/app/error'
import LearnerError from '@/app/k/error'
import ParentError from '@/app/p/error'
import TeacherError from '@/app/t/error'
import TourError from '@/app/tour/error'
import { ErrorRecovery } from '@/components/ErrorRecovery'
import { RECOVERY_HELP, RECOVERY_TITLE, claimReload, classifyError, forgetTries, homeFor, nextRetryDelay, noteManualTry, noteTry } from '@/lib/error-recovery'

const lost = new Error('Failed to fetch')
const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T19:00:00Z'))
  forgetTries()
  reloadPage.mockReset()
  pathname = '/'
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('classifyError', () => {
  it.each([
    ['ChunkLoadError', 'Loading chunk 412 failed.', 'chunk'],
    ['Error', 'Loading CSS chunk 9 failed.', 'chunk'],
    ['TypeError', 'Failed to fetch dynamically imported module: https://x/y.js', 'chunk'],
    ['TypeError', 'Failed to fetch', 'network'],
    ['TypeError', 'Load failed', 'network'],
    ['TypeError', 'NetworkError when attempting to fetch resource.', 'network'],
    ['Error', 'Failed to fetch RSC payload for https://x/k. Falling back to browser navigation.', 'network'],
    ['Error', 'Connection closed.', 'network'],
    ['SyntaxError', "Unexpected token '<', \"<html>503 Se\"... is not valid JSON", 'network'],
    ['AbortError', 'The operation was aborted.', 'network'],
    ['TypeError', "Cannot read properties of undefined (reading 'name')", 'other'],
    ['Error', 'Something else broke', 'other'],
  ])('%s: %s is %s', (name, message, kind) => {
    const error = Object.assign(new Error(message), { name })
    expect(classifyError(error)).toBe(kind)
  })

  it('takes an error from a Server Component (a digest and no useful message) as a try-again one', () => {
    expect(classifyError(Object.assign(new Error('An error occurred in the Server Components render.'), { digest: '1234' }))).toBe('network')
  })

  it('takes any error as a lost connection when the browser says it is offline, but still sees a missing script as one', () => {
    expect(classifyError(new Error('Something else broke'), true)).toBe('network')
    expect(classifyError(new Error('Loading chunk 3 failed.'), true)).toBe('chunk')
  })

  it('reads a string, an object with a message, and nothing', () => {
    expect(classifyError('Failed to fetch')).toBe('network')
    expect(classifyError({ message: 'Loading chunk 1 failed' })).toBe('chunk')
    expect(classifyError(undefined)).toBe('other')
    expect(classifyError(null)).toBe('other')
  })
})

describe('the count of tries', () => {
  it('gives 1 s, 3 s, 3 s and then nothing, and starts again for a failure a minute after the last try', () => {
    const t0 = Date.now()
    expect(nextRetryDelay(t0)).toBe(1000)
    noteTry(t0)
    expect(nextRetryDelay(t0 + 1000)).toBe(3000)
    noteTry(t0 + 1000)
    expect(nextRetryDelay(t0 + 4000)).toBe(3000)
    noteTry(t0 + 4000)
    expect(nextRetryDelay(t0 + 7000)).toBeNull()
    expect(nextRetryDelay(t0 + 4000 + 60_001)).toBe(1000)
  })

  it('a tap on Try again uses them up', () => {
    noteManualTry(Date.now())
    expect(nextRetryDelay(Date.now())).toBeNull()
  })
})

describe('the one reload for a missing script', () => {
  it('is allowed once, then not for a minute, then allowed again', () => {
    const t0 = Date.now()
    expect(claimReload(t0)).toBe(true)
    expect(claimReload(t0 + 5000)).toBe(false)
    expect(claimReload(t0 + 59_999)).toBe(false)
    expect(claimReload(t0 + 60_001)).toBe(true)
  })

  it('still holds when the storage of the browser is off', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(claimReload(Date.now())).toBe(true)
    expect(claimReload(Date.now() + 1000)).toBe(false)
  })
})

describe('homeFor', () => {
  it.each([
    ['/k', '/k'],
    ['/k/session/abc', '/k'],
    ['/t/class-1/snap', '/t'],
    ['/p/child-1', '/p'],
    ['/tour/teacher', '/tour'],
    ['/tour', '/tour'],
    ['/sign-in', '/'],
    ['/', '/'],
    [null, '/'],
  ])('%s is home at %s', (path, home) => {
    expect(homeFor(path)).toBe(home)
  })
})

/** The error screen built again, as Next does each time a try fails: the screen is new and its own state is gone. */
function show(Screen: ComponentType<{ error: unknown; reset: () => void; retry?: () => void }>, error: unknown, fns: { reset: () => void; retry?: () => void }) {
  return render(<Screen error={error} {...fns} />)
}

describe('an error screen with a lost connection', () => {
  it('shows a quiet "Reconnecting" and no card, tries after 1 s, then 3 s, then 3 s, and then shows the card, with reset when there is no retry', async () => {
    const reset = vi.fn()
    let view = show(ErrorRecovery, lost, { reset })
    expect(view.getByRole('status').textContent).toBe('Reconnecting.')
    expect(view.queryByRole('alert')).toBeNull()
    await tick(999)
    expect(reset).not.toHaveBeenCalled()
    await tick(1)
    expect(reset).toHaveBeenCalledTimes(1)
    // The try failed: Next shows the screen again.
    view.unmount()
    view = show(ErrorRecovery, lost, { reset })
    expect(view.queryByRole('alert')).toBeNull()
    await tick(2999)
    expect(reset).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(reset).toHaveBeenCalledTimes(2)
    view.unmount()
    view = show(ErrorRecovery, lost, { reset })
    await tick(3000)
    expect(reset).toHaveBeenCalledTimes(3)
    view.unmount()
    // Three tries are all there are: the card shows at once, and nothing is tried again.
    view = show(ErrorRecovery, lost, { reset })
    expect(view.getByRole('alert').textContent).toContain(RECOVERY_TITLE)
    await tick(60_000)
    expect(reset).toHaveBeenCalledTimes(3)
  })

  it('uses retry (which asks the server again) and not reset when Next gives both', async () => {
    const reset = vi.fn()
    const retry = vi.fn()
    show(ErrorRecovery, lost, { reset, retry })
    await tick(1000)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it('shows the card when a try does not come back within 8 s, and keeps it', async () => {
    const view = show(ErrorRecovery, lost, { reset: vi.fn(), retry: vi.fn() })
    await tick(1000)
    expect(view.queryByRole('alert')).toBeNull()
    await tick(7999)
    expect(view.queryByRole('alert')).toBeNull()
    await tick(1)
    expect(view.getByRole('alert').textContent).toContain(RECOVERY_TITLE)
  })

  it('stops its timers when the page comes back before they fire (the screen goes away)', async () => {
    const retry = vi.fn()
    const view = show(ErrorRecovery, lost, { reset: vi.fn(), retry })
    await tick(500)
    view.unmount()
    await tick(60_000)
    expect(retry).not.toHaveBeenCalled()
  })

  it('is a try-again error also when the browser is offline, whatever the message', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const retry = vi.fn()
    show(ErrorRecovery, new Error('Something else broke'), { reset: vi.fn(), retry })
    await tick(1000)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('an error screen with any other error', () => {
  it('shows the card at once and never tries by itself', async () => {
    const retry = vi.fn()
    const view = show(ErrorRecovery, new TypeError("Cannot read properties of undefined (reading 'name')"), { reset: vi.fn(), retry })
    expect(view.getByRole('alert').textContent).toContain(RECOVERY_TITLE)
    expect(view.queryByRole('status')).toBeNull()
    await tick(60_000)
    expect(retry).not.toHaveBeenCalled()
  })
})

describe('the card', () => {
  const other = new Error('Something else broke')

  it('has the words, a Try again button and a Go to home link, each at least 56 px high with room at the sides, and no em dash', () => {
    const view = show(ErrorRecovery, other, { reset: vi.fn() })
    const card = view.getByRole('alert')
    expect(card.textContent).toContain('Jemma lost the connection for a moment.')
    expect(card.textContent).toContain(RECOVERY_HELP)
    expect(card.textContent).not.toContain(String.fromCharCode(0x2014))
    const button = view.getByRole('button', { name: 'Try again' })
    const link = view.getByRole('link', { name: 'Go to home' })
    for (const el of [button, link]) {
      expect(el.className).toMatch(/min-h-14/)
      expect(el.className).toMatch(/px-5/)
    }
    // The kit's button has a fixed height of its own (60 px): the card takes it off, as the button guard (p90) asks.
    expect(button.className).toMatch(/!h-auto/)
    expect(link.className).not.toMatch(/(^|\s)h-\[?\d/)
  })

  it('Try again calls retry once, shows it is working, and a failed try shows the card again at once', async () => {
    const retry = vi.fn()
    let view = show(ErrorRecovery, other, { reset: vi.fn(), retry })
    const button = view.getByRole('button', { name: 'Try again' })
    await act(async () => button.click())
    expect(retry).toHaveBeenCalledTimes(1)
    expect((view.getByRole('button', { name: /Try again/ }) as HTMLButtonElement).disabled).toBe(true)
    // The try failed: the screen is built again. It is a lost-connection error this time, and the tap used up the tries.
    view.unmount()
    view = show(ErrorRecovery, lost, { reset: vi.fn(), retry })
    expect(view.getByRole('alert')).toBeTruthy()
    await tick(60_000)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('Try again works again after 8 s if nothing came back', async () => {
    const view = show(ErrorRecovery, other, { reset: vi.fn(), retry: vi.fn() })
    await act(async () => view.getByRole('button', { name: 'Try again' }).click())
    await tick(8000)
    expect((view.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('each error.tsx', () => {
  const screens: [string, ComponentType<{ error: unknown; reset: () => void; retry?: () => void }>, string][] = [
    ['app/k/error.tsx', LearnerError, '/k'],
    ['app/t/error.tsx', TeacherError, '/t'],
    ['app/p/error.tsx', ParentError, '/p'],
    ['app/tour/error.tsx', TourError, '/tour'],
  ]

  it.each(screens)('%s tries three times by itself, then shows the card with home at %s', async (_file, Screen, home) => {
    const reset = vi.fn()
    let view = show(Screen, lost, { reset })
    for (const [wait, calls] of [[1000, 1], [3000, 2], [3000, 3]] as const) {
      await tick(wait)
      expect(reset).toHaveBeenCalledTimes(calls)
      view.unmount()
      view = show(Screen, lost, { reset })
    }
    expect(view.getByRole('alert').textContent).toContain('Jemma lost the connection for a moment.')
    expect(view.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(view.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe(home)
    await tick(30_000)
    expect(reset).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['/sign-in', '/'],
    ['/k/session/abc', '/k'],
    ['/p/child-1/learn', '/p'],
    [null, '/'],
  ])('app/error.tsx (the one above the layouts) reads home from the address: %s goes to %s', (path, home) => {
    pathname = path
    const view = show(AppError, new Error('Something else broke'), { reset: vi.fn() })
    expect(view.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe(home)
  })

  it('app/error.tsx tries by itself too', async () => {
    const retry = vi.fn()
    show(AppError, lost, { reset: vi.fn(), retry })
    await tick(1000)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('a script that could not be loaded (a new version went out while the page was open)', () => {
  const chunk = Object.assign(new Error('Loading chunk 412 failed.'), { name: 'ChunkLoadError' })

  it('reloads the whole page once, and shows "Reconnecting" meanwhile', async () => {
    const retry = vi.fn()
    const view = show(LearnerError, chunk, { reset: vi.fn(), retry })
    expect(reloadPage).toHaveBeenCalledTimes(1)
    expect(view.queryByRole('alert')).toBeNull()
    await tick(500)
    expect(retry).not.toHaveBeenCalled()
  })

  it('does not reload a second time: the same error after the reload is tried again like a lost connection, then shows the card', async () => {
    show(LearnerError, chunk, { reset: vi.fn(), retry: vi.fn() }).unmount()
    expect(reloadPage).toHaveBeenCalledTimes(1)
    const retry = vi.fn()
    const view = show(LearnerError, chunk, { reset: vi.fn(), retry })
    expect(reloadPage).toHaveBeenCalledTimes(1)
    await tick(1000)
    expect(retry).toHaveBeenCalledTimes(1)
    view.unmount()
    const again = show(LearnerError, chunk, { reset: vi.fn(), retry })
    await tick(3000)
    again.unmount()
    show(LearnerError, chunk, { reset: vi.fn(), retry })
    await tick(3000)
    expect(retry).toHaveBeenCalledTimes(3)
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })
})

describe('with a real error boundary the way Next builds one', () => {
  /** Next's own boundary in miniature: it shows the error screen with `reset` (render again) and `retry` (the same, after asking the server). */
  class Boundary extends Component<{ children: ReactNode; Screen: ComponentType<{ error: unknown; reset: () => void; retry?: () => void }>; onRetry: () => void }, { error: unknown }> {
    state = { error: null as unknown }
    static getDerivedStateFromError(error: unknown) {
      return { error: error ?? new Error('thrown') }
    }
    retry = () => {
      this.props.onRetry()
      this.setState({ error: null })
    }
    render() {
      const { Screen } = this.props
      return this.state.error ? <Screen error={this.state.error} reset={() => this.setState({ error: null })} retry={this.retry} /> : this.props.children
    }
  }

  /** A page that cannot be drawn while `server.down` (React draws a failing page more than once, so a count of draws would not say much). */
  function setup() {
    const server = { down: true }
    const onRetry = vi.fn()
    function Page() {
      if (server.down) throw new Error('Failed to fetch')
      return <p>the practice is ready</p>
    }
    // React logs the errors it hands to a boundary, and tells the page it recovered by drawing again.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const quiet = () => {}
    const view = render(
      <Boundary Screen={LearnerError} onRetry={onRetry}>
        <Page />
      </Boundary>,
      { onCaughtError: quiet, onRecoverableError: quiet },
    )
    return { view, onRetry, server }
  }

  it('a failure that goes away before the first try never shows the card: the page is back after 1 s', async () => {
    const { view, onRetry, server } = setup()
    expect(view.queryByRole('alert')).toBeNull()
    expect(view.getByRole('status').textContent).toBe('Reconnecting.')
    server.down = false
    await tick(1000)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(view.queryByRole('alert')).toBeNull()
    expect(view.queryByText('the practice is ready')).not.toBeNull()
    await tick(60_000)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('a failure that stays shows the card after three tries, and nothing else is tried', async () => {
    const { view, onRetry } = setup()
    for (const [wait, calls] of [[1000, 1], [3000, 2], [3000, 3]] as const) {
      expect(view.queryByRole('alert'), `no card before try ${calls}`).toBeNull()
      await tick(wait)
      expect(onRetry).toHaveBeenCalledTimes(calls)
    }
    expect(view.getByRole('alert').textContent).toContain(RECOVERY_TITLE)
    await tick(60_000)
    expect(onRetry).toHaveBeenCalledTimes(3)
  })

  it('a failure that goes away after the first try is never seen as a card either', async () => {
    const { view, onRetry, server } = setup()
    await tick(1000) // the first try fails
    expect(view.queryByRole('alert')).toBeNull()
    server.down = false
    await tick(3000)
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(view.queryByText('the practice is ready')).not.toBeNull()
    expect(view.queryByRole('alert')).toBeNull()
  })

  it('Try again on the card brings the page back once the server is back', async () => {
    const { view, onRetry, server } = setup()
    await tick(1000)
    await tick(3000)
    await tick(3000)
    expect(view.getByRole('alert')).toBeTruthy()
    server.down = false
    await act(async () => view.getByRole('button', { name: 'Try again' }).click())
    expect(onRetry).toHaveBeenCalledTimes(4)
    expect(view.queryByText('the practice is ready')).not.toBeNull()
    expect(view.queryByRole('alert')).toBeNull()
  })
})
