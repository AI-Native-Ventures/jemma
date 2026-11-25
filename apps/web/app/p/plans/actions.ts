'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { familyCountry, planOfParent } from '@/lib/allowance'
import { seenCountry } from '@/lib/request-facts'
import { checkoutFields, payfastEnv, processUrl, subscriptionCall } from '@/lib/payfast'
import { sameRate } from '@/lib/payfast-notice'
import { isBigger, isPlanId, payfastAmount, planOf, priceUsdFor, randPerDollar, upgradeUsd, yearAfter, zarCentsOf, type PlanId } from '@/lib/plans'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

// The parent's plan actions (P161): go to PayFast for a new plan, a bigger plan (the difference now) or a plan again after cancelling; a smaller plan
// from the next payment; cancel. Every one checks the parent first and writes with the service role. PayFast's settings are Worker secrets.

export type CheckoutResult = { ok: true; action: string; fields: [string, string][] } | { ok: false; message: string }
export type PlanResult = { ok: true } | { ok: false; message: string }

const NOT_OPEN = 'Plans open soon. For now, practice is free.'
const fail = (message: string) => ({ ok: false as const, message })
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'jemma.ainative.ventures'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The form that sends the parent to PayFast. `plan` is the plan the parent picked. With no plan now: a new yearly plan, paid now and each year.
 * With a cancelled plan still running: the same, but its paid year starts where the old one ends ("Turn it back on"). With a running plan and a
 * bigger one picked: the difference for the rest of the year, once; the bigger plan starts when it is paid.
 */
export async function startCheckout(input: { plan: string }): Promise<CheckoutResult> {
  try {
    const { userId } = await requireRole('parent')
    const env = payfastEnv()
    if (!env) return fail(NOT_OPEN)
    if (!isPlanId(input.plan)) return fail('Pick a plan.')
    const plan = planOf(input.plan)!
    const admin = createSupabaseAdmin()
    const now = new Date()
    const current = await planOfParent(admin, userId, now)
    const { data: auth } = await (await createSupabaseServer()).auth.getUser()
    const base = await origin()
    const urls = { notifyUrl: `${base}/api/payfast/notify` }

    if (current && current.status !== 'cancelled') {
      if (!isBigger(plan.id, current.plan as PlanId)) return fail('You have this plan or a bigger one. A smaller plan starts at your next payment.')
      if (!current.token || !current.period_end) return fail('Your plan is still starting. Try again in a minute.')
      const usd = upgradeUsd(current.plan as PlanId, plan.id, new Date(current.period_end), now, current.country)
      const zar = sameRate(current, usd)
      const { error } = await admin.from('subscriptions').update({ upgrade_plan: plan.id, upgrade_usd: usd, upgrade_zar_cents: zar, updated_at: now.toISOString() }).eq('id', current.id)
      if (error) throw new Error(error.message)
      const fields = checkoutFields(env, {
        ...urls,
        returnUrl: `${base}/p/plans/done?ref=${current.id}`,
        cancelUrl: `${base}/p/plans/stopped?up=${current.id}`,
        paymentId: `up_${current.id}`,
        amount: payfastAmount(zar),
        itemName: `Jemma ${plan.name} for the rest of the year`,
        itemDescription: `${plan.perMonth} practices a month for your family`,
        email: auth.user?.email ?? null,
      })
      return { ok: true, action: processUrl(env.sandbox), fields }
    }

    const country = await familyCountry(admin, userId, await seenCountry())
    const price = priceUsdFor(plan.id, country)
    const zar = zarCentsOf(price, randPerDollar())
    const after = current?.status === 'cancelled' && current.period_end ? new Date(current.period_end) : now
    const { data: row, error } = await admin
      .from('subscriptions')
      .insert({ parent_id: userId, plan: plan.id, status: 'pending', price_usd: price, amount_zar_cents: zar, country, follows: current?.status === 'cancelled' ? current.id : null })
      .select('id')
      .single()
    if (error || !row) throw new Error(error?.message ?? 'no plan row')
    const fields = checkoutFields(env, {
      ...urls,
      returnUrl: `${base}/p/plans/done?ref=${row.id}`,
      cancelUrl: `${base}/p/plans/stopped?ref=${row.id}`,
      paymentId: `sub_${row.id}`,
      amount: payfastAmount(zar),
      itemName: `Jemma ${plan.name}, one year`,
      itemDescription: `${plan.perMonth} practices a month for your family. Renews each year until you cancel.`,
      email: auth.user?.email ?? null,
      subscription: { recurringAmount: payfastAmount(zar), billingDate: ymd(yearAfter(after)) },
    })
    return { ok: true, action: processUrl(env.sandbox), fields }
  } catch (e) {
    console.error(`checkout not started: ${reasonOf(e)}`)
    return fail('Something went wrong. Try again.')
  }
}

/** A smaller plan: it starts at the next payment, which PayFast is told now (the new yearly amount, at the rate the plan was bought at). */
export async function pickSmaller(input: { plan: string }): Promise<PlanResult> {
  try {
    const { userId } = await requireRole('parent')
    const env = payfastEnv()
    if (!env) return fail(NOT_OPEN)
    if (!isPlanId(input.plan)) return fail('Pick a plan.')
    const admin = createSupabaseAdmin()
    const now = new Date()
    const current = await planOfParent(admin, userId, now)
    if (!current || current.status !== 'active' || !current.token) return fail('There is no running plan to change.')
    if (!isBigger(current.plan as PlanId, input.plan)) return fail('That plan is not smaller.')
    const yearly = sameRate(current, priceUsdFor(input.plan, current.country))
    const res = await subscriptionCall(env, current.token, { kind: 'update', amountZarCents: yearly }, now)
    if (!res.ok) {
      console.error(`PayFast update ${res.status}: ${res.text}`)
      return fail('PayFast did not answer. Try again in a minute.')
    }
    const { error } = await admin.from('subscriptions').update({ next_plan: input.plan, amount_zar_cents: yearly, updated_at: now.toISOString() }).eq('id', current.id)
    if (error) throw new Error(error.message)
    revalidatePath('/p/account/plan')
    return { ok: true }
  } catch (e) {
    console.error(`smaller plan not set: ${reasonOf(e)}`)
    return fail('Something went wrong. Try again.')
  }
}

/** Cancel: PayFast stops the subscription first, so nothing more is charged; then the plan runs to the end of its paid year. */
export async function cancelPlan(): Promise<PlanResult> {
  try {
    const { userId } = await requireRole('parent')
    const env = payfastEnv()
    if (!env) return fail(NOT_OPEN)
    const admin = createSupabaseAdmin()
    const now = new Date()
    const current = await planOfParent(admin, userId, now)
    if (!current || current.status === 'cancelled') return fail('There is no running plan to cancel.')
    if (current.token) {
      const res = await subscriptionCall(env, current.token, { kind: 'cancel' }, now)
      if (!res.ok && res.status !== 404) {
        console.error(`PayFast cancel ${res.status}: ${res.text}`)
        return fail('PayFast did not answer, so the plan is not cancelled yet. Try again in a minute.')
      }
    }
    const { error } = await admin.from('subscriptions').update({ status: 'cancelled', cancelled_at: now.toISOString(), next_plan: null, updated_at: now.toISOString() }).eq('id', current.id)
    if (error) throw new Error(error.message)
    revalidatePath('/p/account/plan')
    return { ok: true }
  } catch (e) {
    console.error(`plan not cancelled: ${reasonOf(e)}`)
    return fail('Something went wrong. Try again.')
  }
}
