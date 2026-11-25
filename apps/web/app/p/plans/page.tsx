import { requireRole } from '@/lib/auth'
import { getFamilyPlan } from '@/lib/data/p161'
import { FREE_A_DAY, PLANS, dollarText, priceUsdFor } from '@/lib/plans'
import { BoardHeader } from '../account/_ui'
import { PlanPicker, type PickerPlan } from './PlanPicker'
import { Headline, Main, namesOf } from './_ui'

export const metadata = { title: 'Plans · Jemma' }
export const dynamic = 'force-dynamic'

/** P161: the plans of a family. One plan for the parent's account; its practices of a month are shared by all the children. */
export default async function PlansPage() {
  const { userId } = await requireRole('parent')
  const family = await getFamilyPlan(userId)
  const names = family.children.map((c) => c.firstName)
  const plans: PickerPlan[] = [
    { id: 'free', name: 'Free', price: '$0', per: '', practice: `${FREE_A_DAY} practices a day`, note: 'for each child' },
    ...PLANS.map((p) => ({ id: p.id, name: p.name, price: dollarText(priceUsdFor(p.id, family.priceCountry)), per: 'a year', practice: `${p.perMonth} practices a month`, note: `about ${p.aDay} a day, shared` })),
  ]
  const now = family.plan && family.plan.status !== 'cancelled' ? family.plan.planId : 'free'
  return (
    <>
      <BoardHeader href="/p/account/plan" label="Back" title="Plans" />
      <Main gap={14}>
        <Headline
          sub={`Every lesson stays free. ${names.length === 1 ? `A plan adds practice for ${names[0]}.` : `A plan adds practice that ${names.length ? namesOf(names) : 'your children'} share.`} Cancel any time.`}
        >
          More practice for {names.length ? namesOf(names) : 'your family'}
        </Headline>
        <PlanPicker plans={plans} now={now} open={family.open} />
      </Main>
    </>
  )
}
