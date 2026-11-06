import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { issuePairingCode, supabasePairingStore } from '../_lib/pairing'

/** A signed-in user gets a one-time pairing code to type into Jemma Desktop. */
export async function POST() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const { code, expiresAt } = await issuePairingCode(supabasePairingStore(createSupabaseAdmin()), data.user.id)
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() }, { headers: { 'cache-control': 'no-store' } })
}
