'use server'

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { HANDOVER_COOKIE, HANDOVER_TTL_SECONDS, signHandover } from '@/lib/data/p25'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { WORKSPACE_COOKIE, workspaceCookieOptions } from '@/lib/workspace'

/**
 * "Amina has the phone": marks tonight's session in progress and stores the short-lived handover cookie
 * that `/k/session/[id]` honours until the session ends. The parent stays signed in.
 * The session may be one of the learner's own private workspace ("My own"): the device's workspace is set to the one the session belongs to,
 * so the learner's screens find that session whatever this device chose before.
 */
export async function startSession(sessionId: string): Promise<never> {
  // Read under RLS first: only a parent linked to the child can see the session.
  const supabase = await createSupabaseServer()
  const { data: session } = await supabase.from('sessions').select('id, child_id, status').eq('id', sessionId).maybeSingle()
  if (!session || session.status === 'done') notFound()

  if (session.status === 'planned') {
    const { error } = await createSupabaseAdmin().from('sessions').update({ status: 'in_progress' }).eq('id', sessionId).eq('status', 'planned')
    if (error) throw new Error(`startSession: ${error.message}`)
  }

  const { data: kid } = await supabase.from('children').select('private_of').eq('id', session.child_id).maybeSingle()
  const store = await cookies()
  store.set(HANDOVER_COOKIE, await signHandover(sessionId, session.child_id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: HANDOVER_TTL_SECONDS,
  })
  store.set(WORKSPACE_COOKIE, kid?.private_of ? 'own' : 'school', workspaceCookieOptions())
  redirect(`/k/session/${sessionId}`)
}
