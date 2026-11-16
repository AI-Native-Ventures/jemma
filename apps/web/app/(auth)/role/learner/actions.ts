'use server'

import { redirect } from 'next/navigation'
import { HOMES } from '@/components/blocks/nav'
import { displayNameFor } from '@/lib/display-name'
import { OwnWorkspaceError, startLearnerAlone } from '@/lib/own-workspace'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { COUNTRIES } from '@/lib/subjects'

export type StartLearnerResult = { ok: false; message: string }

/**
 * "Start practising" on the grade screen (P111): a signed-in person with no role yet becomes a learner, on their own. The country must be one the app knows
 * (the same list a school and a parent's form use); the grade is checked by the work itself, which refuses with one plain sentence. The work makes the
 * learner's personal school, ONE child with this login as `user_id`, the CAPS class of the grade with its map, and the learner profile, then the learner goes
 * to /k. Nobody is asked their age and no parent or teacher is asked. A person who already has a role is sent home and nothing is made, so a second tap never
 * makes a second child; a teacher or a parent cannot turn into a learner here. Never throws to the screen except to send the person on.
 */
export async function startLearner(input: { grade: number; country: string }): Promise<StartLearnerResult> {
  const { data } = await (await createSupabaseServer()).auth.getUser()
  if (!data.user) redirect('/sign-in')
  const existing = await createSupabaseAdmin().from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (existing.data) redirect(HOMES[existing.data.role])
  if (!COUNTRIES.some((c) => c.code === input.country)) return { ok: false, message: 'Pick the country.' }
  try {
    await startLearnerAlone({ userId: data.user.id, displayName: displayNameFor(data.user), grade: input.grade, country: input.country })
  } catch (e) {
    if (e instanceof OwnWorkspaceError) return { ok: false, message: e.message }
    console.error(`learner not started: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'Could not start your Jemma. Try again.' }
  }
  redirect(HOMES.learner)
}
