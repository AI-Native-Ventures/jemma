'use client'

import { useState, useTransition } from 'react'
import { CheckIcon } from '@/components/ui/icons'
import { ComingSheet } from '../../../_p21-client'
import { decideLink } from '../actions'

export function Decision({ classId, linkId }: { classId: string; linkId: string }) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const decide = (d: 'approved' | 'declined') => start(() => decideLink(classId, linkId, d))
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending} onClick={() => decide('approved')} className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50">
        <CheckIcon size={20} className="text-white" />
        Yes, approve
      </button>
      <button type="button" disabled={pending} onClick={() => decide('declined')} className="flex h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink disabled:opacity-50">
        No, decline
      </button>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center self-center border-0 bg-transparent px-2 text-[15px] font-semibold text-ink underline underline-offset-[3px]">
        Not sure? Message her first
      </button>
      <ComingSheet open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
