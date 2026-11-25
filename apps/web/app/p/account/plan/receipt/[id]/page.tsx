import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { dollarText, planOf, randText } from '@/lib/plans'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { longDate } from '@/lib/zones'
import { BoardHeader } from '../../../_ui'
import { Main, Row, card, small } from '../../../../plans/_ui'

export const metadata = { title: 'Receipt · Jemma' }
export const dynamic = 'force-dynamic'

/** P161: a receipt for one payment of the parent's: what it was for, the rand PayFast took, the dollars it was shown as, and PayFast's number. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireRole('parent')
  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: pay } = await admin.from('payments').select('*').eq('id', id).maybeSingle()
  if (!pay || pay.parent_id !== userId || pay.status === 'failed') notFound()
  const { data: sub } = pay.subscription_id ? await admin.from('subscriptions').select('plan').eq('id', pay.subscription_id).maybeSingle() : { data: null }
  const plan = planOf(sub?.plan)
  const what = pay.kind === 'upgrade' ? `Jemma ${plan?.name ?? ''}, the rest of the year` : pay.kind === 'renewal' ? `Jemma ${plan?.name ?? ''}, a new year` : `Jemma ${plan?.name ?? ''}, one year`
  return (
    <>
      <BoardHeader href="/p/account/plan" label="Back" title="Receipt" />
      <Main gap={14}>
        <section style={{ ...card, gap: 0, paddingBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 700 }}>{what.replace('  ', ' ')}</h1>
          <p style={{ margin: '4px 0 10px', fontSize: 15, color: '#5C5A55' }}>{pay.status === 'refunded' ? 'Refunded' : 'Paid'}</p>
          <Row label="Date" value={longDate(new Date(pay.paid_at ?? pay.created_at))} />
          {pay.amount_gross_zar_cents ? <Row label="PayFast took" value={randText(pay.amount_gross_zar_cents)} /> : null}
          {pay.price_usd ? <Row label="Price shown" value={dollarText(pay.price_usd)} /> : null}
          {pay.pf_payment_id ? <Row label="PayFast number" value={pay.pf_payment_id} /> : null}
          <Row label="Sold by" value="AI Native Ventures (Jemma)" />
        </section>
        <p style={{ ...small, padding: '0 4px' }}>PayFast also emailed you a receipt for this payment.</p>
      </Main>
    </>
  )
}
