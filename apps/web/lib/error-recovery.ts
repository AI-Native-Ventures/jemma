/**
 * What the app's error screens (every `error.tsx` and `global-error.tsx`, P152) do before they show anything: look at the error, and for a
 * failure that looks like a lost connection try again by themselves. Pure: no React, no browser calls except the storage and the page reload
 * that the two small helpers at the bottom wrap (so a test can stand in for them).
 *
 * A screen that polls the server every few seconds (see `useRefreshPoll`) can have one of its refreshes fail on the way (a busy server, a phone
 * that changed network). Next then drops the whole page on its default "This page couldn't load" screen, which has no retry and stays for as long
 * as the page is open. These helpers are what let the page come back without the child touching anything.
 */

export const RECOVERY_TITLE = 'Jemma lost the connection for a moment.'
export const RECOVERY_HELP = 'Check your connection, then tap Try again.'
export const RECOVERY_WAITING = 'Reconnecting.'

/** Waits before the automatic tries: the first after 1 s, then 3 s, then 3 s. Three tries at most for one failure. */
export const RETRY_DELAYS_MS = [1000, 3000, 3000] as const

/** After a try is made, how long the screen waits for it to work before it shows the card with its buttons anyway (a try that hangs). */
export const GIVE_UP_AFTER_MS = 8000

/** A failure is "the same one" for this long after the last automatic try. After that a new failure gets its three tries again. */
export const EPISODE_MS = 60_000

export type ErrorKind = 'chunk' | 'network' | 'other'

/** The words of whatever was thrown: an `Error`, a string, or an object with a `message`. */
function wordsOf(error: unknown): { name: string; message: string; digest: boolean } {
  if (typeof error === 'string') return { name: '', message: error, digest: false }
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; message?: unknown; digest?: unknown }
    return {
      name: typeof e.name === 'string' ? e.name : '',
      message: typeof e.message === 'string' ? e.message : '',
      digest: typeof e.digest === 'string' && e.digest !== '',
    }
  }
  return { name: '', message: '', digest: false }
}

const CHUNK = /ChunkLoadError|Loading (CSS )?chunk \S+ failed|Failed to load chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i
const NETWORK =
  /failed to fetch|fetch failed|networkerror|network error|network request failed|network connection was lost|connection was lost|load failed|connection closed|rsc payload|econnreset|socket hang up|timed? ?out|unexpected end of json|unexpected token|is not valid json|service unavailable|bad gateway|gateway time-?out|\b50[2-4]\b|internet connection appears to be offline|err_(internet|network|connection)/i

/**
 * What kind of failure this looks like.
 *  - `chunk`: a script of the app could not be loaded. After a new version went out, the open page still asks for the old file names.
 *  - `network`: a request did not get through, or came back broken (also an error from a Server Component, which has a digest and no message:
 *    one that failed because the server was busy goes away on a second look, and a try costs one render).
 *  - `other`: anything else (a bug in the page). Trying again by itself will not help, so the card is shown at once.
 * A browser that says it is offline makes any error a `network` one.
 */
export function classifyError(error: unknown, offline = false): ErrorKind {
  const { name, message, digest } = wordsOf(error)
  const text = `${name} ${message}`
  if (CHUNK.test(text)) return 'chunk'
  if (offline || digest || name === 'AbortError' || NETWORK.test(text)) return 'network'
  return 'other'
}

type Episode = { attempts: number; last: number }
let reloaded = 0
// Lives as long as the page (the error screen is shown again each time a try fails, so its own state is gone each time).
let episode: Episode = { attempts: 0, last: 0 }

/** Tries made already for the failure on screen (0 when the last one was long ago). */
export function triesMade(now: number): number {
  if (episode.attempts > 0 && now - episode.last > EPISODE_MS) episode = { attempts: 0, last: 0 }
  return episode.attempts
}

/** The wait before the next automatic try, or null when the three are used up. */
export function nextRetryDelay(now: number): number | null {
  return RETRY_DELAYS_MS[triesMade(now)] ?? null
}

/** An automatic try is being made now. */
export function noteTry(now: number): void {
  episode = { attempts: triesMade(now) + 1, last: now }
}

/** The child tapped Try again: if that fails too the card comes straight back, with no second round of automatic tries. */
export function noteManualTry(now: number): void {
  episode = { attempts: RETRY_DELAYS_MS.length, last: now }
}

/** For tests. */
export function forgetTries(): void {
  episode = { attempts: 0, last: 0 }
  reloaded = 0
}

const RELOAD_KEY = 'jemma-chunk-reload-at'
/** One reload for a missing script, then none for this long (a script that is still missing after the reload is not a new version). */
export const RELOAD_ONCE_MS = 60_000

/**
 * Whether the page may reload itself now for a missing script, and notes that it did. Once: false when it already did within the last minute.
 * Kept in `sessionStorage` (the reload starts a new page, which would forget a variable); where that is not allowed it is kept in a variable.
 */
export function claimReload(now: number): boolean {
  let last = reloaded
  try {
    last = Math.max(last, Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0)
  } catch {
    // Storage is off (some private modes): the variable is the only record.
  }
  if (last > 0 && now - last < RELOAD_ONCE_MS) return false
  reloaded = now
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // As above.
  }
  return true
}

/** The area of the app a path is in, and the page that is home there. Anything else goes to the front door. */
export function homeFor(pathname: string | null | undefined): string {
  const first = (pathname ?? '').split('/')[1]
  if (first === 'k') return '/k'
  if (first === 't') return '/t'
  if (first === 'p') return '/p'
  if (first === 'tour') return '/tour'
  return '/'
}
