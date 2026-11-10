import Link from 'next/link'

/** The one text link from the class home to the full log. It sits under the "What Jemma did" list. */
export function FullLogLink({ href, className = '' }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`flex min-h-11 items-center self-start text-[14px] font-semibold text-ink underline underline-offset-[3px] ${className}`}>
      See the full log
    </Link>
  )
}
