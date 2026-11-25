import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { Main, card, gold, small } from '../_ui'

export const metadata = { title: 'Not paid · Jemma' }
export const dynamic = 'force-dynamic'

/** P161: where PayFast sends a parent who left its payment page without paying. Nothing was charged; a plan that was waiting for this payment ends. */
export default async function StoppedPage({ searchParams }: { searchParams: Promise<{ ref?: string; up?: string }> }) {
  const { userId } = await requireRole('parent')
  const { ref, up } = await searchParams
  const admin = createSupabaseAdmin()
  if (ref) await admin.from('subscriptions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', ref).eq('parent_id', userId).eq('status', 'pending')
  if (up) await admin.from('subscriptions').update({ upgrade_plan: null, upgrade_usd: null, upgrade_zar_cents: null }).eq('id', up).eq('parent_id', userId)
  return (
    <Main gap={16}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <section style={{ ...card, gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 700 }}>You did not pay.</h1>
          <p style={{ ...small, fontSize: 16 }}>Nothing was charged. Every lesson is still free.</p>
        </section>
      </div>
      <Link href="/p/plans" style={gold}>
        Back to the plans
      </Link>
    </Main>
  )
}
