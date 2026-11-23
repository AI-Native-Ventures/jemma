import { GemBurst } from '@/components/sa'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getHandbackNext } from '@/lib/data/p120'
import { getHandback } from '@/lib/data/p27'
import { AppHeader } from '../session/_parts/AppHeader'
import { handBackToDemoParent } from './actions'
import { HoldToOpen } from './HoldToOpen'

export const metadata: Metadata = { title: 'All done' }
export const dynamic = 'force-dynamic'

export default async function HandbackPage() {
  const h = await getHandback()
  // Where the hold goes (P120): a grown-up's own page, the demo's made-up grown-up, or nowhere (a learner with nobody to hand the phone to goes home).
  const { target, seeAnswersHref } = await getHandbackNext()
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground font-sans leading-[normal] lg:static lg:z-auto lg:min-h-dvh lg:overflow-visible">
      <AppHeader firstName={h.firstName} />
      <div className="flex flex-1 flex-col gap-[22px] px-5 py-[30px]">
        <div className="flex flex-col items-center gap-4 text-center">
          <GemBurst width={172} />
          <h1 className="m-0 text-[34px] leading-[1.12] font-bold tracking-[-0.02em]">All done, {h.firstName}!</h1>
          {target.kind === 'home' ? (
            <p className="m-0 text-[19px] leading-[1.45] text-body text-pretty">{h.minutes ? `You worked for ${h.minutes} ${h.minutes === 1 ? 'minute' : 'minutes'} tonight. ` : ''}Well done.</p>
          ) : (
            <p className="m-0 text-[19px] leading-[1.45] text-body text-pretty">
              {h.minutes ? `You worked for ${h.minutes} ${h.minutes === 1 ? 'minute' : 'minutes'} tonight. ` : ''}Now pass the phone back to {h.relation}.
            </p>
          )}
        </div>
        {seeAnswersHref ? (
          <Link
            href={seeAnswersHref}
            className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-ink no-underline"
          >
            See your answers
          </Link>
        ) : null}
        {target.kind === 'home' ? (
          // A learner with nobody to hand the phone to (on their own, or in with a code login: P111, P120) goes back to their own home.
          <Link
            href={target.href}
            className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-0 bg-green px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-white no-underline"
          >
            Back to my Jemma
          </Link>
        ) : (
          <section aria-labelledby="forthandi" className="flex flex-col items-center gap-3.5 rounded-[26px] border border-line bg-card px-5 py-[22px] text-center">
            <h2 id="forthandi" className="m-0 text-[17px] font-semibold">For {h.parentName}</h2>
            {target.kind === 'demo-parent' ? <HoldToOpen action={handBackToDemoParent} /> : <HoldToOpen href={target.href} />}
            <p className="m-0 text-[15px] leading-[1.45] text-body">Holding for 2 seconds opens your view, so little fingers don&apos;t open it by accident.</p>
          </section>
        )}
        <div className="flex-1" />
      </div>
    </div>
  )
}
