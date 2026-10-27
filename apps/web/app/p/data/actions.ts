'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** The "improve Jemma" consent (parent_links.consent.improve). The parent may change only their own approved link. */
export async function setImproveConsent(childId: string, on: boolean): Promise<void> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data: link } = await supabase
    .from('parent_links')
    .select('id, consent')
    .eq('child_id', childId)
    .eq('parent_id', auth.user.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!link) throw new Error('No link to this child')
  const consent = { ...(link.consent as Record<string, boolean>), improve: on }
  const { error } = await createSupabaseAdmin().from('parent_links').update({ consent }).eq('id', link.id)
  if (error) throw new Error(`could not save consent: ${error.message}`)
}
