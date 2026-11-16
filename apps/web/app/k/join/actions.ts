'use server'

import { revalidatePath } from 'next/cache'
import { requestToJoin } from '@/lib/class-join'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type JoinResult = { ok: true; teacherName: string } | { ok: false; message: string }

/**
 * "Join your school class": the signed-in learner sends the teacher's class code. A request waits for the teacher (it is a Needs you item for them).
 * Never throws to the screen: a refusal is one plain sentence. The learner's own login is the only one used: the code decides the class, nothing else.
 */
export async function sendJoinRequest(code: string): Promise<JoinResult> {
  const { data } = await (await createSupabaseServer()).auth.getUser()
  if (!data.user) return { ok: false, message: 'Sign in first.' }
  try {
    const res = await requestToJoin(createSupabaseAdmin(), { userId: data.user.id, code: String(code ?? '') })
    if (!res.ok) return res
    revalidatePath('/k')
    revalidatePath('/k/me')
    return { ok: true, teacherName: res.teacherName }
  } catch (e) {
    console.error(`class join: could not send the request: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'Could not send the request. Try again.' }
  }
}
