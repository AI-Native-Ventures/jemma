'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * A small sign-in button for "More people at Hillview": a row (a teacher or a parent, with a line under the name) or a chip (a learner).
 * While the copy is being made or the person's login is being set up it says so and cannot be tapped twice.
 */
export function PersonChip({ name, detail, variant, busy = 'Opening your copy of Hillview Primary' }: { name: string; detail?: ReactNode; variant: 'row' | 'chip'; busy?: string }) {
  const { pending } = useFormStatus()
  if (variant === 'chip') {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border border-line bg-card px-3.5 text-left font-[inherit] text-[15px] font-semibold text-ink disabled:cursor-wait disabled:opacity-70"
      >
        {name}
        {pending ? <span role="status" className="text-[13px] font-normal text-body">Opening</span> : detail ? <span className="text-[13px] font-normal text-body">{detail}</span> : null}
      </button>
    )
  }
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[16px] border border-line bg-card py-2 pr-3.5 pl-3.5 text-left font-[inherit] text-ink disabled:cursor-wait disabled:opacity-70"
    >
      <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
        <span className="text-[16px] font-semibold">{name}</span>
        <span className="text-[14px] text-body">{pending ? busy : detail}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-none ${pending ? 'animate-spin' : ''}`}>
        {pending ? <path d="M21 12a9 9 0 0 0-9-9" /> : <path d="m9 6 6 6-6 6" />}
      </svg>
    </button>
  )
}
