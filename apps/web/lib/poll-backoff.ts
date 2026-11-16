/**
 * How long a screen that asks the server again every few seconds waits after the asks that failed. Pure: no React, no router, no browser.
 *
 * With no failure the wait is the screen's own (3 s). Each failure in a row doubles it (6 s, 12 s, 24 s) up to 30 s, and the first ask that works
 * puts it back to the screen's own wait. A poll never stops because of a failure: it only slows down, so a phone that lost the network, or a server
 * that is busy, is not asked again every 3 s and the screen is asked again as soon as the wait is over.
 */
export const MAX_BACKOFF_MS = 30_000

/** The wait after `failures` asks in a row that failed. Never shorter than `baseMs`, never longer than 30 s (or `baseMs`, if that is longer). */
export function backoffWait(baseMs: number, failures: number): number {
  if (failures <= 0) return baseMs
  return Math.max(baseMs, Math.min(baseMs * 2 ** failures, MAX_BACKOFF_MS))
}

/** Whether the browser says it has no network. A browser that cannot say (no `navigator`) counts as online. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
