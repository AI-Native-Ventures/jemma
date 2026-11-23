'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { deleteChildData, deleteParentAccount } from '@/lib/family-data'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type DeleteResult = { ok: false; message: string }

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

/** True when the signed-in parent has an approved link to this child (read with their own session, so the rules decide). */
async function mayActFor(childId: string, parentId: string): Promise<boolean> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('parent_links').select('id').eq('child_id', childId).eq('parent_id', parentId).eq('status', 'approved').maybeSingle()
  return Boolean(data)
}

/** "Delete {name}'s data": everything Jemma keeps about the child goes at once (see `deleteChildData`), then the parent is back on their home page. */
export async function deleteChild(childId: string): Promise<DeleteResult> {
  const { userId } = await requireRole('parent')
  if (!(await mayActFor(childId, userId))) return { ok: false, message: 'You can only delete your own child.' }
  try {
    await deleteChildData(createSupabaseAdmin(), childId)
  } catch (e) {
    console.error(`child data not deleted: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'That did not work. Nothing was lost. Try again.' }
  }
  revalidatePath('/p', 'layout')
  redirect('/p')
}

/** "Delete my account": the parent's account goes at once (see `deleteParentAccount`), the browser is signed out and lands on the start page. */
export async function deleteMyAccount(): Promise<DeleteResult> {
  const { userId } = await requireRole('parent')
  try {
    await deleteParentAccount(createSupabaseAdmin(), userId)
  } catch (e) {
    console.error(`account not deleted: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'That did not work. Try again.' }
  }
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  redirect('/')
}
