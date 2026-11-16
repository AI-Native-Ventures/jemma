import { currentParentCode, independentChildOf } from '@/lib/parent-invite'
import { createSupabaseServer } from '@/lib/supabase/server'
import { ParentCodeCard } from './ParentCodeCard'

/**
 * "Link a parent" on Me (P114): shown only to a learner who signed up on their own (a child of a personal school with their own login). A learner of a
 * school, a parent who has the phone for a moment and a signed-out visitor see nothing here: a school learner is linked to a parent by the teacher.
 * Shows the code the learner already has, when it still works.
 */
export async function LinkParent() {
  const { data: auth } = await (await createSupabaseServer()).auth.getUser()
  if (!auth.user) return null
  const child = await independentChildOf(auth.user.id)
  if (!child) return null
  const current = await currentParentCode(child.id, auth.user.id).catch(() => null)
  return <ParentCodeCard initial={current?.code ?? null} />
}
