'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { sendGuidanceToFamily } from '@/app/t/[classId]/guidance/actions'
import { Button } from '../ui/Button'
import { ReviewDocIcon } from '../ui/icons'

/** A guidance card Jemma wrote for one learner's family, waiting for the teacher to send it. The text is the card as the family will read it. */
export type GuidanceNeed = {
  classId: string
  childId: string
  firstName: string
  headline: string
  focus: { title: string; why: string }[]
  lookingAhead: string
}

/** The words of the item, the same on the phone and on the laptop. */
export function guidanceWords(g: Pick<GuidanceNeed, 'firstName' | 'lookingAhead'>) {
  return {
    title: `Guidance for ${g.firstName}'s family`,
    note: 'Jemma wrote this card. The family sees it only after you send it.',
    lookingAhead: `Looking ahead: ${g.lookingAhead}`,
    button: 'Send to family',
  }
}

/**
 * One item of Needs you with the card's text in plain view and one button. Nothing else can be done to the card here: it is sent as it is.
 * The button shows the pending state while the action runs, and the screen is read again when it is done (the item is gone then).
 */
export function GuidanceNeedItem({ guidance, wide = false }: { guidance: GuidanceNeed; wide?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const words = guidanceWords(guidance)

  const send = () =>
    start(async () => {
      setError(null)
      const result = await sendGuidanceToFamily(guidance.classId, guidance.childId)
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.refresh()
    })

  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-3.5 rounded-14 bg-card p-3 text-ink ${wide ? 'flex-[1_1_100%]' : ''}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-coral-tint">
          <ReviewDocIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 id={titleId} className="m-0 text-[16px] leading-[1.3] font-semibold">
            {words.title}
          </h3>
          <p className="m-0 text-[14px] leading-[1.4] text-body">{words.note}</p>
        </span>
      </div>
      <div className="flex flex-col gap-2.5 text-[15px] leading-[1.45]">
        <p className="m-0 font-semibold text-pretty">{guidance.headline}</p>
        {guidance.focus.length > 0 ? (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {guidance.focus.map((f) => (
              <li key={f.title} className="flex flex-col gap-0.5">
                <span className="font-semibold text-pretty">{f.title}</span>
                <span className="text-body text-pretty">{f.why}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="m-0 text-body text-pretty">{words.lookingAhead}</p>
      </div>
      <Button size="md" pending={pending} onClick={send} className="w-full !h-auto min-h-[52px] !px-5 py-3">
        {words.button}
      </Button>
      {error ? (
        <p role="alert" className="m-0 text-[14px] leading-[1.4] text-[#B3261E]">
          {error}
        </p>
      ) : null}
    </section>
  )
}
