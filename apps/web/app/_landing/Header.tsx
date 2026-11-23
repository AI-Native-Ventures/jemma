import Link from 'next/link'
import { Wordmark } from '@/components/install/Wordmark'
import { WRAP } from './Bits'

/** The top of the page: the wordmark, and the way in for a person who has an account. The link is 44 px high, so a thumb finds it. */
export function Header() {
  return (
    <header className={`${WRAP} flex items-center justify-between gap-4 pt-4`}>
      <span className="flex min-h-[52px] items-center">
        <Wordmark width={120} height={47} />
      </span>
      <Link href="/sign-in" className="flex min-h-11 items-center px-1 text-[16px] font-semibold text-ink no-underline lg:text-[17px]">
        Sign in
      </Link>
    </header>
  )
}
