import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { getFamilyPlan } from '@/lib/data/p161'
import { cardUpdateUrl, payfastEnv } from '@/lib/payfast'
import { FREE_A_DAY, dollarText, planOf, priceUsdFor } from '@/lib/plans'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { longDate, shortDate } from '@/lib/zones'
import { headers } from 'next/headers'
import { BoardHeader } from '../_ui'
import { Check, Main, body, card, gold, note, outline, small, soft } from '../../plans/_ui'
import { CancelButton } from './CancelButton'

export const metadata = { title: 'Plans and payments · Jemma' }
export const dynamic = 'force-dynamic'

const badge = (text: string, bg: string, color: string) => (
  <span style={{ fontSize: 13, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' }}>{text}</span>
)

/**
 * P161: the family's plan in Your account. The plan, the month's practice (the pool and each child's part of it), the next payment, change or
 * cancel; when cancelled, the day it ends and "Turn it back on"; when a renewal was not paid, the day it stops and "Change card". Then the card
 * (kept by PayFast) and the payments, each with a receipt.
 */
export default async function PlanPaymentsPage() {
  const { userId } = await requireRole('parent')
  const family = await getFamilyPlan(userId)
  const p = family.plan
  const env = payfastEnv()
  let changeCard: string | null = null
  if (p?.hasToken && env) {
    const { data: row } = await createSupabaseAdmin().from('subscriptions').select('token').eq('id', p.id).single()
    const h = await headers()
    const back = `https://${h.get('x-forwarded-host') ?? h.get('host') ?? 'jemma.ainative.ventures'}/p/account/plan`
    if (row?.token) changeCard = cardUpdateUrl(row.token, back, env.sandbox)
  }
  const end = p?.periodEnd ? longDate(new Date(p.periodEnd)) : null
  const next = p?.nextPlan ? planOf(p.nextPlan) : null
  return (
    <>
      <BoardHeader href="/p/account" label="Back" title="Plans and payments" />
      <Main gap={14}>
        {p?.status === 'cancelled' ? (
          <p role="status" style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'flex-start', padding: 16, borderRadius: 18, background: '#DDEFE6', fontSize: 15, lineHeight: 1.45, fontWeight: 600 }}>
            <Check size={20} color="#005C38" />
            Cancelled. Your family keeps {p.name} until {end}.
          </p>
        ) : null}
        {p?.status === 'failed' ? (
          <section role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 20, background: '#FDF1EF', border: '1.5px solid #B8281E' }}>
            <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3, fontWeight: 700 }}>We could not take {dollarText(p.priceUsd)} for your plan.</h2>
            <p style={{ ...note, color: '#161616' }}>
              Change the card on PayFast by {p.graceUntil ? longDate(new Date(p.graceUntil)) : 'next week'}. If not, your children go back to Free then.
            </p>
            {changeCard ? (
              <a href={changeCard} style={{ ...outline, minHeight: 50 }}>
                Change card
              </a>
            ) : null}
          </section>
        ) : null}

        {p ? (
          <section aria-label="Your family's plan" style={{ ...card, gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 19, fontWeight: 700 }}>{p.name}</span>
                <span style={{ fontSize: 14, color: body }}>
                  {dollarText(p.priceUsd)} a year · {p.perMonth} practices a month
                </span>
              </span>
              {p.status === 'cancelled' ? badge('Cancelled', soft, '#161616') : p.status === 'failed' ? badge('Not paid', '#FBE3E0', '#B8281E') : badge('Paid', '#DDEFE6', '#005C38')}
            </div>
            {family.use ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>Practice this month</span>
                  <span style={{ color: body }}>
                    {family.use.used} of {p.perMonth}
                  </span>
                </div>
                <div aria-hidden="true" style={{ height: 10, borderRadius: 999, background: soft, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.round((family.use.used / p.perMonth) * 100))}%`, height: '100%', borderRadius: 999, background: '#007749' }} />
                </div>
                {family.use.children.length > 1 ? (
                  <span style={{ fontSize: 13, color: body }}>{family.use.children.map((c) => `${c.firstName} ${c.used}`).join(' · ')}</span>
                ) : null}
                <span style={{ fontSize: 13, color: body }}>A new month starts on {shortDate(family.use.resetsAt, family.use.zone)}.</span>
              </div>
            ) : null}
            {p.status === 'cancelled' ? (
              <>
                <p style={{ ...note, color: '#161616' }}>Ends on {end}. No more payments.</p>
                <Link href={`/p/plans/check?plan=${p.planId}`} style={{ ...outline, minHeight: 50 }}>
                  Turn it back on
                </Link>
              </>
            ) : (
              <>
                <p style={{ ...note, color: '#161616' }}>
                  {p.status === 'failed' ? 'Payment due' : 'Next payment'}: {dollarText(next ? priceUsdFor(next.id, p.country) : p.priceUsd)} on {end}
                  {next ? `, for ${next.name}` : ''}.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Link href="/p/plans" style={{ ...outline, flex: 1, minHeight: 50, padding: '10px 12px' }}>
                    Change plan
                  </Link>
                  <CancelButton planName={p.name} until={end ?? 'the end of the year'} />
                </div>
              </>
            )}
          </section>
        ) : (
          <section aria-label="Your family's plan" style={{ ...card, gap: 12 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 19, fontWeight: 700 }}>Free</span>
              <span style={{ fontSize: 14, color: body }}>{FREE_A_DAY} practices a day for each child. Every lesson is free.</span>
            </span>
            {family.open ? (
              <Link href="/p/plans" style={gold}>
                See the plans
              </Link>
            ) : (
              <p style={small}>Plans open soon. For now, practice is free.</p>
            )}
          </section>
        )}

        {p || family.payments.length ? (
          <section aria-label="Card and payments" style={{ ...card, gap: 0, padding: '6px 16px' }}>
            {changeCard ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '6px 0' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 500 }}>Your card</span>
                  <span style={{ fontSize: 13, color: body }}>Kept by PayFast, not by Jemma</span>
                </span>
                <a href={changeCard} style={{ fontSize: 15, fontWeight: 600, color: '#161616', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  Change card
                </a>
              </div>
            ) : null}
            {family.payments.map((pay, i) => (
              <div key={pay.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '6px 0', borderTop: i > 0 || changeCard ? `1px solid ${soft}` : 'none' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 500 }}>
                    {pay.priceUsd ? `${dollarText(pay.priceUsd)} · ` : ''}
                    {pay.kind === 'upgrade' ? `${pay.planName}, the rest of the year` : pay.planName}
                  </span>
                  <span style={{ fontSize: 13, color: pay.status === 'failed' ? '#B8281E' : body }}>
                    {pay.status === 'paid' ? 'Paid' : pay.status === 'refunded' ? 'Refunded' : 'Not paid'} on {longDate(new Date(pay.paidAt ?? pay.createdAt))}
                  </span>
                </span>
                {pay.status !== 'failed' ? (
                  <Link href={`/p/account/plan/receipt/${pay.id}`} style={{ fontSize: 15, fontWeight: 600, color: '#161616', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    Receipt
                  </Link>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </Main>
    </>
  )
}
