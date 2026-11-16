'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { linkParentWithCode } from '@/lib/parent-invite'

export type LinkByCodeResult = { ok: false; message: string }

/**
 * "My child has a code from their own Jemma" (P114): a signed-in parent types the code a learner who signed up alone made on their own screen. A good code
 * makes the parent's link to that learner at once (the learner giving the code is the consent, so no teacher says yes), uses the code up, and sends the
 * parent to the child's page. A code that is wrong, past its 7 days or already used comes back as one plain sentence, and nothing is linked. Never throws
 * to the screen except to send the parent on.
 */
export async function linkChildWithCode(input: { code: string }): Promise<LinkByCodeResult> {
  const { userId } = await requireRole('parent')
  let childId: string
  try {
    const result = await linkParentWithCode(userId, input.code)
    if (!result.ok) return { ok: false, message: result.reason }
    childId = result.childId
  } catch (e) {
    console.error(`child not linked: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'Could not link your child. Try again.' }
  }
  redirect(`/p/${childId}`)
}
