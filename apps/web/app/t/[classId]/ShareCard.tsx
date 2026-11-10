'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Button, Card, GemIcon } from '@/components/ui'
import type { ShareCardData } from '@/lib/data/p50b'
import { shareTest } from './snap/actions'

/** The words of the card, the same on every screen that shows it. */
export function shareCardWords(card: Pick<ShareCardData, 'marked' | 'waiting'>) {
  return {
    title: 'Results are ready. Parents see nothing yet.',
    marked: `${card.marked} ${card.marked === 1 ? 'paper' : 'papers'} marked`,
    waiting: card.waiting > 0 ? `${card.waiting} still ${card.waiting === 1 ? 'needs' : 'need'} you. You can share now and those follow when you have checked them.` : null,
    button: 'Share with parents',
  }
}

/**
 * Shown while a test is held and has at least one marked paper: nothing reaches a parent or a learner until the teacher taps.
 * One tap per test. The button shows the pending state while the action runs, and the screen is read again when it is done.
 */
export function ShareCard({ classId, card, className = '' }: { classId: string; card: ShareCardData; className?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const words = shareCardWords(card)

  const share = () =>
    start(async () => {
      setError(null)
      const result = await shareTest(classId, card.testId)
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.refresh()
    })

  return (
    <Card as="section" aria-labelledby={titleId} radius={20} className={`gap-3 ${className}`}>
      <div className="flex items-start gap-2.5">
        <GemIcon size={14} className="mt-[7px] flex-none" />
        <h2 id={titleId} className="m-0 text-[18px] leading-[1.3] font-semibold text-pretty">
          {words.title}
        </h2>
      </div>
      <div className="flex flex-col gap-1 pl-6 text-[15px] leading-[1.45] text-body">
        <p className="m-0 font-semibold text-ink">{words.marked}</p>
        {words.waiting ? <p className="m-0 text-pretty">{words.waiting}</p> : null}
      </div>
      <Button size="md" pending={pending} onClick={share} className="w-full">
        {words.button}
      </Button>
      {error ? (
        <p role="alert" className="m-0 text-[14px] leading-[1.4] text-[#B3261E]">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
