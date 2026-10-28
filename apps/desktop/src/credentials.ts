/** What pairing gives Jemma Desktop. All of it is kept encrypted by the macOS keychain, never in plain text on disk. */
export type Credentials = {
  /** Per-user MCP token the agent's /mcp accepts. */
  token: string
  /** Refresh token of the user's own Supabase session, so the runner claims jobs under row-level security. */
  refreshToken: string
  supabaseUrl: string
  supabaseAnonKey: string
  agentUrl: string | null
}

export const serialise = (c: Credentials) => JSON.stringify(c)

export function parseCredentials(text: string | null): Credentials | null {
  if (!text) return null
  try {
    const c = JSON.parse(text) as Partial<Credentials>
    if (typeof c.token !== 'string' || typeof c.refreshToken !== 'string') return null
    if (typeof c.supabaseUrl !== 'string' || typeof c.supabaseAnonKey !== 'string') return null
    return { token: c.token, refreshToken: c.refreshToken, supabaseUrl: c.supabaseUrl, supabaseAnonKey: c.supabaseAnonKey, agentUrl: typeof c.agentUrl === 'string' ? c.agentUrl : null }
  } catch {
    return null
  }
}
