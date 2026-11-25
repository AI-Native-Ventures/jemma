import type { JemmaDb } from '@jemma/profiling/db'
import { COUNTRIES } from './subjects'

// Where a sign-up came from, and the US age rule (P161). The country a person picks is kept with their sign-up, and so are the tags of the link
// they came by (utm_source, utm_medium, utm_campaign): Jemma reads its own address, no ad network's cookie. In the US a child under 13 needs a parent
// to make the account (COPPA): the sign-up asks the year a US person was born, keeps only the yes or no, and makes no account for a child under 13.

export const UNDER_13_WORDS = 'You need a parent to make your account. Ask a parent to sign up on Jemma and add you.'

/** The country Cloudflare saw (CF-IPCountry), when it is one of Jemma's; South Africa otherwise. */
export const defaultCountry = (seen: string | null | undefined): string => (COUNTRIES.some((c) => c.code === seen) ? seen! : 'ZA')

export const isCountry = (code: unknown): code is string => typeof code === 'string' && COUNTRIES.some((c) => c.code === code)

/** True when a person born in `year` may be under 13 now. Only the year is asked, so a person who turns 13 this year counts as under 13. */
export function mayBeUnder13(year: number, now: Date = new Date()): boolean {
  return !Number.isInteger(year) || now.getUTCFullYear() - year < 14
}

/** The years a person can pick, newest first: this year back to 100 years ago. */
export const birthYears = (now: Date = new Date()): number[] => Array.from({ length: 101 }, (_, i) => now.getUTCFullYear() - i)

/** A tag of a link as Jemma keeps it: lower case, letters, digits and `._-`, at most 60 characters. Empty is null. */
export function cleanTag(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return t || null
}

export type SignupFacts = { country: string | null; over13: boolean | null; source: string | null; medium: string | null; campaign: string | null; landing: string | null }

/** Keeps a new person's sign-up facts. A failure is logged and never stops the sign-up. */
export async function recordSignup(admin: JemmaDb, userId: string, facts: SignupFacts): Promise<void> {
  const { error } = await admin.from('signups').upsert({ user_id: userId, country: facts.country, over_13: facts.over13, source: facts.source, medium: facts.medium, campaign: facts.campaign, landing: facts.landing })
  if (error) console.error(`sign-up facts not kept: ${error.message}`)
}
