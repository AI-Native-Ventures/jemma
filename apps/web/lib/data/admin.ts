import type { JemmaDb } from '@jemma/profiling/db'
import { FEEDBACK_BUCKET } from '@/lib/feedback'
import { givesPractice, planOf } from '@/lib/plans'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// The reads of the owner's admin pages (P161), with the service role, after `requireAdmin`. Counts and short lists only: a child's work is never read
// here. A hosted database gives at most 1000 rows to one read, so lists are read a page at a time.

const PAGE = 1000

async function all<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

const dayKey = (iso: string) => iso.slice(0, 10)

export type Overview = {
  people: { total: number; learners: number; parents: number; teachers: number }
  joined: { total: number; learners: number; parents: number; teachers: number }
  byDay: { day: string; learners: number; parents: number; teachers: number }[]
  practising7: number
  practices: number
  paying: { families: number; learners: number; byPlan: Record<string, number>; cancelled: number }
  money: { usd: number; zarCents: number; feeZarCents: number; refunded: number; payments: number }
  funnel: { newLearners: number; practised: number; usedFree: number; inPayingFamily: number; startedToPay: number; paid: number }
  sources: { source: string; signups: number; learners: number; parents: number; paying: number; usd: number }[]
  ai: { tokens: number; calls: number }
  failedToday: number
  help: { kind: string; text: string; at: string; role: string | null }[]
}

/** Everything on the overview, for people who joined from `from` on (and the country, when one is picked). */
export async function getOverview(from: Date, country: string | null, now: Date = new Date()): Promise<Overview> {
  const db = createSupabaseAdmin()
  const signups = await all((a, b) => db.from('signups').select('user_id, country, source, created_at').range(a, b))
  const countryOf = new Map(signups.map((s) => [s.user_id, s.country]))
  const keep = (userId: string) => !country || countryOf.get(userId) === country
  const profiles = (await all((a, b) => db.from('profiles').select('user_id, role, created_at').range(a, b))).filter((p) => keep(p.user_id))
  const count = (rows: { role: string }[]) => ({
    total: rows.length,
    learners: rows.filter((r) => r.role === 'learner').length,
    parents: rows.filter((r) => r.role === 'parent').length,
    teachers: rows.filter((r) => r.role === 'teacher').length,
  })
  const joinedRows = profiles.filter((p) => p.created_at >= from.toISOString())
  const days = new Map<string, { learners: number; parents: number; teachers: number }>()
  for (let t = from.getTime(); t <= now.getTime(); t += 24 * 60 * 60 * 1000) days.set(new Date(t).toISOString().slice(0, 10), { learners: 0, parents: 0, teachers: 0 })
  for (const p of joinedRows) {
    const d = days.get(dayKey(p.created_at))
    if (d) d[(p.role + 's') as 'learners' | 'parents' | 'teachers'] += 1
  }

  // Practices: the events that asked for one and did not fail.
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const since = from < weekAgo ? from : weekAgo
  const events = await all((a, b) =>
    db.from('events').select('payload, created_at, status').eq('type', 'practice.requested').neq('status', 'failed').gte('created_at', since.toISOString()).range(a, b),
  )
  const childOf = (e: { payload: unknown }) => String((e.payload as { childId?: string } | null)?.childId ?? '')
  const practising7 = new Set(events.filter((e) => e.created_at >= weekAgo.toISOString()).map(childOf)).size
  const practices = events.filter((e) => e.created_at >= from.toISOString()).length

  // Plans that give practice now, and the children of their families.
  const subs = await all((a, b) => db.from('subscriptions').select('id, parent_id, plan, status, period_end, grace_until, created_at').range(a, b))
  const live = subs.filter((s) => givesPractice(s, now) && keep(s.parent_id))
  const links = await all((a, b) => db.from('parent_links').select('parent_id, child_id').eq('status', 'approved').range(a, b))
  const payingParents = new Set(live.map((s) => s.parent_id))
  const coveredChildren = new Set(links.filter((l) => payingParents.has(l.parent_id)).map((l) => l.child_id))
  const byPlan: Record<string, number> = { light: 0, regular: 0, heavy: 0 }
  for (const s of live) byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1

  const pays = await all((a, b) => db.from('payments').select('parent_id, status, price_usd, amount_gross_zar_cents, amount_fee_zar_cents, subscription_id, created_at').gte('created_at', from.toISOString()).range(a, b))
  const paid = pays.filter((p) => p.status === 'paid' && (!p.parent_id || keep(p.parent_id)))

  // Learners who joined in the range: children's own rows (not their "My own" sides), outside the demo copies.
  const kids = (await all((a, b) => db.from('children').select('id, private_of, created_at, school_id').gte('created_at', from.toISOString()).is('private_of', null).range(a, b)))
  const sandboxes = new Set((await all((a, b) => db.from('schools').select('id').not('sandbox_id', 'is', null).range(a, b))).map((s) => s.id))
  const newKids = kids.filter((k) => !sandboxes.has(k.school_id))
  const perChildDay = new Map<string, number>()
  for (const e of events) perChildDay.set(`${childOf(e)}|${dayKey(e.created_at)}`, (perChildDay.get(`${childOf(e)}|${dayKey(e.created_at)}`) ?? 0) + 1)
  const practisedIds = new Set(events.map(childOf))
  const usedFreeIds = new Set([...perChildDay.entries()].filter(([, n]) => n >= 2).map(([k]) => k.split('|')[0]!))
  const newSubs = subs.filter((s) => s.created_at >= from.toISOString() && keep(s.parent_id))
  const paidSubs = new Set(paid.map((p) => p.subscription_id))

  // Where sign-ups came from: the tags of their link.
  const roleOf = new Map(profiles.map((p) => [p.user_id, p.role]))
  const usdBy = new Map<string, number>()
  for (const p of paid) if (p.parent_id) usdBy.set(p.parent_id, (usdBy.get(p.parent_id) ?? 0) + (p.price_usd ?? 0))
  const bySource = new Map<string, Overview['sources'][number]>()
  for (const s of signups) {
    if (s.created_at < from.toISOString() || !keep(s.user_id)) continue
    const key = s.source || 'No tag'
    const row = bySource.get(key) ?? { source: key, signups: 0, learners: 0, parents: 0, paying: 0, usd: 0 }
    row.signups += 1
    if (roleOf.get(s.user_id) === 'learner') row.learners += 1
    if (roleOf.get(s.user_id) === 'parent') row.parents += 1
    if (payingParents.has(s.user_id)) row.paying += 1
    row.usd += usdBy.get(s.user_id) ?? 0
    bySource.set(key, row)
  }

  const usage = await all((a, b) => db.from('ai_usage').select('total_tokens').gte('created_at', from.toISOString()).range(a, b))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const { count: failedToday } = await db.from('events').select('id', { count: 'exact', head: true }).eq('type', 'practice.requested').eq('status', 'failed').gte('created_at', today)

  return {
    people: count(profiles),
    joined: count(joinedRows),
    byDay: [...days.entries()].map(([day, v]) => ({ day, ...v })),
    practising7,
    practices,
    paying: { families: payingParents.size, learners: coveredChildren.size, byPlan, cancelled: subs.filter((s) => s.status === 'cancelled' && s.created_at >= from.toISOString()).length },
    money: {
      usd: paid.reduce((a, p) => a + (p.price_usd ?? 0), 0),
      zarCents: paid.reduce((a, p) => a + (p.amount_gross_zar_cents ?? 0), 0),
      feeZarCents: paid.reduce((a, p) => a + (p.amount_fee_zar_cents ?? 0), 0),
      refunded: pays.filter((p) => p.status === 'refunded').length,
      payments: paid.length,
    },
    funnel: {
      newLearners: newKids.length,
      practised: newKids.filter((k) => practisedIds.has(k.id)).length,
      usedFree: newKids.filter((k) => usedFreeIds.has(k.id)).length,
      inPayingFamily: newKids.filter((k) => coveredChildren.has(k.id)).length,
      startedToPay: newSubs.length,
      paid: newSubs.filter((s) => paidSubs.has(s.id)).length,
    },
    sources: [...bySource.values()].sort((a, b) => b.signups - a.signups),
    ai: { tokens: usage.reduce((a, u) => a + (u.total_tokens ?? 0), 0), calls: usage.length },
    failedToday: failedToday ?? 0,
    help: await latestHelp(db, 4),
  }
}

/** The newest help messages (the files of the `feedback` bucket, one folder a day), newest first. */
export async function latestHelp(db: JemmaDb, max = 50, days = 14): Promise<{ kind: string; text: string; at: string; role: string | null; replyTo?: string | null }[]> {
  const out: { kind: string; text: string; at: string; role: string | null; replyTo?: string | null }[] = []
  const store = db.storage.from(FEEDBACK_BUCKET)
  for (let i = 0; i < days && out.length < max; i += 1) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: files } = await store.list(day, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    for (const f of files ?? []) {
      if (out.length >= max) break
      const { data: blob } = await store.download(`${day}/${f.name}`)
      if (!blob) continue
      try {
        const m = JSON.parse(await blob.text()) as { kind?: string; text?: string; sent_at?: string; role?: string | null; reply_to?: string | null }
        out.push({ kind: m.kind === 'problem' ? 'Problem' : m.text?.startsWith('Please delete my') ? 'Delete account' : 'Message', text: m.text ?? '', at: m.sent_at ?? day, role: m.role ?? null, replyTo: m.reply_to ?? null })
      } catch {
        /* a file that is not a message is left out */
      }
    }
  }
  return out
}

export type PersonRow = { userId: string; name: string; role: string; country: string | null; joined: string; source: string | null; plan: string | null }

/** People, newest first, 50 at a time; `q` finds a name. */
export async function getPeople(q: string, role: string | null, page = 0): Promise<{ rows: PersonRow[]; total: number }> {
  const db = createSupabaseAdmin()
  let query = db.from('profiles').select('user_id, role, display_name, created_at', { count: 'exact' }).order('created_at', { ascending: false })
  if (role === 'learner' || role === 'parent' || role === 'teacher') query = query.eq('role', role)
  if (q.trim()) query = query.ilike('display_name', `%${q.trim().replace(/[%_,()]/g, ' ')}%`)
  const { data, count } = await query.range(page * 50, page * 50 + 49)
  const ids = (data ?? []).map((p) => p.user_id)
  const { data: sign } = ids.length ? await db.from('signups').select('user_id, country, source').in('user_id', ids) : { data: [] }
  const { data: subs } = ids.length ? await db.from('subscriptions').select('parent_id, plan, status, period_end, grace_until').in('parent_id', ids) : { data: [] }
  const now = new Date()
  return {
    total: count ?? 0,
    rows: (data ?? []).map((p) => {
      const s = (subs ?? []).find((x) => x.parent_id === p.user_id && givesPractice(x, now))
      const g = (sign ?? []).find((x) => x.user_id === p.user_id)
      return { userId: p.user_id, name: shortName(p.display_name), role: p.role, country: g?.country ?? null, joined: p.created_at, source: g?.source ?? null, plan: s ? (planOf(s.plan)?.name ?? null) : null }
    }),
  }
}

/** "Grace Miller" as "Grace M.": the list shows short names. */
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/)
  return rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : (first ?? '')
}

/** One person, for the panel beside the list. */
export async function getPerson(userId: string) {
  const db = createSupabaseAdmin()
  const { data: profile } = await db.from('profiles').select('user_id, role, display_name, created_at').eq('user_id', userId).maybeSingle()
  if (!profile) return null
  const { data: auth } = await db.auth.admin.getUserById(userId)
  const { data: sign } = await db.from('signups').select('*').eq('user_id', userId).maybeSingle()
  const { data: links } = await db.from('parent_links').select('child_id').eq('parent_id', userId).eq('status', 'approved')
  const ids = (links ?? []).map((l) => l.child_id)
  const { data: kids } = ids.length ? await db.from('children').select('id, first_name, grade').in('id', ids) : { data: [] }
  const { data: subs } = await db.from('subscriptions').select('id, plan, status, period_end, grace_until, token, created_at').eq('parent_id', userId).order('created_at', { ascending: false })
  const { data: pays } = await db.from('payments').select('id, created_at, status, kind, price_usd, amount_gross_zar_cents').eq('parent_id', userId).order('created_at', { ascending: false }).limit(10)
  const live = (subs ?? []).find((s) => givesPractice(s, new Date())) ?? null
  return {
    profile,
    email: auth.user?.email ?? null,
    lastSeen: auth.user?.last_sign_in_at ?? null,
    signup: sign,
    children: kids ?? [],
    plan: live ? { id: live.id, name: planOf(live.plan)?.name ?? live.plan, status: live.status, periodEnd: live.period_end, canCancel: Boolean(live.token) && live.status !== 'cancelled' } : null,
    payments: pays ?? [],
  }
}

/** The latest payments, and the plans cancelled lately. */
export async function getPayments(from: Date) {
  const db = createSupabaseAdmin()
  const { data: pays } = await db.from('payments').select('*').order('created_at', { ascending: false }).limit(50)
  const parentIds = [...new Set((pays ?? []).map((p) => p.parent_id).filter((x): x is string => Boolean(x)))]
  const { data: names } = parentIds.length ? await db.from('profiles').select('user_id, display_name').in('user_id', parentIds) : { data: [] }
  const subIds = [...new Set((pays ?? []).map((p) => p.subscription_id).filter((x): x is string => Boolean(x)))]
  const { data: subs } = subIds.length ? await db.from('subscriptions').select('id, plan').in('id', subIds) : { data: [] }
  const { data: cancelled } = await db.from('subscriptions').select('id, parent_id, plan, period_end, cancelled_at').eq('status', 'cancelled').order('cancelled_at', { ascending: false }).limit(10)
  const cIds = [...new Set((cancelled ?? []).map((c) => c.parent_id))]
  const { data: cNames } = cIds.length ? await db.from('profiles').select('user_id, display_name').in('user_id', cIds) : { data: [] }
  const all = await db.from('subscriptions').select('status, period_end, grace_until')
  const now = new Date()
  const inRange = (pays ?? []).filter((p) => p.created_at >= from.toISOString())
  return {
    paidUsd: inRange.filter((p) => p.status === 'paid').reduce((a, p) => a + (p.price_usd ?? 0), 0),
    paidCount: inRange.filter((p) => p.status === 'paid').length,
    running: (all.data ?? []).filter((s) => givesPractice(s, now)).length,
    failed: inRange.filter((p) => p.status === 'failed').length,
    cancelledCount: (cancelled ?? []).filter((c) => (c.cancelled_at ?? '') >= from.toISOString()).length,
    rows: (pays ?? []).map((p) => ({
      id: p.id,
      at: p.paid_at ?? p.created_at,
      who: shortName(names?.find((n) => n.user_id === p.parent_id)?.display_name ?? 'Deleted account'),
      plan: planOf(subs?.find((s) => s.id === p.subscription_id)?.plan)?.name ?? '',
      kind: p.kind,
      usd: p.price_usd,
      zarCents: p.amount_gross_zar_cents,
      feeZarCents: p.amount_fee_zar_cents,
      status: p.status,
      pfId: p.pf_payment_id,
    })),
    cancelled: (cancelled ?? []).map((c) => ({ id: c.id, who: shortName(cNames?.find((n) => n.user_id === c.parent_id)?.display_name ?? 'Deleted account'), plan: planOf(c.plan)?.name ?? c.plan, until: c.period_end })),
  }
}
