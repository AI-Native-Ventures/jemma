import { NextResponse } from 'next/server'
import { post } from '@/lib/agent'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { settleStopped, userOfToken } from '../_lib/job'

/** Jemma Desktop, signed with its MCP token, retries a stopped job later or runs it in the cloud this time. */
export async function POST(request: Request) {
  const db = createSupabaseAdmin()
  const userId = await userOfToken(db, request.headers.get('authorization'))
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { eventId?: unknown; action?: unknown } | null
  if (!body || typeof body.eventId !== 'string' || (body.action !== 'retry' && body.action !== 'cloud')) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const ok = await settleStopped(db, userId, body.eventId, body.action, post)
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 })
}
