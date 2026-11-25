import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'

// The owner's admin pages (P161) open only for the emails in JEMMA_ADMIN_EMAILS (a Worker secret the owner sets, comma separated). Everyone else,
// signed in or not, gets "not found": the pages do not say they exist. The pages read with the service role after this check.

export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.JEMMA_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const allowed = adminEmails()
  if (allowed.length === 0) notFound()
  const { data } = await (await createSupabaseServer()).auth.getUser()
  const email = data.user?.email?.toLowerCase() ?? ''
  if (!data.user || !allowed.includes(email)) notFound()
  return { userId: data.user.id, email }
}

export type Range = 'today' | '7' | '30' | 'year'
export const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: 'year', label: 'This year' },
]

export const rangeOf = (v: string | undefined): Range => (v === 'today' || v === '7' || v === 'year' ? v : '30')

/** The start of a range, in UTC: midnight today, 7 or 30 days back, or 1 January. */
export function rangeStart(range: Range, now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (range === 'today') return d
  if (range === 'year') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  return new Date(d.getTime() - (Number(range) - 1) * 24 * 60 * 60 * 1000)
}
