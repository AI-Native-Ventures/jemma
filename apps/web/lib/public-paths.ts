/**
 * Paths inside `/t`, `/p` and `/k` that a signed-out person may open. A learner has no session before the code and PIN are
 * typed, so the learner sign-in screen must be one of them. Used by the proxy and by the learner layout.
 */
export const PUBLIC_PATHS = ['/k/sign-in'] as const

/**
 * The saved tour at `/tour` and every page under it: it reads files that ship with the app, so it needs no sign-in, no database and no model. It is
 * not inside `/t`, `/p` or `/k`, so the proxy never sees it; it is listed here so that this file is the one place that says what is open to everyone.
 */
export const PUBLIC_PREFIXES = ['/tour'] as const

export const isPublicPath = (pathname: string): boolean => {
  const path = pathname.replace(/\/+$/, '')
  return (PUBLIC_PATHS as readonly string[]).includes(path) || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}
