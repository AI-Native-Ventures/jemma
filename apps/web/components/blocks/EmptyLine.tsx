import type { ReactNode } from 'react'

/** One calm line that stands where a list would be when there is nothing to list yet. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[14px] leading-[1.4] text-body">{children}</p>
}
