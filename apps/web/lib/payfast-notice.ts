import type { Json, JemmaDb } from '@jemma/profiling/db'
import { amountMatches, subscriptionCall, type PayfastEnv } from './payfast'
import { GRACE_DAYS, planOf, priceUsdFor, yearAfter } from './plans'

// What Jemma does with a payment notice from PayFast (P161), after the route has checked it (signature, PayFast's "VALID"). Written with the service
// role. A notice can come twice: a payment PayFast already told Jemma about (its pf_payment_id) is not written again.
//   sub_<id>  a plan's payment: the first one starts the paid year, a later one is the renewal (a smaller plan chosen for it starts then).
//   up_<id>   the difference for a bigger plan: the bigger plan starts now, and PayFast is told the new yearly amount.
// payment_status COMPLETE is a payment; CANCELLED is a subscription PayFast cancelled (the parent did it on PayFast, or PayFast after failed
// payments): it runs to the end of its year. Anything else is a payment that failed: the plan works for 7 more days while the card is changed.

export type NoticeResult = { done: string } | { ignored: string }

const DAY = 24 * 60 * 60 * 1000
const KEEP_OUT = new Set(['signature', 'name_first', 'name_last', 'email_address', 'cell_number'])

const cents = (v: string | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** The rand of `usd` at the rate a plan was bought at, rounded to R10. */
export const sameRate = (sub: { amount_zar_cents: number; price_usd: number }, usd: number) => Math.round((sub.amount_zar_cents / sub.price_usd) * usd / 10 / 100) * 10 * 100

export async function handleNotice(admin: JemmaDb, env: PayfastEnv, entries: [string, string][], now: Date = new Date()): Promise<NoticeResult> {
  const get = (k: string) => entries.find(([key]) => key === k)?.[1]
  const ref = get('m_payment_id') ?? ''
  const status = (get('payment_status') ?? '').toUpperCase()
  const pfId = get('pf_payment_id') ?? null
  const token = get('token') || null
  const m = /^(sub|up)_([0-9a-f-]{36})$/.exec(ref)
  if (!m) return { ignored: `unknown payment number ${ref}` }
  const [, kind, subId] = m as unknown as [string, 'sub' | 'up', string]
  const { data: sub } = await admin.from('subscriptions').select('*').eq('id', subId).maybeSingle()
  if (!sub) return { ignored: `no plan ${subId}` }

  if (pfId && status === 'COMPLETE') {
    const { data: seen } = await admin.from('payments').select('id').eq('pf_payment_id', pfId).limit(1)
    if (seen && seen.length > 0) return { ignored: `payment ${pfId} already written` }
  }
  const details = Object.fromEntries(entries.filter(([k]) => !KEEP_OUT.has(k))) as Json
  const payment = {
    subscription_id: sub.id,
    parent_id: sub.parent_id,
    pf_payment_id: pfId,
    m_payment_id: ref,
    amount_gross_zar_cents: cents(get('amount_gross')),
    amount_fee_zar_cents: cents(get('amount_fee')) === null ? null : Math.abs(cents(get('amount_fee'))!),
    amount_net_zar_cents: cents(get('amount_net')),
    details,
  }
  const save = async (fields: Record<string, unknown>) => {
    const { error } = await admin.from('subscriptions').update({ ...fields, updated_at: now.toISOString() }).eq('id', sub.id)
    if (error) throw new Error(`plan ${sub.id} not saved: ${error.message}`)
  }
  const record = async (row: Record<string, unknown>) => {
    const { error } = await admin.from('payments').insert({ ...payment, ...row } as never)
    if (error) throw new Error(`payment not saved: ${error.message}`)
  }

  if (kind === 'up') {
    if (status !== 'COMPLETE') return { ignored: `upgrade ${status}` }
    if (!sub.upgrade_plan || !sub.upgrade_zar_cents || !amountMatches(get('amount_gross'), sub.upgrade_zar_cents)) return { ignored: 'upgrade amount does not match' }
    const plan = planOf(sub.upgrade_plan)!
    const price = priceUsdFor(plan.id, sub.country)
    const yearly = sameRate(sub, price)
    await record({ kind: 'upgrade', status: 'paid', price_usd: sub.upgrade_usd, paid_at: now.toISOString() })
    await save({ plan: plan.id, price_usd: price, amount_zar_cents: yearly, next_plan: null, upgrade_plan: null, upgrade_usd: null, upgrade_zar_cents: null })
    if (sub.token) {
      const res = await subscriptionCall(env, sub.token, { kind: 'update', amountZarCents: yearly }, now)
      if (!res.ok) console.error(`PayFast did not take the new yearly amount of plan ${sub.id}: ${res.status} ${res.text}`)
    }
    return { done: `upgrade of ${sub.id} to ${plan.id}` }
  }

  if (status === 'COMPLETE') {
    if (!amountMatches(get('amount_gross'), sub.amount_zar_cents)) return { ignored: `amount ${get('amount_gross')} is not ${sub.amount_zar_cents / 100}` }
    if (sub.status === 'pending') {
      let start = now
      if (sub.follows) {
        const { data: before } = await admin.from('subscriptions').select('period_end').eq('id', sub.follows).maybeSingle()
        if (before?.period_end && Date.parse(before.period_end) > now.getTime()) start = new Date(before.period_end)
      }
      await record({ kind: 'plan', status: 'paid', price_usd: sub.price_usd, paid_at: now.toISOString() })
      await save({ status: 'active', token: token ?? sub.token, period_end: yearAfter(start).toISOString(), grace_until: null })
      return { done: `plan ${sub.id} started` }
    }
    const next = sub.next_plan ? planOf(sub.next_plan) : null
    const from = sub.period_end ? new Date(sub.period_end) : now
    const nextPrice = next ? priceUsdFor(next.id, sub.country) : sub.price_usd
    await record({ kind: 'renewal', status: 'paid', price_usd: nextPrice, paid_at: now.toISOString() })
    await save({
      status: sub.status === 'cancelled' ? 'cancelled' : 'active',
      token: token ?? sub.token,
      period_end: yearAfter(from).toISOString(),
      grace_until: null,
      ...(next ? { plan: next.id, price_usd: nextPrice, next_plan: null } : {}),
    })
    return { done: `plan ${sub.id} renewed` }
  }

  if (status === 'CANCELLED') {
    if (sub.status === 'pending') {
      await save({ status: 'ended', ended_at: now.toISOString() })
      return { done: `plan ${sub.id} never started` }
    }
    if (sub.status !== 'cancelled' && sub.status !== 'ended') await save({ status: 'cancelled', cancelled_at: now.toISOString() })
    return { done: `plan ${sub.id} cancelled on PayFast` }
  }

  await record({ kind: sub.status === 'pending' ? 'plan' : 'renewal', status: 'failed', price_usd: sub.price_usd })
  if (sub.status === 'active') await save({ status: 'failed', grace_until: new Date(now.getTime() + GRACE_DAYS * DAY).toISOString() })
  return { done: `payment of plan ${sub.id} failed (${status || 'no status'})` }
}
