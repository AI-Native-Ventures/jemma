'use server'

import { allowanceFor } from '@/lib/allowance'
import { myChild } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export type AskResult = { ok: true; told: string[] } | { ok: false; message: string }

const HOURS_BETWEEN_ASKS = 20

/**
 * "Ask Grace for a plan" (P161), on the card a learner sees when today's practices (or the family's month) are used: a note in the app for each of
 * the learner's approved parents, with the plans one tap away. A parent who was asked in the last 20 hours is not asked again, so tapping twice
 * sends nothing new; the answer still names them. Never throws to the screen.
 */
export async function askForPlan(): Promise<AskResult> {
  try {
    const { child } = await myChild()
    const admin = createSupabaseAdmin()
    const a = await allowanceFor(admin, child.id)
    if (a.parents.length === 0) return { ok: false, message: 'No parent is linked yet. Give a parent your code on Me.' }
    const { data: me } = await admin.from('children').select('first_name, private_of').eq('id', child.id).single()
    let name = me?.first_name ?? 'Your child'
    if (me?.private_of) {
      const { data: main } = await admin.from('children').select('first_name').eq('id', me.private_of).maybeSingle()
      name = main?.first_name ?? name
    }
    const title = a.kind === 'plan' ? `${name} wants a bigger plan` : `${name} wants more practice`
    const body =
      a.kind === 'plan'
        ? `Your family's ${a.limit} practices for this month are used. ${name} asked for more.`
        : `${name} did today's 2 free practices and asked you for a plan.`
    const since = new Date(Date.now() - HOURS_BETWEEN_ASKS * 60 * 60 * 1000).toISOString()
    for (const p of a.parents) {
      const { data: asked } = await admin.from('notifications').select('id').eq('user_id', p.id).eq('title', title).gte('created_at', since).limit(1)
      if (asked && asked.length > 0) continue
      const { error } = await admin.from('notifications').insert({ user_id: p.id, title, body, href: '/p/plans' })
      if (error) throw new Error(error.message)
    }
    return { ok: true, told: a.parents.map((p) => p.name) }
  } catch (e) {
    console.error(`ask for a plan: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'Something went wrong. Try again.' }
  }
}
