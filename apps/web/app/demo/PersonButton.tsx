'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/** A demo sign-in row. While the sandbox is being made (about 6 seconds) it shows that it is working and cannot be tapped twice. */
export function PersonButton({ className, children, chevron }: { className: string; children: ReactNode; chevron: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait`}>
      {children}
      {pending ? (
        <span className="flex flex-none items-center gap-2 text-[13px] text-body" role="status">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" className="animate-spin">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#FF6A4D" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Opening your copy of Hillview Primary
        </span>
      ) : (
        chevron
      )}
    </button>
  )
}
