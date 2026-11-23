'use client'

import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'
import { useState, useTransition } from 'react'
import { CheckIcon } from '@/components/ui/icons'
import { decideJoinRequest } from '../actions'

const NEW = 'new'
const choiceBase = 'flex min-h-[52px] w-full cursor-pointer items-center rounded-14 border-[1.5px] px-5 py-3 text-left text-[17px] leading-[1.25] font-semibold text-balance'

/**
 * Who the learner is, then yes or no. "This is {name}" for each learner of the class who has no login yet, and "Add as a new learner"; the one that
 * is chosen is filled and marked with aria-pressed. "Yes, approve" waits for a choice. A refusal is shown in the action's own words.
 */
export function Decision({ classId, requestId, name, candidates, match }: { classId: string; requestId: string; name: string; candidates: { childId: string; name: string }[]; match: string | null }) {
  const [choice, setChoice] = useState<string | null>(match ?? (candidates.length === 0 ? NEW : null))
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const decide = (d: 'approved' | 'declined') =>
    start(async () => {
      setError(null)
      const picked = choice === null ? undefined : choice === NEW ? ({ kind: 'new' } as const) : ({ kind: 'existing', childId: choice } as const)
      const res = await decideJoinRequest(classId, requestId, d, picked)
      if (res && !res.ok) setError(res.message)
    })

  const options = [...candidates.map((c) => ({ id: c.childId, label: `This is ${c.name}` })), { id: NEW, label: 'Add as a new learner' }]

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="who" className="flex flex-col gap-2.5">
        <h2 id="who" className="m-0 text-[17px] font-semibold">
          Who is {name}?
        </h2>
        <div role="group" aria-labelledby="who" className="flex flex-col gap-2">
          {options.map((o) => (
            <button key={o.id} type="button" aria-pressed={choice === o.id} onClick={() => setChoice(o.id)} className={`${choiceBase} ${choice === o.id ? 'border-green bg-green text-white' : 'border-ink bg-card text-ink'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </section>
      <div className="flex flex-col gap-2">
        {error ? <p role="alert" className="m-0 text-center text-[14px] text-red-text">{error}</p> : null}
        <button type="button" disabled={pending || choice === null} onClick={() => decide('approved')} className="flex min-h-[52px] items-center justify-center gap-2 rounded-14 bg-green px-5 py-3 text-center text-[17px] font-semibold text-balance text-white disabled:opacity-50">
          <IconLabel gap={8} icon={<CheckIcon size={20} className="text-white" />}>
            Yes, approve
          </IconLabel>
        </button>
        <PendingButton pending={pending} type="button" disabled={pending} onClick={() => decide('declined')} className="flex min-h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink disabled:opacity-50">
          No, decline
        </PendingButton>
      </div>
    </div>
  )
}
