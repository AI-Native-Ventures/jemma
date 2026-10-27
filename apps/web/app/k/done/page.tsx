import type { Metadata } from 'next'
import { getHandback } from '@/lib/data/p27'
import { AppHeader } from '../session/_parts/AppHeader'
import { HoldToOpen } from './HoldToOpen'

export const metadata: Metadata = { title: 'All done' }
export const dynamic = 'force-dynamic'

export default async function HandbackPage() {
  const h = await getHandback()
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground font-sans leading-[normal] lg:static lg:z-auto lg:min-h-dvh lg:overflow-visible">
      <AppHeader firstName={h.firstName} />
      <div className="flex flex-1 flex-col gap-[22px] px-5 py-[30px]">
        <div className="flex flex-col items-center gap-4 text-center">
          <span aria-hidden="true" className="relative block h-[110px] w-[150px]">
            <svg width="70" height="70" viewBox="0 0 16 16" className="absolute top-2.5 left-10"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" /></svg>
            <svg width="34" height="34" viewBox="0 0 16 16" className="absolute top-14 left-1"><polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" /></svg>
            <svg width="28" height="28" viewBox="0 0 16 16" className="absolute top-0 right-1.5">
              <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
              <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" />
            </svg>
            <svg width="16" height="16" viewBox="0 0 16 16" className="absolute right-6 bottom-1.5"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#1F1D36" /></svg>
          </span>
          <h1 className="m-0 text-[34px] leading-[1.12] font-bold tracking-[-0.02em]">All done, {h.firstName}!</h1>
          <p className="m-0 text-[19px] leading-[1.45] text-body text-pretty">
            {h.minutes ? `You worked for ${h.minutes} ${h.minutes === 1 ? 'minute' : 'minutes'} tonight. ` : ''}Now pass the phone back to {h.relation}.
          </p>
        </div>
        <section aria-labelledby="forthandi" className="flex flex-col items-center gap-3.5 rounded-[26px] border border-line bg-card px-5 py-[22px] text-center">
          <h2 id="forthandi" className="m-0 text-[17px] font-semibold">For {h.parentName}</h2>
          <HoldToOpen href="/demo/switch" />
          <p className="m-0 text-[15px] leading-[1.45] text-body">Holding for 2 seconds opens your view, so little fingers don&apos;t open it by accident.</p>
        </section>
        <div className="flex-1" />
      </div>
    </div>
  )
}
