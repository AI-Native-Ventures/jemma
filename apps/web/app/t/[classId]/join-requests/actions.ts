'use server'

import { redirect } from 'next/navigation'
import { decideJoin, type JoinChoice } from '@/lib/class-join'
import { requireTeaches } from '@/lib/data/p21'

/**
 * The teacher's yes or no on a learner who asked to join the class. A yes says who the learner is: a learner of the class with no login yet, or a new
 * learner. Closes the Needs you item and returns to the class. The approval is saved first (`decideJoin`): when it cannot be saved, or the request
 * was already answered, nothing changes and the answer is the one plain line for the screen to show.
 */
export async function decideJoinRequest(classId: string, requestId: string, decision: 'approved' | 'declined', choice?: JoinChoice): Promise<{ ok: false; message: string }> {
  if (decision !== 'approved' && decision !== 'declined') throw new Error('Unknown decision')
  const { admin, userId, schoolId } = await requireTeaches(classId)
  // The choice comes from the browser: only the two shapes are read.
  const picked: JoinChoice | undefined = choice?.kind === 'new' ? { kind: 'new' } : choice?.kind === 'existing' && typeof choice.childId === 'string' ? { kind: 'existing', childId: choice.childId } : undefined
  const res = await decideJoin(admin, { classId, requestId, teacherId: userId, schoolId, decision, choice: picked })
  if (!res.ok) return res
  redirect(`/t/${classId}`)
}
