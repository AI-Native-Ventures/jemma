import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { planOf } from '@/lib/plans'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { Check, Main, card, gold, namesOf, small } from '../_ui'
import { Waiting } from './Waiting'

export const metadata = { title: 'Paid · Jemma' }
export const dynamic = 'force-dynamic'

/**
 * P161: where PayFast sends the parent back after paying. The plan starts when PayFast's notice comes in (a few seconds, usually before the parent is
 * back): until then the screen says so and looks again by itself.
 */
export default async function DonePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { userId } = await requireRole('parent')
  const { ref } = await searchParams
  const admin = createSupabaseAdmin()
  const { data: sub } = ref ? await admin.from('subscriptions').select('plan, status, upgrade_plan, parent_id').eq('id', ref).maybeSingle() : { data: null }
  const mine = sub && sub.parent_id === userId ? sub : null
  const started = mine !== null && mine.status !== 'pending' && !mine.upgrade_plan
  const { data: links } = await admin.from('parent_links').select('child_id').eq('parent_id', userId).eq('status', 'approved')
  const ids = (links ?? []).map((l) => l.child_id)
  const { data: kids } = ids.length ? await admin.from('children').select('first_name').in('id', ids) : { data: [] }
  const names = (kids ?? []).map((k) => k.first_name)
  const plan = planOf(mine?.plan)
  return (
    <Main gap={16}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: '0 8px' }}>
        {started && plan ? (
          <>
            <span aria-hidden="true" style={{ width: 76, height: 76, borderRadius: 999, background: '#007749', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check />
            </span>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {names.length === 1 ? `${names[0]} is` : 'Your family is'} on {plan.name}.
            </h1>
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.45, color: '#3D3B37' }}>
              {plan.perMonth} practices a month{names.length > 1 ? ` for ${namesOf(names)}` : ''}, from today.
            </p>
            <p style={{ ...small, fontSize: 15 }}>PayFast emails you the receipt.</p>
          </>
        ) : mine ? (
          <>
            <Waiting />
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 700 }}>PayFast is telling Jemma about your payment.</h1>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, color: '#3D3B37' }}>This takes a few seconds. You can wait here.</p>
          </>
        ) : (
          <section style={{ ...card, gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>No payment found.</h1>
            <p style={small}>Your plans and payments are in Your account.</p>
          </section>
        )}
      </div>
      <Link href="/p/account/plan" style={gold}>
        {started ? 'Done' : 'Plans and payments'}
      </Link>
    </Main>
  )
}
