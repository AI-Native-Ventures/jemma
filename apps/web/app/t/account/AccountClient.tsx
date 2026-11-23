'use client'

import { PendingButton } from '@/components/ui/Button'
import { useState, useTransition } from 'react'
import { Sheet } from '@/components/ui'
import { ChevronRightIcon } from '@/components/ui/icons'
import { sendHelpMessage } from '../../(auth)/help/actions'
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
        <PendingButton pending={pending} type="button" disabled={pending || !value.trim()} onClick={() => start(async () => { await saveName(value); setOpen(false) })} className="flex min-h-[52px] items-center justify-center rounded-14 bg-green px-5 py-3 text-center text-[17px] font-semibold text-balance text-white disabled:opacity-50">
          Save
        </PendingButton>
      </Sheet>
    </>
  )
}

/**
 * "Delete my account". A teacher's classes hold the learners' marks and the parents' links, so the Jemma team deletes a teacher account by hand,
 * with the teacher: this sends the request (it reaches the team as a help message with the teacher's account on it).
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 border-0 bg-transparent p-0 text-[15px] font-semibold text-red-text underline underline-offset-[3px]">
        Delete my account
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={sent ? 'Request sent' : 'Delete your account?'}
        description={
          sent
            ? 'The Jemma team writes to you before anything is deleted.'
            : "Your classes hold your learners' marks and their parents' links, so the Jemma team deletes a teacher account with you, by hand. Send the request and the team writes to you."
        }
      >
        {error ? <p role="alert" className="m-0 text-[14px] text-red-text">{error}</p> : null}
        {sent ? (
          <button type="button" onClick={() => setOpen(false)} className="min-h-14 cursor-pointer rounded-14 border-0 bg-green px-5 py-3 text-center text-[17px] font-semibold text-white">
            Close
          </button>
        ) : (
          <PendingButton
            pending={pending}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const res = await sendHelpMessage({ kind: 'problem', text: 'Please delete my teacher account.', email: '', website: '' })
                if (res.ok) setSent(true)
                else setError(res.message)
              })
            }
            className="min-h-14 cursor-pointer rounded-14 border-0 bg-red-text px-5 py-3 text-center text-[17px] font-semibold text-white"
          >
            Send the request
          </PendingButton>
        )}
      </Sheet>
    </>
  )
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <PendingButton type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-5 py-2.5 text-center text-[17px] font-semibold text-balance text-ink">
        Sign out
      </PendingButton>
    </form>
  )
}
