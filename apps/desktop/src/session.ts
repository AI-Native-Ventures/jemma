import type { SessionInfo } from './runner-host'

/** Asks the web app, through the window's own cookies, who is signed in. Null when signed out or offline. */
export async function fetchSession(webUrl: string, doFetch: typeof fetch): Promise<SessionInfo | null> {
  try {
    const res = await doFetch(`${webUrl.replace(/\/+$/, '')}/api/desktop/session`, { credentials: 'include' })
    if (!res.ok) return null
    const b = (await res.json()) as Partial<Record<keyof SessionInfo | 'signedIn', unknown>>
    if (b.signedIn !== true || typeof b.userId !== 'string' || typeof b.accessToken !== 'string') return null
    if (typeof b.supabaseUrl !== 'string' || typeof b.supabaseAnonKey !== 'string') return null
    return {
      userId: b.userId,
      email: typeof b.email === 'string' ? b.email : null,
      displayName: typeof b.displayName === 'string' ? b.displayName : null,
      accessToken: b.accessToken,
      supabaseUrl: b.supabaseUrl,
      supabaseAnonKey: b.supabaseAnonKey,
      agentUrl: typeof b.agentUrl === 'string' ? b.agentUrl : null,
    }
  } catch {
    return null
  }
}
