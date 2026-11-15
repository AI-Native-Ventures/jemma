'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { requireRole } from '@/lib/auth'
import { sendGuidance } from '@/lib/send-guidance'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type SendGuidanceActionResult = { ok: true; sent: boolean } | { ok: false; message: string }

/**
 * "Send to family": one tap per learner. The card Jemma wrote goes to the family, and the teacher's name and the time are kept.
 * Sending a card that was already sent answers ok and does nothing more.
 */
export async function sendGuidanceToFamily(classId: string, childId: string): Promise<SendGuidanceActionResult> {
  const { userId } = await requireRole('teacher')
  try {
    const supabase = await createSupabaseServer()
    const done = await sendGuidance({ teacher: supabase as unknown as JemmaDb, admin: createSupabaseAdmin(), userId }, classId, childId)
    if (!done.ok) return done
    revalidatePath(`/t/${classId}`)
    revalidatePath(`/t/${classId}/learners/${childId}`)
    return done
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not send the card.' }
  }
}
