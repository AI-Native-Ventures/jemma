'use client'

import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { startPractice } from './actions'

export type Choice = { topicId?: string | null; topicName: string }

const small = 'flex h-11 flex-none cursor-pointer items-center justify-center rounded-14 border-0 bg-ink px-4 text-[15px] font-semibold text-white disabled:opacity-60'
const big = 'flex min-h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-coral px-5 py-3 text-center text-[20px] font-bold text-balance text-ink sm:text-[24px] disabled:opacity-60'

/**
 * A Practise button: asks for a practice on what the learner chose (`startPractice` checks it on the server) and sends the learner to today,
 * where the card says Jemma is writing it. It shows it is working. A refusal or a failure is said in plain words, by `onMessage` when the
 * caller shows it (a row), else under the button.
 */
export function PractiseButton({ choice, label = 'Practise', size = 'small', onMessage }: { choice: Choice; label?: string; size?: 'small' | 'big'; onMessage?: (message: string | null) => void }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const tell = (text: string | null) => (onMessage ? onMessage(text) : setMessage(text))
  const run = () =>
    start(async () => {
      const res = await startPractice({ topicId: choice.topicId ?? undefined, topicName: choice.topicName })
      tell(res.ok ? null : res.message)
      if (res.ok) {
        router.push('/k')
        router.refresh()
      }
    })

  return (
    <>
      <PendingButton type="button" pending={pending} onClick={run} aria-label={label === 'Practise' ? `Practise ${choice.topicName}` : undefined} className={size === 'big' ? big : small}>
        {size === 'big' ? <IconLabel icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>}>{label}</IconLabel> : label}
      </PendingButton>
      {message ? <p role="alert" className="m-0 w-full text-center text-[14px] text-coral-text">{message}</p> : null}
    </>
  )
}

/**
 * One row of a list on "My maths" or on the home: a name, a line or two under it (a reason, a stage, the learner's own count), and a Practise
 * button. `locked` hides the button (tonight's lesson waits, or a practice is being written).
 */
export function PracticeRow({ choice, name, lines, locked }: { choice: Choice; name: string; lines: string[]; locked: boolean }) {
  const [message, setMessage] = useState<string | null>(null)
  return (
    <li className="flex flex-col gap-1 border-t border-soft py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[17px] leading-[1.3] font-semibold text-pretty">{name}</span>
          {lines.map((line) => (
            <span key={line} className="text-[14px] leading-[1.35] text-body">{line}</span>
          ))}
        </span>
        {locked ? null : <PractiseButton choice={choice} onMessage={setMessage} />}
      </div>
      {message ? <p role="alert" className="m-0 text-[14px] text-coral-text">{message}</p> : null}
    </li>
  )
}
