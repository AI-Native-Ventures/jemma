'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { payfastEnv, subscriptionCall } from '@/lib/payfast'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

/** P161: the owner cancels a family's plan (a parent asked by message): PayFast stops it first, then it runs to the end of its paid year. */
export async function adminCancelPlan(form: FormData): Promise<void> {
  await requireAdmin()
  const id = String(form.get('subscription') ?? '')
  const env = payfastEnv()
  const admin = createSupabaseAdmin()
  const { data: sub } = await admin.from('subscriptions').select('id, token, status').eq('id', id).maybeSingle()
  if (!env || !sub || sub.status === 'cancelled' || sub.status === 'ended') return
  if (sub.token) {
    const res = await subscriptionCall(env, sub.token, { kind: 'cancel' })
    if (!res.ok && res.status !== 404) throw new Error(`PayFast did not cancel the plan (${res.status})`)
  }
  await admin.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', sub.id)
  revalidatePath('/admin/people')
}
