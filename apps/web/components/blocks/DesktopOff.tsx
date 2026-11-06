'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { runInCloudThisTime } from '@/app/t/desktop-actions'

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function DesktopOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 18.5h18" />
      <path d="M9.5 8.5l5 3.5M14.5 8.5l-5 3.5" />
    </svg>
  )
}

/** "Open Jemma Desktop" (a link the app answers to) and "Run in the cloud this time". */
export function DesktopOffActions() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <a href="jemma-desktop://open" className="flex h-12 items-center justify-center gap-2 rounded-14 bg-ink text-[16px] font-semibold text-white no-underline">
        <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="1.9" aria-hidden="true" {...stroke}>
          <rect x="5" y="5" width="14" height="10" rx="1.5" />
          <path d="M3 18.5h18" />
        </svg>
        Open Jemma Desktop
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await runInCloudThisTime(); router.refresh() })}
        className="flex h-12 items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[16px] font-semibold text-ink disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="1.9" aria-hidden="true" {...stroke}>
          <path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.5 4.5 0 0 0 7 18.5z" />
        </svg>
        Run in the cloud this time
      </button>
    </div>
  )
}
