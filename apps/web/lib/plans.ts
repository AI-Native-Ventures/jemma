// Family plans (P161): what a plan gives and what it costs. Pure: no database, no clock but the `now` a caller gives.
//
// Every lesson is free on every plan. A plan only adds practice (the model writes new questions, marks them and teaches again). Without a plan a
// learner has 2 practices a day. A plan is on the parent's account, and its practices of a month are one pool that all the parent's children
// share. Prices are by the year, in whole US dollars. PayFast takes the money in rand, so each price also has a rand amount: the dollars at
// `RAND_PER_DOLLAR`, rounded to R10. A plan keeps the rand amount it was bought at; a new rate only changes new plans.

export type PlanId = 'light' | 'regular' | 'heavy'

export type Plan = {
  id: PlanId
  name: string
  /** Whole dollars a year. */
  priceUsd: number
  /** The pool of practices of a month, for the whole family. */
  perMonth: number
  /** About how many a day, for the screens ("about 10 a day"). */
  aDay: number
}

export const FREE_A_DAY = 2

export const PLANS: readonly Plan[] = [
  { id: 'light', name: 'Light', priceUsd: 48, perMonth: 150, aDay: 5 },
  { id: 'regular', name: 'Regular', priceUsd: 96, perMonth: 300, aDay: 10 },
  { id: 'heavy', name: 'Heavy', priceUsd: 192, perMonth: 600, aDay: 20 },
]

export const isPlanId = (v: unknown): v is PlanId => v === 'light' || v === 'regular' || v === 'heavy'

/**
 * P162: prices follow the family's country. The list above is the price in South Africa and every other country; a family in the US pays twice that
 * ($96, $192, $384 a year), which is about what US maths apps charge for one child, for the whole family.
 */
export const PRICE_FACTOR: Readonly<Record<string, number>> = { US: 2 }

/** The yearly price of a plan in whole dollars for a family in `country`. */
export function priceUsdFor(id: PlanId, country: string | null | undefined): number {
  return planOf(id)!.priceUsd * (PRICE_FACTOR[(country ?? '').toUpperCase()] ?? 1)
}

export function planOf(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null
}

/** The rand a dollar buys, for new plans. 16.95 on 18 Nov 2026 (OFX); set `PAYFAST_RAND_PER_DOLLAR` on the Worker to change it. */
export const RAND_PER_DOLLAR = 17

export function randPerDollar(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.PAYFAST_RAND_PER_DOLLAR)
  return Number.isFinite(n) && n >= 5 && n <= 60 ? n : RAND_PER_DOLLAR
}

/** Dollars as rand cents, rounded to R10: $96 at 17 is R1,630, so 163000. */
export function zarCentsOf(usd: number, rate: number): number {
  return Math.round((usd * rate) / 10) * 10 * 100
}

/** Rand cents as PayFast writes an amount: "1630.00". */
export const payfastAmount = (zarCents: number): string => (zarCents / 100).toFixed(2)

/** Rand cents as a person reads them: "R1,630". */
export const randText = (zarCents: number): string => `R${Math.round(zarCents / 100).toLocaleString('en-US')}`

/** "$96" */
export const dollarText = (usd: number): string => `$${usd.toLocaleString('en-US')}`

/** A bigger plan gives more practice: an upgrade starts at once, a smaller plan at the next payment. */
export const isBigger = (to: PlanId, from: PlanId): boolean => planOf(to)!.perMonth > planOf(from)!.perMonth

const DAY = 24 * 60 * 60 * 1000

/**
 * What a parent pays now to move to a bigger plan for the rest of the paid year: the difference of the yearly prices for the days that are left,
 * in whole dollars (never under $1). The new price is paid in full from the next payment on.
 */
export function upgradeUsd(from: PlanId, to: PlanId, periodEnd: Date, now: Date, country: string | null = null): number {
  const diff = priceUsdFor(to, country) - priceUsdFor(from, country)
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY))
  return Math.max(1, Math.round((diff * Math.min(365, daysLeft)) / 365))
}

/** A year after `from`, same day and time (29 Feb gives 1 Mar). */
export function yearAfter(from: Date): Date {
  const d = new Date(from.getTime())
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

/** Days a plan still gives practice after its paid year ends while PayFast's renewal notice is on its way. */
export const RENEWAL_WAIT_DAYS = 3
/** Days a plan still gives practice after a renewal failed, for the parent to change the card. */
export const GRACE_DAYS = 7

export type PlanRow = { status: string; period_end: string | null; grace_until: string | null }

/** Whether a plan gives practice now: active (to a few days after its year, for the renewal), cancelled (to the end of its year), failed (in its grace). */
export function givesPractice(row: PlanRow, now: Date): boolean {
  const t = now.getTime()
  const end = row.period_end ? Date.parse(row.period_end) : NaN
  if (row.status === 'active') return Number.isFinite(end) && t < end + RENEWAL_WAIT_DAYS * DAY
  if (row.status === 'cancelled') return Number.isFinite(end) && t < end
  if (row.status === 'failed') return row.grace_until !== null && t < Date.parse(row.grace_until)
  return false
}
