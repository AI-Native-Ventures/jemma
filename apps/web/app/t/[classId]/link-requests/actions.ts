'use server'

import { redirect } from 'next/navigation'
import { isApprovalNotSaved, withApproval } from '@/lib/approvals'
import { requireTeaches } from '@/lib/data/p21'

/**
 * The teacher's yes or no on a parent's request. Closes the Needs you item and returns to the class. The approval is saved first: when it cannot be
 * saved nothing changes and the answer is the one plain line for the screen to show; when the request cannot be saved, the approval is taken back.
 */
export async function decideLink(classId: string, linkId: string, decision: 'approved' | 'declined'): Promise<{ ok: false; message: string }> {
  if (decision !== 'approved' && decision !== 'declined') throw new Error('Unknown decision')
  const { admin, userId, schoolId } = await requireTeaches(classId)
  const found = await admin.from('parent_links').select('id, child_id').eq('id', linkId).eq('class_id', classId).maybeSingle()
  if (found.error) throw new Error(`could not save: ${found.error.message}`)
  if (!found.data) throw new Error('No such request')
  try {
    await withApproval(admin, { schoolId, kind: 'guardian_link', refId: linkId, childId: found.data.child_id, decision, userId }, async () => {
      const { data, error } = await admin
        .from('parent_links')
        .update({ status: decision, decided_at: new Date().toISOString() })
        .eq('id', linkId)
        .eq('class_id', classId)
        .select('id, child_id')
      if (error) throw new Error(`could not save: ${error.message}`)
      if (!data?.length) throw new Error('No such request')
      await admin.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_link').eq('ref_id', linkId)
    })
  } catch (e) {
    if (isApprovalNotSaved(e)) return { ok: false, message: e.message }
    throw e
  }
  redirect(`/t/${classId}`)
}
