import { allowanceFor, familyCountry, familyUse, planOfParent } from '@/lib/allowance'
import { seenCountry } from '@/lib/request-facts'
import { payfastEnv } from '@/lib/payfast'
import { planOf } from '@/lib/plans'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { shortDate } from '@/lib/zones'
import { myChild } from './p27'

// The reads of family plans (P161) for the screens: the learner's card when no practice is left, and the parent's "Plans and payments".

/** The props of the learner's card when no practice is left, or null while practice is left (or plans are not open, or the count fails). */
export async function getMyLimit(): Promise<{ kind: 'free' | 'plan'; limit: number; resets: string; parent: string | null; canAsk: boolean } | null> {
  if (!payfastEnv()) return null
  try {
    const { child } = await myChild()
    const a = await allowanceFor(createSupabaseAdmin(), child.id)
    if (a.left > 0) return null
    return { kind: a.kind, limit: a.limit, resets: shortDate(a.resetsAt, a.zone), parent: a.parents[0]?.name ?? null, canAsk: a.plan !== 'heavy' }
  } catch (e) {
    console.error(`learner limit not read: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

export type FamilyPlan = {
  open: boolean
  plan: {
    id: string
    planId: string
    name: string
    perMonth: number
    priceUsd: number
    amountZarCents: number
    status: string
    periodEnd: string | null
    graceUntil: string | null
    nextPlan: string | null
    hasToken: boolean
    country: string | null
  } | null
  use: { used: number; resetsAt: Date; zone: string; children: { id: string; firstName: string; used: number }[] } | null
  payments: { id: string; createdAt: string; paidAt: string | null; status: string; kind: string; priceUsd: number | null; zarCents: number | null; planName: string }[]
  children: { id: string; firstName: string }[]
  country: string | null
  /** P162: the country prices follow (the plan's own, else the family's). */
  priceCountry: string | null
}

/** Everything "Plans and payments" shows for a parent. */
export async function getFamilyPlan(parentId: string, now: Date = new Date()): Promise<FamilyPlan> {
  const admin = createSupabaseAdmin()
  const { data: links } = await admin.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved')
  const ids = [...new Set((links ?? []).map((l) => l.child_id))]
  const { data: kids } = ids.length ? await admin.from('children').select('id, first_name, school_id').in('id', ids) : { data: [] }
  const schoolIds = [...new Set((kids ?? []).map((k) => k.school_id))]
  const { data: schools } = schoolIds.length ? await admin.from('schools').select('id, country').in('id', schoolIds) : { data: [] }
  const country = schools?.[0]?.country ?? null
  const sub = await planOfParent(admin, parentId, now)
  const plan = sub ? planOf(sub.plan) : null
  const use = sub && plan ? await familyUse(admin, parentId, country, now) : null
  const { data: pays } = await admin
    .from('payments')
    .select('id, created_at, paid_at, status, kind, price_usd, amount_gross_zar_cents, subscription_id')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })
    .limit(20)
  const subIds = [...new Set((pays ?? []).map((p) => p.subscription_id).filter((x): x is string => Boolean(x)))]
  const { data: subs } = subIds.length ? await admin.from('subscriptions').select('id, plan').in('id', subIds) : { data: [] }
  return {
    open: payfastEnv() !== null,
    plan:
      sub && plan
        ? {
            id: sub.id,
            planId: plan.id,
            name: plan.name,
            perMonth: plan.perMonth,
            priceUsd: sub.price_usd,
            amountZarCents: sub.amount_zar_cents,
            status: sub.status,
            periodEnd: sub.period_end,
            graceUntil: sub.grace_until,
            nextPlan: sub.next_plan,
            hasToken: Boolean(sub.token),
            country: sub.country ?? null,
          }
        : null,
    use: use ? { used: use.used, resetsAt: use.resetsAt, zone: use.zone, children: use.children } : null,
    payments: (pays ?? []).map((p) => ({
      id: p.id,
      createdAt: p.created_at,
      paidAt: p.paid_at,
      status: p.status,
      kind: p.kind,
      priceUsd: p.price_usd,
      zarCents: p.amount_gross_zar_cents,
      planName: planOf(subs?.find((s) => s.id === p.subscription_id)?.plan)?.name ?? 'Plan',
    })),
    children: (kids ?? []).map((k) => ({ id: k.id, firstName: k.first_name })),
    country,
    priceCountry: sub?.country ?? (await familyCountry(admin, parentId, await seenCountry())),
  }
}
