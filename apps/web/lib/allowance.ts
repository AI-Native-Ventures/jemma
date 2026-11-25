import type { JemmaDb } from '@jemma/profiling/db'
import { FREE_A_DAY, givesPractice, planOf, type PlanId } from './plans'
import { dayWindow, monthWindow, zoneOf } from './zones'

// How many practices a learner has left (P161). Without a family plan: 2 a day, the day of the learner's country. With one: the plan's pool of the
// month, shared by every child of the parent who pays (and each child's own side, "My own"). A practice is a `practice.requested` event that did not
// fail, so a practice Jemma could not write is not counted, and "Try again" puts the same event back. Lessons are never counted. Read with the
// service role: the caller has already found the learner the way the learner's screens do.

export type Allowance = {
  kind: 'free' | 'plan'
  limit: number
  used: number
  left: number
  /** When the count starts again: tomorrow at midnight (free) or the first of next month (a plan), in `zone`. */
  resetsAt: Date
  zone: string
  plan: PlanId | null
  /** The parent whose plan it is, for a plan. */
  payer: string | null
  /** The learner's approved parents: the ones a learner can ask for a plan. */
  parents: { id: string; name: string }[]
}

type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>
async function rows<T>(q: Res<T[]>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** The ids of these learners and of their own sides ("My own" twins). */
async function withTwins(admin: JemmaDb, mainIds: string[]): Promise<string[]> {
  if (mainIds.length === 0) return []
  const twins = await rows(admin.from('children').select('id').in('private_of', mainIds))
  return [...new Set([...mainIds, ...twins.map((t) => t.id)])]
}

/** Practices of these learners since `from` that did not fail. */
export async function practicesSince(admin: JemmaDb, childIds: string[], from: Date): Promise<number> {
  if (childIds.length === 0) return 0
  const { count, error } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'practice.requested')
    .in('payload->>childId', childIds)
    .gte('created_at', from.toISOString())
    .neq('status', 'failed')
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** The plan that gives a parent's family practice now, if any: the newest of theirs that does. */
export async function planOfParent(admin: JemmaDb, parentId: string, now: Date) {
  const subs = await rows(
    admin
      .from('subscriptions')
      .select('id, plan, status, period_end, grace_until, next_plan, price_usd, amount_zar_cents, token, cancelled_at, follows, created_at, country')
      .eq('parent_id', parentId)
      .in('status', ['active', 'cancelled', 'failed'])
      .order('created_at', { ascending: false }),
  )
  return subs.find((s) => givesPractice(s, now)) ?? null
}

/**
 * P162: the family's country for prices: the country the parent picked at sign-up, else the country of their first child, else the one Cloudflare saw
 * (`seen`), else none (the price of South Africa and every other country).
 */
export async function familyCountry(admin: JemmaDb, parentId: string, seen: string | null = null): Promise<string | null> {
  const { data: facts } = await admin.from('signups').select('country').eq('user_id', parentId).maybeSingle()
  if (facts?.country) return facts.country
  const { data: links } = await admin.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved').limit(1)
  const childId = links?.[0]?.child_id
  if (childId) {
    const { data: child } = await admin.from('children').select('schools(country)').eq('id', childId).maybeSingle()
    const country = (child?.schools as { country?: string } | null)?.country
    if (country) return country
  }
  return seen
}

/** The children of a parent (approved links) and their own sides. */
export async function familyChildIds(admin: JemmaDb, parentId: string): Promise<string[]> {
  const links = await rows(admin.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved'))
  return withTwins(admin, [...new Set(links.map((l) => l.child_id))])
}

/** What a learner (`childId`: the school row or the own side) has left now. */
export async function allowanceFor(admin: JemmaDb, childId: string, now: Date = new Date()): Promise<Allowance> {
  const { data: child } = await admin.from('children').select('id, private_of, school_id').eq('id', childId).maybeSingle()
  if (!child) throw new Error('no such learner')
  const mainId = child.private_of ?? child.id
  const { data: school } = await admin.from('schools').select('country').eq('id', child.school_id).maybeSingle()
  const zone = zoneOf(school?.country)
  const links = await rows(admin.from('parent_links').select('parent_id').eq('child_id', mainId).eq('status', 'approved'))
  const parentIds = [...new Set(links.map((l) => l.parent_id))]
  const profiles = parentIds.length ? await rows(admin.from('profiles').select('user_id, display_name').in('user_id', parentIds)) : []
  const parents = parentIds.map((id) => ({ id, name: profiles.find((p) => p.user_id === id)?.display_name?.split(/\s+/)[0] ?? 'your parent' }))

  for (const parentId of parentIds) {
    const sub = await planOfParent(admin, parentId, now)
    const plan = sub ? planOf(sub.plan) : null
    if (!sub || !plan) continue
    const win = monthWindow(now, zone)
    const used = await practicesSince(admin, await familyChildIds(admin, parentId), win.from)
    return { kind: 'plan', limit: plan.perMonth, used, left: Math.max(0, plan.perMonth - used), resetsAt: win.to, zone, plan: plan.id, payer: parentId, parents }
  }
  const win = dayWindow(now, zone)
  const used = await practicesSince(admin, await withTwins(admin, [mainId]), win.from)
  return { kind: 'free', limit: FREE_A_DAY, used, left: Math.max(0, FREE_A_DAY - used), resetsAt: win.to, zone, plan: null, payer: null, parents }
}

/** The family's pool this month for a parent's plan, and each child's part of it (for "Plans and payments"). */
export async function familyUse(admin: JemmaDb, parentId: string, zoneCountry: string | null, now: Date = new Date()) {
  const zone = zoneOf(zoneCountry)
  const win = monthWindow(now, zone)
  const links = await rows(admin.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved'))
  const mainIds = [...new Set(links.map((l) => l.child_id))]
  const kids = mainIds.length ? await rows(admin.from('children').select('id, first_name').in('id', mainIds)) : []
  const each = await Promise.all(kids.map(async (k) => ({ id: k.id, firstName: k.first_name, used: await practicesSince(admin, await withTwins(admin, [k.id]), win.from) })))
  return { from: win.from, resetsAt: win.to, zone, children: each, used: each.reduce((a, c) => a + c.used, 0) }
}
