'use client'

import { useState, useTransition } from 'react'
import { makeMyParentCode } from './parent-code-actions'

const outline =
  'flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] leading-[1.25] font-semibold text-balance text-ink disabled:opacity-60'

/**
 * "Link a parent" (P114), on Me, for a learner who signed up on their own. One button makes a 6-character code and shows it with the line that says what to
 * do with it; "Make a new code" replaces it (the old one stops working). The code works for 7 days and works once. `initial` is the code the learner already
 * has, read on the server, or null. A refusal comes back as words.
 */
export function ParentCodeCard({ initial }: { initial: string | null }) {
  const [code, setCode] = useState<string | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const make = () => {
    setError(null)
    start(async () => {
      const made = await makeMyParentCode()
      if (made.ok) setCode(made.code)
      else setError(made.message)
    })
  }

  return (
    <section aria-labelledby="link-parent" className="flex flex-col gap-3.5 rounded-[24px] border border-line bg-card p-[18px] leading-[normal] text-ink">
      <div className="flex flex-col gap-1">
        <h2 id="link-parent" className="m-0 text-[19px] font-semibold">
          Link a parent
        </h2>
        <p className="m-0 text-[15px] leading-[1.45] text-body">
          {code ? 'Give this code to your parent or guardian. It works for 7 days.' : 'A parent or guardian can follow how you practise, and practise with you. Make a code and give it to them.'}
        </p>
      </div>
      {code ? (
        <div className="flex flex-col gap-1 rounded-14 bg-soft-2 px-4 py-3">
          <span className="text-[13px] text-body">Your code for a parent</span>
          <span aria-label={`Your code for a parent is ${code}`} className="text-[34px] leading-[1.1] font-bold tracking-[0.16em]">
            {code}
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[15px] leading-[1.4] font-semibold text-coral-text">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={make} disabled={pending} className={outline}>
        {pending ? 'Making your code' : code ? 'Make a new code' : 'Make a code'}
      </button>
    </section>
  )
}
