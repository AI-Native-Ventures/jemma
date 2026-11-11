/**
 * Paths inside `/t`, `/p` and `/k` that a signed-out person may open. A learner has no session before the code and PIN are
 * typed, so the learner sign-in screen must be one of them. Used by the proxy and by the learner layout.
 */
export const PUBLIC_PATHS = ['/k/sign-in'] as const

export const isPublicPath = (pathname: string): boolean => (PUBLIC_PATHS as readonly string[]).includes(pathname.replace(/\/+$/, ''))
