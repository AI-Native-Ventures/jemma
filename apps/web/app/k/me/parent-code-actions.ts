'use server'

import { requireRole } from '@/lib/auth'
import { independentChildOf, makeParentCode, ParentCodeError } from '@/lib/parent-invite'

export type MadeCodeResult = { ok: true; code: string } | { ok: false; message: string }

/**
 * "Make a code" and "Make a new code" on Me (P114): the signed-in learner, who must have signed up on their own, gets a new 6-character code for a parent
 * and the earlier one stops working. Never throws to the screen: a refusal comes back as one plain sentence.
 */
export async function makeMyParentCode(): Promise<MadeCodeResult> {
  const { userId } = await requireRole('learner')
  const child = await independentChildOf(userId)
  if (!child) return { ok: false, message: 'A code is for a learner who signed up on their own.' }
  try {
    const made = await makeParentCode(child.id, userId)
    return { ok: true, code: made.code }
  } catch (e) {
    if (e instanceof ParentCodeError) return { ok: false, message: e.message }
    console.error(`parent code not made: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'Could not make a code. Try again.' }
  }
}
