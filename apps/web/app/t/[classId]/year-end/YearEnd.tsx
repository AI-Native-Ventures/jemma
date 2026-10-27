'use client'

import { useState } from 'react'
import { CheckIcon } from '@/components/ui/icons'
import { ComingSheet } from '../../_p21-client'

export function YearEnd({ short, nextGrade, grade, csvHref }: { short: string; nextGrade: number; grade: number; csvHref: string }) {
  const [choice, setChoice] = useState<'up' | 'archive'>('up')
  const [open, setOpen] = useState(false)
  const on = 'border-2 border-ink'
  const off = 'border border-edge'
  return (
    <>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="absolute size-px overflow-hidden [clip:rect(0_0_0_0)]">What happens to {short}</legend>
        <button type="button" aria-pressed={choice === 'up'} onClick={() => setChoice('up')} className={`flex items-start gap-3.5 rounded-18 bg-card p-4 text-left text-ink ${choice === 'up' ? on : off}`}>
          <span className="flex flex-1 flex-col gap-1">
            <span className="text-[18px] font-semibold">Move up to Grade {nextGrade}</span>
            <span className="text-[15px] leading-[1.45] text-body">Learners keep their gaps, fixed topics and what helps. Their Grade {nextGrade} teacher sees them. Parents stay linked.</span>
          </span>
          {choice === 'up' ? (
            <span className="flex size-[26px] flex-none items-center justify-center rounded-pill bg-ink">
              <CheckIcon size={16} className="text-white" />
            </span>
          ) : (
            <span className="size-[26px] flex-none rounded-pill border-[1.5px] border-muted-2" />
          )}
        </button>
        <button type="button" aria-pressed={choice === 'archive'} onClick={() => setChoice('archive')} className={`flex items-start gap-3.5 rounded-18 bg-card p-4 text-left text-ink ${choice === 'archive' ? on : off}`}>
          <span className="flex flex-1 flex-col gap-1">
            <span className="text-[18px] font-semibold">Archive {short}</span>
            <span className="text-[15px] leading-[1.45] text-body">Read only. Nothing is deleted.</span>
          </span>
          {choice === 'archive' ? (
            <span className="flex size-[26px] flex-none items-center justify-center rounded-pill bg-ink">
              <CheckIcon size={16} className="text-white" />
            </span>
          ) : (
            <span className="size-[26px] flex-none rounded-pill border-[1.5px] border-muted-2" />
          )}
        </button>
      </fieldset>

      <p className="m-0 flex gap-2.5 rounded-14 bg-soft-2 px-3.5 py-3 text-[15px] leading-[1.45]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5D5A73" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        <span>Your notes stay in {short}&apos;s archive.</span>
      </p>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setOpen(true)} className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white">
          {choice === 'up' ? `Move ${short} up after the last day of term` : `Archive ${short} after the last day of term`}
        </button>
        <a href={csvHref} download className="flex h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[16px] font-semibold text-ink no-underline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
            <path d="M5 19.5h14" />
          </svg>
          Download {short}&apos;s marks (CSV)
        </a>
      </div>
      <ComingSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
