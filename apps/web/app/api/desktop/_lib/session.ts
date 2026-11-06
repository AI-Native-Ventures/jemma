import { createClient } from '@supabase/supabase-js'
import type { JemmaDb } from '@jemma/profiling/db'

export type DesktopSession = { accessToken: string; refreshToken: string }

/**
 * Signs the paired user in for Jemma Desktop: a magic link is generated for them with the service client and
 * redeemed at once with the anon client, which returns a normal Supabase session. No email is sent.
 * The desktop keeps the refresh token in the macOS keychain and refreshes it itself.
 */
export async function mintSession(admin: JemmaDb, userId: string, env: { url: string; anonKey: string }): Promise<DesktopSession> {
  const { data: user, error: userError } = await admin.auth.admin.getUserById(userId)
  const email = user?.user?.email
  if (userError || !email) throw new Error('paired user has no email')
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const hashed = link?.properties?.hashed_token
  if (linkError || !hashed) throw new Error('could not start a session')
  const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' })
  if (error || !data.session) throw new Error('could not start a session')
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
}
