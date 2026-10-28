import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { claimPairing, supabasePairingStore } from '../../_lib/pairing'

/** Jemma Desktop swaps the code for its per-user MCP token. The code is the credential: no cookie needed. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  if (!body || typeof body.code !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const res = await claimPairing(supabasePairingStore(createSupabaseAdmin()), body.code)
  const headers = { 'cache-control': 'no-store' }
  if (res.ok) return NextResponse.json({ token: res.token }, { headers })
  return NextResponse.json({ error: res.reason }, { status: res.reason === 'rate_limited' ? 429 : 400, headers })
}
