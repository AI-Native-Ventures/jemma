// Which workspace a learner's screens show: "My school" (the child of the school) or "My own" (the private twin, see
// `packages/profiling/src/own-workspace.ts`). The choice is a plain cookie on the device: it holds one of two words and nothing about
// anyone, and the server only honours it for a learner (or a parent's hand-over) who has a workspace of that kind. Plain functions, no server
// code: the screens, the actions and the tests import the same file.

export type Workspace = 'school' | 'own'

/** The cookie `setWorkspace` writes and `myChild` reads. */
export const WORKSPACE_COOKIE = 'jemma_ws'

/** A month: long enough that a learner finds the workspace they left, short enough that a shared tablet forgets. */
export const WORKSPACE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** The workspace a cookie value names: `own` only for the exact word, everything else (nothing, another word) is `school`. */
export const workspaceOf = (value: string | null | undefined): Workspace => (value === 'own' ? 'own' : 'school')

/** The options of the cookie: for this site only, never read by a script. */
export const workspaceCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: WORKSPACE_MAX_AGE_SECONDS,
})
