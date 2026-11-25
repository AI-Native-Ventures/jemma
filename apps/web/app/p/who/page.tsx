import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { familyChildren } from '@/lib/family-device'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const metadata = { title: "Who's learning? · Jemma" }
export const dynamic = 'force-dynamic'

/**
 * "Who's learning?" (P162): one phone for the family. Each child taps their face and types their own PIN; the parent stays signed in, and "Grown-up?"
 * goes back to the parent's view. A child with no PIN yet goes straight in, and the parent can set one in the child's settings.
 */
export default async function WhoPage() {
  const { userId, profile } = await requireRole('parent')
  const kids = await familyChildren(createSupabaseAdmin(), userId)
  if (kids.length === 0) redirect('/p')
  const grown = profile.display_name.split(/\s+/)[0] ?? profile.display_name
  return (
    <div className="flex min-h-dvh flex-col bg-ground font-sans leading-[normal] text-ink">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-6 px-5 pt-5 pb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/jemma-app-icon.svg" alt="Jemma" width={40} height={40} className="block size-10" />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[34px] leading-[1.1] font-bold tracking-[-0.02em]">Who&apos;s learning?</h1>
          <p className="m-0 text-[18px] text-body">Tap your face.</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-3.5 p-0">
          {kids.map((k) => (
            <li key={k.id}>
              <Link
                href={`/p/who/${k.id}`}
                className="flex min-h-[176px] flex-col items-center justify-center gap-2.5 rounded-[26px] border border-line bg-card p-4 text-center text-ink no-underline shadow-[0_8px_24px_rgba(22,22,22,0.06)]"
              >
                <span aria-hidden="true" className="flex size-[76px] items-center justify-center rounded-pill bg-gold-soft text-[32px] font-bold">
                  {k.firstName.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-[20px] font-bold">{k.firstName}</span>
                {k.grade ? <span className="text-[15px] text-body">Grade {k.grade}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <p className="m-0 text-center text-[16px] text-body">Each of you has your own PIN.</p>
        <div className="flex-1" />
        <Link href="/p" className="flex min-h-12 items-center justify-center text-[16px] font-semibold text-ink underline underline-offset-[3px]">
          Grown-up? Open {grown}&apos;s view
        </Link>
      </div>
    </div>
  )
}
