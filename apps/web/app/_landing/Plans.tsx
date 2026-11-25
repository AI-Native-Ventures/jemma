import { BAND, LEAD, Title, Together, WRAP } from './Bits'
import { Gem } from './Shot'

// The four plans, by the year in dollars. Every lesson is free on each of them: a plan only adds practice. A plan is on the parent's account and the
// children share its practices (P161).
const PLANS = [
  { price: '$0', per: 'always', name: 'Free', practice: '2 practices a day', note: 'every lesson, always', paid: false },
  { price: '$48', per: 'a year', name: 'Light', practice: '150 practices a month', note: 'about 5 a day', paid: true },
  { price: '$96', per: 'a year', name: 'Regular', practice: '300 practices a month', note: 'about 10 a day', paid: true },
  { price: '$192', per: 'a year', name: 'Heavy', practice: '600 practices a month', note: 'about 20 a day', paid: true },
] as const

/** Free to learn, plans to practise: four plans (two to a row on a phone, four on a laptop), one plan for the whole family, and the free practice. */
export function Plans() {
  return (
    <section aria-labelledby="plans-title" className="bg-card">
      <div className={`${WRAP} ${BAND}`}>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
          <Title id="plans-title" className="min-w-0 flex-[1_1_420px]">
            Free to learn. <Together>Plans to practise.</Together>
          </Title>
          <p className={`${LEAD} min-w-0 flex-[0_1_25em]`}>Every lesson is free, always. A plan gives you more practice.</p>
        </div>
        <ul className="m-0 mt-7 grid list-none grid-cols-2 gap-3.5 p-0 sm:grid-cols-4 lg:mt-12 lg:gap-5 xl:gap-6">
          {PLANS.map((plan) => (
            <li key={plan.name} className="flex min-w-0 flex-col items-center gap-1.5 rounded-20 border border-line bg-ground px-2.5 py-5 text-center lg:px-5 lg:py-7 xl:rounded-[28px] xl:px-6 xl:pt-8">
              <span className={`mb-2 flex size-24 flex-none flex-col items-center justify-center rounded-full border-[3px] border-ink xl:size-[120px] ${plan.paid ? 'bg-gold' : 'bg-gold-tint'}`}>
                <span className="text-[30px] leading-none font-bold tracking-[-0.02em] xl:text-[38px]">{plan.price}</span>
                <span className="text-[13px] leading-[1.3] font-semibold xl:text-[15px]">{plan.per}</span>
              </span>
              <h3 className="m-0 text-[22px] leading-[1.2] font-bold xl:text-[28px]">{plan.name}</h3>
              <p className="m-0 text-[16px] leading-[1.35] font-semibold text-balance xl:text-[19px]">{plan.practice}</p>
              <p className="m-0 text-[14px] leading-[1.35] text-body text-balance xl:text-[16px]">{plan.note}</p>
            </li>
          ))}
        </ul>
        <div className="mt-[22px] flex flex-wrap items-center gap-x-7 gap-y-3 lg:mt-8">
          <p className="m-0 flex min-h-11 items-center gap-2.5 rounded-18 bg-green-tint px-[18px] py-2 text-[16px] leading-[1.3] font-bold xl:text-[19px]">
            <Gem size={12} fill="#007749" />
            <span className="text-balance">One plan for the whole family. Your children share it.</span>
          </p>
          <p className="m-0 text-[15px] leading-[1.5] text-body text-balance xl:text-[17px]">Without a plan: 2 practices a day for each child. Every lesson is free.</p>
        </div>
      </div>
    </section>
  )
}
