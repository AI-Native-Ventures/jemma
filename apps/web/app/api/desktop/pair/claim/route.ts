import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { supabaseEnv } from '@/lib/supabase/env'
import { claimPairing, supabasePairingStore } from '../../_lib/pairing'
import { mintSession } from '../../_lib/session'

/**
 * Jemma Desktop swaps the code for its per-user MCP token and a Supabase session of its own. The code is the
 * credential: no cookie needed. The answer also carries the public Supabase settings and the agent's address.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  if (!body || typeof body.code !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const admin = createSupabaseAdmin()
  const res = await claimPairing(supabasePairingStore(admin), body.code)
  const headers = { 'cache-control': 'no-store' }
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === 'rate_limited' ? 429 : 400, headers })
  try {
    const { url, anonKey } = supabaseEnv()
    const session = await mintSession(admin, res.userId, { url, anonKey })
    return NextResponse.json(
      { token: res.token, refreshToken: session.refreshToken, supabaseUrl: url, supabaseAnonKey: anonKey, agentUrl: process.env.AGENT_URL ?? null },
      { headers },
    )
  } catch {
    return NextResponse.json({ error: 'session_failed' }, { status: 502, headers })
  }
}
