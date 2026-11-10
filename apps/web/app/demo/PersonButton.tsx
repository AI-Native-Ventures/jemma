'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * A demo sign-in row. While the sandbox is being made (a few seconds) it shows that it is working and cannot be tapped twice.
 * The button is the `group` and carries `aria-busy`, so the row's own text can swap to "Opening your copy" with `group-aria-busy:`
 * variants. The right-hand slot only ever holds the chevron or a small spinner, so the text column keeps its width.
 */
export function PersonButton({ className, children, chevron }: { className: string; children: ReactNode; chevron: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`group ${className} disabled:cursor-wait`}>
      {children}
      {pending ? (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" className="flex-none animate-spin">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#FF6A4D" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        chevron
      )}
    </button>
  )
}
