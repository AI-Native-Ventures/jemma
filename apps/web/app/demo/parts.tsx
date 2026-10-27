import type { ReactNode } from 'react'
import { DemoBadge } from '@/components/blocks'

export function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function ResetIcon({ size, strokeWidth = 2 }: { size: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  )
}

/**
 * The teacher class screen the switch and reset dialogs sit on: header plus placeholder blocks, dimmed by the dialog.
 * Same markup as the boards, so the dialog looks the way it was drawn.
 */
export function DimmedClass({ className, grade, schoolName, children }: { className: string; grade: number; schoolName: string; children: ReactNode }) {
  return (
    <div className="relative h-dvh min-h-[600px] overflow-hidden bg-ground font-sans leading-[normal] text-ink">
      <div className="mx-auto flex max-w-[390px] flex-col">
        <header className="flex items-center justify-between gap-2 pt-2.5 pr-2.5 pb-1.5 pl-4">
          <span className="flex items-center gap-2">
            <span className="flex flex-col leading-[1.15]">
              <span className="text-[19px] font-bold tracking-[-0.01em]">{className}</span>
              <span className="text-[13px] text-body">{`Grade ${grade} · ${schoolName}`}</span>
            </span>
            <DemoBadge />
          </span>
          <span className="flex items-center gap-2 pr-1.5">
            <span className="size-[30px] rounded-[10px] bg-soft-3" />
            <span className="size-[30px] rounded-[10px] bg-soft-3" />
          </span>
        </header>
        <div aria-hidden="true" className="flex flex-col gap-4 px-5 py-4">
          <span className="block h-3.5 w-[120px] rounded-pill bg-soft-3" />
          <span className="block h-[26px] w-[300px] rounded-pill bg-[#DCDAE8]" />
          <span className="block h-[26px] w-[220px] rounded-pill bg-[#DCDAE8]" />
          <span className="block h-[120px] rounded-18 border border-line bg-card" />
          <span className="block h-[88px] rounded-18 border border-line bg-card" />
          <span className="block h-[160px] rounded-18 border border-line bg-card" />
          <span className="block h-[88px] rounded-18 border border-line bg-card" />
        </div>
      </div>
      <span aria-hidden="true" className="absolute inset-0 bg-[rgba(31,29,54,0.5)]" />
      {children}
    </div>
  )
}
