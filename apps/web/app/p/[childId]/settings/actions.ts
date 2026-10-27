'use server'

import { revalidatePath } from 'next/cache'
import { createChildLogin } from '@/lib/child-login'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type PinResult = { ok: true; code: string } | { ok: false; error: string }

/**
 * Makes the child's sign-in code and PIN. A parent with an approved link may do it. An earlier
 * code is removed with its child user, so the old code stops working.
 */
export async function setChildPin(childId: string, pin: string): Promise<PinResult> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'Use 4 digits.' }
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Sign in again.' }
  const { data: link } = await supabase
    .from('parent_links')
    .select('id')
    .eq('child_id', childId)
    .eq('parent_id', auth.user.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!link) return { ok: false, error: 'You can only change your own child.' }

  const admin = createSupabaseAdmin()
  const { data: old } = await admin.from('child_logins').select('user_id').eq('child_id', childId).maybeSingle()
  if (old) {
    const gone = await admin.auth.admin.deleteUser(old.user_id)
    if (gone.error) return { ok: false, error: 'Could not remove the old code. Try again.' }
  }
  try {
    const { code } = await createChildLogin(admin, childId, pin)
    await admin.from('child_logins').update({ pin_set_by: auth.user.id }).eq('code', code)
    revalidatePath(`/p/${childId}/settings`)
    revalidatePath(`/p/${childId}/settings/login`)
    return { ok: true, code }
  } catch {
    return { ok: false, error: 'Could not make a new code. Try again.' }
  }
}
