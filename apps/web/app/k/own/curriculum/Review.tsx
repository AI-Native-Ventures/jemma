'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'
import { approveOwnCurriculum, removeOwnTopic } from '../actions'
import type { OwnMapView } from '../format'
import { Title } from '../Screens'

const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'
const takeOut = 'flex min-h-11 flex-none cursor-pointer items-center justify-center rounded-14 border-0 bg-transparent px-3 text-[15px] font-semibold text-red-text disabled:opacity-60'
const approve = 'flex min-h-[68px] w-full cursor-pointer items-center justify-center rounded-20 border-0 bg-green px-5 py-3 text-center text-[20px] font-bold text-balance text-white sm:text-[22px] disabled:opacity-60'

/**
 * The review of the draft of an own curriculum, in the learner's shell: the terms and their topics (each with what it needs and, where Jemma was
 * not sure, why), what Jemma left out, a way to take a topic out and "These look right". Both taps ask the server (`removeOwnTopic`,
 * `approveOwnCurriculum`), then the screen looks again. A refusal is said in plain words under the button.
 */
export function Review({ review }: { review: OwnMapView }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const none = review.topicCount === 0

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const res = await action()
      setError(res.ok ? null : res.message)
      router.refresh()
    })

  return (
    <>
      <Title>Check your topics.</Title>
      <p className="m-0 text-[16px] leading-[1.45] text-body">{`${review.name} · Grade ${review.grade} · ${review.topicCount} ${review.topicCount === 1 ? 'topic' : 'topics'}`}</p>
      <p className="m-0 text-[17px] leading-[1.45] text-body">Take out any topic that does not belong. Then tap &quot;These look right&quot;.</p>
      {review.terms.map((t) => (
        <section key={t.term} aria-labelledby={`own-term-${t.term}`} className="flex flex-col gap-2.5">
          <h2 id={`own-term-${t.term}`} className="m-0 text-[17px] font-bold">Term {t.term}</h2>
          <ul className={list}>
            {t.topics.map((x) => (
              <li key={x.name} className="flex items-start gap-2 border-t border-soft py-2.5 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5">
                  <span className="text-[17px] leading-[1.3] font-semibold text-pretty">{x.name}</span>
                  {x.needs ? <span className="text-[14px] leading-[1.35] text-body">{x.needs}</span> : null}
                  {x.note ? <span className="text-[14px] leading-[1.35] text-red-text">{`Jemma is not sure. ${x.note}`}</span> : null}
                </span>
                <button type="button" disabled={pending} aria-label={`Take out ${x.name}`} onClick={() => run(() => removeOwnTopic(review.mapId, x.name))} className={takeOut}>
                  Take out
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {review.leftOut.length > 0 ? (
        <section aria-labelledby="own-left-out" className="flex flex-col gap-2.5">
          <h2 id="own-left-out" className="m-0 text-[17px] font-bold">Jemma left these out</h2>
          <ul className={list}>
            {review.leftOut.map((l) => (
              <li key={l.name} className="flex flex-col gap-0.5 border-t border-soft py-3 first:border-t-0">
                <span className="text-[17px] leading-[1.3] font-semibold text-pretty">{l.name}</span>
                <span className="text-[14px] leading-[1.35] text-body">{l.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="flex flex-col gap-2">
        <PendingButton type="button" pending={pending} disabled={none} onClick={() => run(() => approveOwnCurriculum(review.mapId))} className={approve}>
          <IconLabel
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            }
          >
            These look right
          </IconLabel>
        </PendingButton>
        {none ? <p className="m-0 text-center text-[15px] leading-[1.4] text-body">Keep at least one topic.</p> : null}
        {error ? <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-red-text">{error}</p> : null}
      </div>
    </>
  )
}
