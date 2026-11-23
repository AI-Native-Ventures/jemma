import type { ReactNode } from 'react'
import { BAND, Drawing, Title, WRAP } from './Bits'

// The three rules a learner can count on, in a learner's own words. Each line has a small drawing before it and a green tick after it.
const RULES: readonly { line: string; turn: string; drawing: ReactNode }[] = [
  {
    line: 'Jemma never calls you slow or weak.',
    turn: 'rotate-[-4deg]',
    // a person
    drawing: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
      </>
    ),
  },
  {
    line: 'You are never ranked against your class.',
    turn: 'rotate-[3deg]',
    // the bars of a ranking, struck through
    drawing: (
      <>
        <path d="M6 20v-5M11 20V9M16 20v-7" />
        <path d="M4 5l15.5 15.5" />
      </>
    ),
  },
  {
    line: 'Your own practice never goes to your school.',
    turn: 'rotate-[-2deg]',
    // a lock
    drawing: (
      <>
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </>
    ),
  },
]

/** The rules Jemma keeps, as three lines on a sheet of paper taped to the page, each with a green tick. */
export function Rules() {
  return (
    <section aria-labelledby="rules-title" className="bg-soft-4">
      <div className={`${WRAP} ${BAND}`}>
        <div className="relative mx-auto max-w-[880px] rotate-[-0.7deg] rounded-[10px] bg-card px-[18px] pt-9 pb-6 shadow-[0_1px_2px_rgba(22,22,22,0.06),0_28px_50px_-30px_rgba(22,22,22,0.3)] lg:px-12 lg:pt-12 lg:pb-9 xl:px-14 xl:pt-14 xl:pb-10">
          <span aria-hidden="true" className="absolute -top-3 left-5 h-[26px] w-[84px] rotate-[-5deg] bg-gold/45 lg:left-12 lg:w-[100px]" />
          <span aria-hidden="true" className="absolute -top-3 right-5 h-[26px] w-[84px] rotate-[4deg] bg-green/[0.28] lg:right-12 lg:w-[100px]" />
          <Title id="rules-title" className="pl-1 lg:pl-3">
            The rules it keeps
          </Title>
          <div className="relative mt-5 lg:mt-8">
            {/* the red margin line of a page from an exercise book */}
            <span aria-hidden="true" className="absolute top-0 bottom-0 left-11 w-0.5 bg-[#F2AAA4] lg:left-16" />
            <ul className="m-0 list-none border-b-[1.5px] border-line p-0">
              {RULES.map((rule) => (
                <li key={rule.line} className="flex min-h-[76px] items-center border-t-[1.5px] border-line lg:min-h-[92px]">
                  <span aria-hidden="true" className="flex w-11 flex-none justify-center lg:w-16">
                    <Drawing>{rule.drawing}</Drawing>
                  </span>
                  <span className="min-w-0 flex-1 py-3.5 pr-2 pl-4 text-[18px] leading-[1.3] font-semibold lg:pl-7 lg:text-[22px] xl:text-[26px]">{rule.line}</span>
                  <svg viewBox="0 0 30 30" aria-hidden="true" className={`size-[26px] flex-none xl:size-8 ${rule.turn}`}>
                    <path d="M4 16.5c2.5 1.6 4.6 3.8 6.6 6.8C14 15 19 8.6 26.5 4.5" fill="none" stroke="#007749" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
