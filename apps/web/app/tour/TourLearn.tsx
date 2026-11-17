'use client'

import { useEffect, useState } from 'react'
import { LessonInline, typesetFor } from '../k/learn/_parts/LessonText'
import type { Delivery } from '../k/learn/_parts/delivery'
import { tourLibraryEntries } from './data/library'
import { TOUR_GRADE, TOUR_LEARNER } from './data/topics'
import { TOUR_TOPIC_NAME } from './data/lesson'
import { TourLessonReader } from './TourLessonReader'

const startButton =
  'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white'
const skipButton =
  'flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-18 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink'

/**
 * Step 1 of the tour, Learn: the lessons of the library for this topic in order ("Learn it first", as the app lists them), each one opening in the reader
 * with the Read, Pictures and Listen switch. Lesson 1 is where the tour goes first; a button at the end of a lesson and one on the list go on to the questions.
 */
export function TourLearn({ onReady }: { onReady: () => void }) {
  const entries = tourLibraryEntries()
  const [open, setOpen] = useState<number | null>(null)
  const [delivery, setDelivery] = useState<Delivery>('read')
  // A screen starts at its top: a lesson is long, and the list is short.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [open])

  if (open !== null) {
    return (
      <TourLessonReader key={open} position={open} delivery={delivery} onDelivery={setDelivery} back={{ label: 'Back to the lessons', onClick: () => setOpen(null) }}>
        <button type="button" onClick={onReady} className={startButton}>
          Go to the questions
        </button>
        <button type="button" onClick={() => setOpen(null)} className={skipButton}>
          Back to the lessons
        </button>
      </TourLessonReader>
    )
  }

  const typeset = typesetFor(TOUR_GRADE)
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-5 pt-[18px] pb-[26px]">
      <p className="m-0 text-[15px] font-semibold text-body">Learn</p>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">Learn it first</h1>
        <p className="m-0 text-[17px] font-semibold">{TOUR_TOPIC_NAME}</p>
        <p className="m-0 text-[16px] leading-[1.45] text-body">
          Hi {TOUR_LEARNER}. Short lessons with worked examples. Read them, look at the pictures or listen. Then try five questions.
        </p>
      </div>
      <button type="button" onClick={() => setOpen(1)} className={startButton}>
        Start lesson 1
      </button>
      <ol aria-label="Lessons" className="m-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0">
        {entries.map((e) => (
          <li key={e.position} className="border-t border-soft first:border-t-0">
            <button
              type="button"
              onClick={() => setOpen(e.position)}
              className="flex min-h-[64px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-0 py-3 text-left text-ink"
            >
              <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-pill border-2 border-edge text-[16px] font-bold text-ink">
                {e.position}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[17px] leading-[1.3] font-semibold text-pretty">
                  <LessonInline text={e.title} typeset={typeset} size={20} />
                </span>
                <span className="text-[14px] leading-[1.35] text-body">{e.minutes} min</span>
              </span>
              <span aria-hidden="true" className="flex-none text-[22px] text-muted">&rsaquo;</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex-1" />
      <button type="button" onClick={onReady} className={skipButton}>
        I know this, go to the questions
      </button>
    </main>
  )
}
