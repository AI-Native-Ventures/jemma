import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getFamilyPlan } from '@/lib/data/p161'
import { sameRate } from '@/lib/payfast-notice'
import { dollarText, isBigger, isPlanId, planOf, priceUsdFor, randPerDollar, randText, upgradeUsd, yearAfter, zarCentsOf, type PlanId } from '@/lib/plans'
import { longDate } from '@/lib/zones'
import { BoardHeader } from '../../account/_ui'
import { Headline, Main, Row, SafeBox, card, goldBox, namesOf, small } from '../_ui'
import { PayButton, SmallerButton } from './PayButton'

export const metadata = { title: 'Check and pay · Jemma' }
export const dynamic = 'force-dynamic'

/**
 * P161: everything about a plan before the parent pays: the price, when it starts, the next payment, that it renews until cancelled, and the rand
 * PayFast takes. A new plan (or one again after cancelling), a bigger plan (the difference now) or a smaller plan (from the next payment).
 */
export default async function CheckPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { userId } = await requireRole('parent')
  const { plan: wanted } = await searchParams
  if (!isPlanId(wanted)) redirect('/p/plans')
  const plan = planOf(wanted)!
  const family = await getFamilyPlan(userId)
  // P162: the price of the family's country (twice the list price in the US).
  const price = priceUsdFor(plan.id, family.plan?.country ?? family.priceCountry)
  const now = new Date()
  const names = family.children.map((c) => c.firstName)
  const sharedBy = names.length > 1 ? `, shared by ${namesOf(names)}` : names.length === 1 ? ` for ${names[0]}` : ''
  const abroad = family.country !== 'ZA'
  const current = family.plan
  const running = current && current.status !== 'cancelled' ? current : null

  if (!family.open) {
    return (
      <>
        <BoardHeader href="/p/plans" label="Back" title="Check and pay" />
        <Main>
          <p style={{ ...goldBox, fontSize: 16 }}>Plans open soon. For now, practice is free.</p>
        </Main>
      </>
    )
  }

  if (running && running.planId === plan.id) redirect('/p/account/plan')

  if (running && running.periodEnd && !isBigger(plan.id, running.planId as PlanId)) {
    const from = longDate(new Date(running.periodEnd))
    return (
      <>
        <BoardHeader href="/p/plans" label="Back" title="Change plan" />
        <Main gap={14}>
          <section style={{ ...card, gap: 0, paddingBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 700 }}>{plan.name} from {from}</h1>
            <p style={{ margin: '4px 0 10px', fontSize: 15, color: '#5C5A55' }}>{plan.perMonth} practices a month{sharedBy}</p>
            <Row label="Until then" value={`${running.name}, as now`} />
            <Row label="From the next payment" value={`${dollarText(price)} a year`} />
          </section>
          <p style={{ ...small, padding: '0 4px' }}>Nothing is charged now. You can change it back before {from}.</p>
          <div style={{ flex: 1 }} />
          <SmallerButton plan={plan.id} label={`Change to ${plan.name}`} />
        </Main>
      </>
    )
  }

  if (running && running.periodEnd) {
    const end = new Date(running.periodEnd)
    const usd = upgradeUsd(running.planId as PlanId, plan.id, end, now, running.country)
    const zar = sameRate({ amount_zar_cents: running.amountZarCents, price_usd: running.priceUsd }, usd)
    return (
      <>
        <BoardHeader href="/p/plans" label="Back" title="Check and pay" />
        <Main gap={14}>
          <section style={{ ...card, gap: 0, paddingBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 700 }}>{plan.name} from today</h1>
            <p style={{ margin: '4px 0 10px', fontSize: 15, color: '#5C5A55' }}>{plan.perMonth} practices a month{sharedBy}</p>
            <Row label="Now, for the rest of this year" value={dollarText(usd)} />
            <Row label={`From ${longDate(end)}`} value={`${dollarText(price)} a year`} />
          </section>
          <p style={{ ...small, padding: '0 4px' }}>You pay the difference for the months left. Then it renews each year until you cancel.</p>
          <SafeBox />
          <p style={goldBox}>{abroad ? `PayFast takes the money in rand: ${randText(zar)}. Your bank changes it to your money and may add a fee.` : `PayFast takes ${randText(zar)}.`}</p>
          <div style={{ flex: 1 }} />
          <PayButton plan={plan.id} label="Pay on PayFast" />
          <Terms />
        </Main>
      </>
    )
  }

  const zar = zarCentsOf(price, randPerDollar())
  const again = current?.status === 'cancelled' && current.periodEnd ? new Date(current.periodEnd) : null
  const runsTo = yearAfter(again ?? now)
  return (
    <>
      <BoardHeader href="/p/plans" label="Back" title="Check and pay" />
      <Main gap={14}>
        <section style={{ ...card, gap: 0, paddingBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.01em' }}>{plan.name} for your family</h1>
          <p style={{ margin: '4px 0 10px', fontSize: 15, color: '#5C5A55' }}>{plan.perMonth} practices a month{sharedBy}</p>
          <Row label="Price" value={`${dollarText(price)} a year`} />
          <Row label="Starts" value={again ? `${longDate(again)}, after your plan now` : 'Today'} />
          <Row label="Next payment" value={longDate(runsTo)} />
        </section>
        <p style={{ ...small, padding: '0 4px' }}>
          {again ? 'You pay now and nothing changes until then. ' : ''}It renews each year until you cancel. We remind you 30 days before. Cancel any time in Your account.
        </p>
        <SafeBox />
        <p style={goldBox}>
          {abroad ? `PayFast takes the money in rand: ${randText(zar)}, about ${dollarText(price)}. Your bank changes it to your money and may add a fee.` : `PayFast takes ${randText(zar)} a year.`}
        </p>
        <div style={{ flex: 1 }} />
        <PayButton plan={plan.id} label="Pay on PayFast" />
        <Terms />
      </Main>
    </>
  )
}

function Terms() {
  return (
    <p style={{ ...small, textAlign: 'center' }}>
      By paying, you agree to the{' '}
      <Link href="/terms" style={{ color: '#161616', fontWeight: 600 }}>
        Terms
      </Link>
      .
    </p>
  )
}
