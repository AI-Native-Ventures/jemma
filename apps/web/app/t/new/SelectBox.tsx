'use client'

import type { ReactNode } from 'react'

/** The select of the class and school forms: the same box as a text field, with a chevron. */
export function SelectBox({ id, value, onChange, children, invalid }: { id: string; value: string; onChange: (value: string) => void; children: ReactNode; invalid?: boolean }) {
  return (
    <span className="relative block">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        className={`h-[52px] w-full appearance-none rounded-14 border bg-card pr-11 pl-3.5 text-[17px] text-ink ${invalid ? 'border-coral-text' : 'border-muted-2'}`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute top-4 right-3.5 text-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </span>
  )
}
