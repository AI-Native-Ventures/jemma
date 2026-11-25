import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { familyChildren } from '@/lib/family-device'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { PinPad } from './PinPad'

export const metadata = { title: 'Your PIN · Jemma' }
export const dynamic = 'force-dynamic'

/** P162: "Hi Amina! Type your PIN." on the family phone, then the child's own practice. "Forgot it?" names the grown-up to ask. */
export default async function ChildPinPage({ params }: { params: Promise<{ childId: string }> }) {
  const { userId, profile } = await requireRole('parent')
  const { childId } = await params
  const kid = (await familyChildren(createSupabaseAdmin(), userId)).find((k) => k.id === childId)
  if (!kid) notFound()
  const grown = profile.display_name.split(/\s+/)[0] ?? profile.display_name
  return (
    <div className="flex min-h-dvh flex-col bg-ground font-sans leading-[normal] text-ink">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-6 px-5 pt-5 pb-7">
        <Link href="/p/who" aria-label="Back to Who's learning" className="flex size-11 items-center justify-center rounded-12 text-ink">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <div className="flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="flex size-[84px] items-center justify-center rounded-pill bg-gold-soft text-[36px] font-bold">
            {kid.firstName.slice(0, 1).toUpperCase()}
          </span>
          <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.01em]">{kid.hasPin ? `Hi ${kid.firstName}! Type your PIN.` : `Hi ${kid.firstName}!`}</h1>
          {kid.hasPin ? null : <p className="m-0 text-[16px] text-body">No PIN yet. {grown} can make one in your settings.</p>}
        </div>
        <PinPad childId={kid.id} hasPin={kid.hasPin} />
        <div className="flex-1" />
        {kid.hasPin ? <p className="m-0 text-center text-[16px] text-body">Forgot it? Ask {grown}.</p> : null}
      </div>
    </div>
  )
}
