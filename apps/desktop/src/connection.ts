import { createClient } from '@supabase/supabase-js'
import type { Database, JemmaDb } from '@jemma/profiling/db'
import type { Credentials } from './credentials'

export type Connection = { db: JemmaDb; userId: string; displayName: string | null; agentUrl: string | null; stop(): void }

/** Signs in with the stored refresh token. Each refresh rotates it, so the new one is handed back to be stored. */
export async function connect(creds: Credentials, onRefreshToken: (token: string) => void): Promise<Connection | null> {
  const client = createClient<Database>(creds.supabaseUrl, creds.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: true } })
  const { data, error } = await client.auth.refreshSession({ refresh_token: creds.refreshToken })
  if (error || !data.session || !data.user) return null
  onRefreshToken(data.session.refresh_token)
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && session) onRefreshToken(session.refresh_token)
  })
  const { data: profile } = await client.from('profiles').select('display_name').eq('user_id', data.user.id).maybeSingle()
  return {
    db: client as unknown as JemmaDb,
    userId: data.user.id,
    displayName: profile?.display_name ?? null,
    agentUrl: creds.agentUrl,
    stop: () => void client.auth.stopAutoRefresh(),
  }
}
