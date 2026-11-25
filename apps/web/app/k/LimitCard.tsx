'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { askForPlan } from './plan-actions'

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(22,22,22,0.06)]'
const big = 'flex min-h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink disabled:opacity-60'

export type LimitCardProps = {
  kind: 'free' | 'plan'
  limit: number
  /** "1 Dec": when a family's month starts again (a plan only). */
  resets: string
  /** The first linked parent's first name, or null when no parent is linked. */
  parent: string | null
  /** False on the biggest plan: there is no bigger plan to ask for. */
  canAsk: boolean
}

/**
 * P161: the card in place of the practice card when a learner has no practice left: today's 2 free ones, or the family's pool of the month. Lessons
 * stay free, and it says so. With a linked parent, one button asks that parent for a plan (a note in the parent's app); with none, a link to Me,
 * where the learner's code for a parent is.
 */
export function LimitCard({ kind, limit, resets, parent, canAsk }: LimitCardProps) {
  const [told, setTold] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const ask = () =>
    start(async () => {
      const res = await askForPlan()
      if (res.ok) {
        setTold(res.told.join(' and '))
        setError(null)
      } else setError(res.message)
    })
  return (
    <section aria-labelledby="practice-limit" className={`${card} gap-3`}>
      <span className="text-[14px] font-semibold text-red-text">Practice</span>
      <h2 id="practice-limit" className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">
        {kind === 'free' ? "That's your 2 practices for today." : `Your family's ${limit} practices for this month are used.`}
      </h2>
      <p className="m-0 text-[16px] leading-[1.45] text-body">
        {kind === 'free' ? 'Come back tomorrow for 2 more. Every lesson is still free.' : `A new month starts on ${resets}. Every lesson is still free.`}
      </p>
      {canAsk ? (
        <>
          <div className="my-1 h-px bg-soft" />
          <p className="m-0 text-[17px] font-semibold">Want more practice?</p>
          {told ? (
            <p role="status" className="m-0 rounded-18 bg-green-tint px-4 py-3.5 text-[16px] leading-[1.45] font-semibold">
              Sent to {told}. {told.includes(' and ') ? 'They see' : `${told} sees`} it in Jemma.
            </p>
          ) : parent ? (
            <button type="button" className={big} onClick={ask} disabled={pending}>
              {kind === 'free' ? `Ask ${parent} for a plan` : `Ask ${parent} for a bigger plan`}
            </button>
          ) : (
            <Link href="/k/me" className={`${big} no-underline`}>
              Ask a parent to join
            </Link>
          )}
          {error ? (
            <p role="alert" className="m-0 text-[15px] text-red-text">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
