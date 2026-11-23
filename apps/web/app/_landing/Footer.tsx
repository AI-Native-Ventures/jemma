import Link from 'next/link'
import { Wordmark } from '@/components/install/Wordmark'
import { Together, WRAP } from './Bits'

const LINKS = [
  { label: 'Start', href: '/sign-up' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Help', href: '/help' },
] as const

const GITHUB = 'https://github.com/AI-Native-Ventures/jemma'

/** Each link is at least 44 px high, so a thumb finds it. */
const LINK = 'flex min-h-11 items-center text-[16px] font-medium text-ink no-underline hover:underline hover:underline-offset-[3px] lg:text-[17px]'

/** The end of the page: the wordmark, the links, what Jemma teaches, the licence, and that every learner shown is made up. */
export function Footer() {
  return (
    <footer className="pb-10">
      <div className={`${WRAP} flex flex-wrap items-center justify-between gap-x-10 gap-y-4 pt-9`}>
        <span className="flex min-h-12 items-center">
          <Wordmark width={96} height={37} />
        </span>
        <nav aria-label="More from Jemma">
          <ul className="m-0 flex list-none flex-wrap gap-x-8 p-0">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={GITHUB} target="_blank" rel="noopener noreferrer" className={LINK}>
                Source on GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <p className={`${WRAP} m-0 mt-3 text-[14px] leading-[1.5] text-body`}>
        Mathematics, CAPS Grades 1 to 12. MIT licence. <Together>Every learner shown here is made up.</Together>
      </p>
    </footer>
  )
}
