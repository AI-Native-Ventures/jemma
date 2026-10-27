import Link from 'next/link'

/** "Amina's Jemma" bar of the child's phone screens. The laptop has the sidebar instead. */
export function AppHeader({ firstName }: { firstName: string }) {
  return (
    <header className="flex items-center justify-between pt-3 pr-3 pb-1 pl-[18px] leading-[normal] lg:hidden">
      <span className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/jemma-app-icon.svg" alt="" width={34} height={34} className="block size-[34px]" />
        <span className="text-[19px] font-bold">{firstName}&apos;s Jemma</span>
      </span>
      <Link
        href="/k/me"
        aria-label={`${firstName}'s account`}
        className="flex size-11 items-center justify-center rounded-pill text-ink no-underline"
      >
        <span className="flex size-9 items-center justify-center rounded-pill bg-[#FFD3C7] text-[15px] font-bold text-ink">
          {firstName.slice(0, 1).toUpperCase()}
        </span>
      </Link>
    </header>
  )
}
