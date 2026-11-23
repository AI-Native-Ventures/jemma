import { familyCopy } from '@/lib/family-data'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** "Get a copy": the family's data as one file (see `familyCopy`), for the signed-in parent only. */
export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return new Response('Sign in first.', { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', auth.user.id).maybeSingle()
  if (profile?.role !== 'parent') return new Response('This copy is for parents.', { status: 403 })
  const copy = await familyCopy(supabase, createSupabaseAdmin(), { id: auth.user.id, email: auth.user.email ?? null, createdAt: auth.user.created_at ?? null })
  const day = copy.made_at.slice(0, 10)
  return new Response(JSON.stringify(copy, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="jemma-family-data-${day}.json"`,
      'cache-control': 'no-store',
    },
  })
}
