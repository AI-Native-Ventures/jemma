import { PendingButton } from '@/components/ui/Button'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getDemoState } from '@/lib/demo'
import { resetDemoAction } from '../actions'
import { DimmedClass, ResetIcon } from '../parts'

export const metadata: Metadata = { title: 'Demo · Reset' }
export const dynamic = 'force-dynamic'

const WHAT = [
  'Clears what you snapped, marked and wrote',
  'Ms Banda, Thandi, Amina and everyone else start again',
  'Only your copy changes. Takes about 10 seconds',
]

const WHAT_EMPTY = ['Clears the classes and learners you made', 'You start again with no class', 'Only your copy changes. Takes a few seconds']

export default async function DemoResetPage() {
  const demo = await getDemoState()
  if (!demo) redirect('/demo')
  const empty = demo.kind === 'empty'
  return (
    <DimmedClass className={demo.className} grade={demo.grade} schoolName={demo.schoolName}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset"
        aria-describedby="reset-what"
        className="absolute inset-x-5 top-[200px] mx-auto flex max-w-[350px] flex-col gap-3.5 rounded-[26px] bg-card px-5 pt-6 pb-5 shadow-[0_18px_40px_rgba(31,29,54,0.25)]"
      >
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-14 bg-[#FFEDE8] text-ink">
          <ResetIcon size={24} />
        </span>
        <h2 id="reset" className="m-0 text-[25px] leading-[1.2] font-semibold tracking-[-0.01em]">Reset your demo?</h2>
        <div id="reset-what" className="flex flex-col gap-2.5">
          <p className="m-0 text-[16px] leading-[1.5] text-ink">
            {empty ? 'Your empty school goes back to having no class.' : 'Your copy of Hillview Primary goes back to step 1 with fresh sample papers.'}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-[1.4] text-body">
            {(empty ? WHAT_EMPTY : WHAT).map((line) => (
              <li key={line} className="flex gap-2.5">
                <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" className="mt-[5px] flex-none">
                  <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-1.5 flex flex-col gap-2">
          <form action={resetDemoAction} className="contents">
            <PendingButton type="submit" className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-14 bg-ink font-[inherit] text-[17px] font-semibold text-white">Reset demo</PendingButton>
          </form>
          <a href="/demo/switch" className="flex h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink no-underline">Keep my demo</a>
        </div>
      </section>
    </DimmedClass>
  )
}
