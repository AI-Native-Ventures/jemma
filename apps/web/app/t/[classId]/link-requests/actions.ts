'use server'

import { redirect } from 'next/navigation'
import { recordApproval } from '@/lib/approvals'
import { requireTeaches } from '@/lib/data/p21'

/** The teacher's yes or no on a parent's request. Closes the Needs you item and returns to the class. */
export async function decideLink(classId: string, linkId: string, decision: 'approved' | 'declined'): Promise<void> {
  if (decision !== 'approved' && decision !== 'declined') throw new Error('Unknown decision')
  const { admin, userId, schoolId } = await requireTeaches(classId)
  const { data, error } = await admin
    .from('parent_links')
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('class_id', classId)
    .select('id, child_id')
  if (error) throw new Error(`could not save: ${error.message}`)
  if (!data?.length) throw new Error('No such request')
  await admin.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_link').eq('ref_id', linkId)
  await recordApproval(admin, { schoolId, kind: 'guardian_link', refId: linkId, childId: data[0]!.child_id, decision, userId })
  redirect(`/t/${classId}`)
}
