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
  // A learner who signed up alone has a login of their own and no code made by a parent (P114): a new code would take that login away from them.
  if (!old) {
    const { data: child } = await admin.from('children').select('user_id').eq('id', childId).maybeSingle()
    if (child?.user_id) return { ok: false, error: 'This learner signs in with their own account.' }
  }
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

/** "Edit": the child's first name, the one Jemma uses everywhere (the class list too). A parent with an approved link may change it. */
export async function saveChildName(childId: string, name: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!clean) return { ok: false, message: 'Write a first name.' }
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: 'Sign in again.' }
  const { data: link } = await supabase.from('parent_links').select('id').eq('child_id', childId).eq('parent_id', auth.user.id).eq('status', 'approved').maybeSingle()
  if (!link) return { ok: false, message: 'You can only change your own child.' }
  const admin = createSupabaseAdmin()
  const { error } = await admin.from('children').update({ first_name: clean }).eq('id', childId)
  if (error) return { ok: false, message: 'Could not save. Try again.' }
  // The child's own side ("My own") carries the same first name.
  await admin.from('children').update({ first_name: clean }).eq('private_of', childId)
  revalidatePath(`/p/${childId}`, 'layout')
  return { ok: true }
}
