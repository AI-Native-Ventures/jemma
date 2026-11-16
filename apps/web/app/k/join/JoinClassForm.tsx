'use client'

import { PendingButton } from '@/components/ui/Button'
import { useState, useTransition } from 'react'
import { sendJoinRequest } from './actions'

/**
 * The code box and Send of "Join your school class". After a good code the card says who the learner is waiting for, at once; the page the server
 * draws next has the same line. A refusal is shown under the box in the action's own words.
 */
export function JoinClassForm({ declined }: { declined: boolean }) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = () =>
    start(async () => {
      setMessage(null)
      const res = await sendJoinRequest(code)
      if (res.ok) setSent(res.teacherName)
      else setMessage(res.message)
    })

  if (sent) return <p role="status" className="m-0 text-[17px] leading-[1.4] font-semibold">Waiting for {sent} to say yes.</p>

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      {declined ? <p className="m-0 text-[15px] leading-[1.4] text-body">Your teacher said no. Check the code and try again.</p> : null}
      <label htmlFor="join-code" className="text-[15px] font-medium">
        Your teacher&apos;s class code
      </label>
      <input
        id="join-code"
        name="code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={12}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="h-14 w-full rounded-14 border-2 border-ink bg-card px-4 text-[22px] font-semibold tracking-[0.14em] text-ink uppercase"
      />
      {message ? <p role="alert" className="m-0 text-[14px] leading-[1.4] text-coral-text">{message}</p> : null}
      <PendingButton
        pending={pending}
        type="submit"
        disabled={pending || !code.trim()}
        className="flex min-h-[52px] w-full items-center justify-center rounded-14 bg-ink px-5 py-3 text-center text-[17px] font-semibold text-balance text-white disabled:opacity-50"
      >
        Send
      </PendingButton>
    </form>
  )
}
