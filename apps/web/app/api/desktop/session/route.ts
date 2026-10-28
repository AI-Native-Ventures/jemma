import { NextResponse } from 'next/server'
import { supabaseEnv } from '@/lib/supabase/env'
import { createSupabaseServer } from '@/lib/supabase/server'

/**
 * Jemma Desktop asks, through its own web window, who is signed in. The answer carries the user's own
 * short-lived access token so the desktop runner can claim jobs under row-level security. The call also
 * refreshes the session cookies, which keeps the window signed in. Signed out gets 401.
 */
export async function GET() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ signedIn: false }, { status: 401 })
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) return NextResponse.json({ signedIn: false }, { status: 401 })
  const { url, anonKey } = supabaseEnv()
  const { data: profile } = await supabase.from('profiles').select('display_name, role').eq('user_id', data.user.id).maybeSingle()
  return NextResponse.json(
    {
      signedIn: true,
      userId: data.user.id,
      email: data.user.email ?? null,
      displayName: profile?.display_name ?? null,
      role: profile?.role ?? null,
      accessToken: session.access_token,
      expiresAt: session.expires_at ?? null,
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      agentUrl: process.env.AGENT_URL ?? null,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
