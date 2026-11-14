import Link from 'next/link'

const LINKS = [
  { label: 'Try the demo', href: '/demo' },
  { label: 'Sign in', href: '/sign-in' },
  { label: 'Start', href: '/sign-up' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Help', href: '/help' },
] as const

const GITHUB = 'https://github.com/AI-Native-Ventures/jemma'

/** Each link is at least 44 px high, so a thumb finds it. */
const LINK = 'flex min-h-11 items-center py-1 text-[16px] font-semibold text-ink underline underline-offset-[3px]'

/** The challenge it was built for, the links, and the licence. */
export function Footer() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-5 py-8 lg:px-10 lg:py-10">
        <p className="m-0 text-[15px] leading-[1.45] text-body text-pretty">Built for the African Agentic AI Design Challenge, Education track.</p>
        <nav aria-label="More from Jemma">
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0 sm:flex sm:flex-wrap sm:gap-x-8">
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
        <p className="m-0 text-[14px] leading-[1.4] text-body">Open source under the MIT licence.</p>
      </div>
    </footer>
  )
}
