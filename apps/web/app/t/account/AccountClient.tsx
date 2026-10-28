'use client'

import { PendingButton } from '@/components/ui/Button'
import { useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { ChevronRightIcon } from '@/components/ui/icons'
import { ComingSheet } from '../_p21-client'
import { saveName, signOut } from './actions'

export function EditDetails({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(name)
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="-mb-2 min-h-11 self-start border-0 bg-transparent p-0 text-[15px] font-semibold text-ink underline underline-offset-[3px]">
        Edit your details
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your details">
        <label htmlFor="your-name" className="text-[15px] font-medium">
          Your name
        </label>
        <input id="your-name" value={value} onChange={(e) => setValue(e.target.value)} className="h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[17px] text-ink" />
        <PendingButton pending={pending} type="button" disabled={pending || !value.trim()} onClick={() => start(async () => { await saveName(value); setOpen(false) })} className="flex h-[52px] items-center justify-center rounded-14 bg-ink text-[17px] font-semibold text-white disabled:opacity-50">
          Save
        </PendingButton>
      </Sheet>
    </>
  )
}

/** A settings row that opens the "Coming after the challenge" sheet. */
export function ComingRow({ title, sub, first }: { title: string; sub?: string; first?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`flex min-h-14 w-full items-center gap-3 bg-transparent py-1.5 text-left text-ink ${first ? 'border-0' : 'border-0 border-t border-soft'}`}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">{title}</span>
          {sub ? <span className="text-[13px] leading-[1.35] text-body">{sub}</span> : null}
        </span>
        <ChevronRightIcon className="flex-none" />
      </button>
      <ComingSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 border-0 bg-transparent p-0 text-[15px] font-semibold text-coral-text underline underline-offset-[3px]">
        Delete my account
      </button>
      <ComingSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <PendingButton type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink">
        Sign out
      </PendingButton>
    </form>
  )
}
