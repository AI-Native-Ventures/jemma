'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FractionText } from '../k/session/_parts/Frac'
import { LearnDiagram } from '../k/session/_parts/LearnDiagram'
import { QuestionScreen } from '../k/session/_parts/QuestionScreen'
import { Results } from '../k/session/_parts/Results'
import { answerText } from '../k/session/[sessionId]/logic'
import { TOUR_QUESTIONS, TOUR_TOPIC_NAME, tourLessonForChild, tourQuestionsForChild } from './data/lesson'
import { TOUR_LEARNER } from './data/topics'
import { reviewTour, saveTourResult, type Typed } from './outcome'
import { TourStepHeader } from './TourStepHeader'

/** How long the right answer stays on the screen after Skip, before the next question. */
export const SKIP_MS = 1500

type Phase = 'learn' | 'try' | 'results'

/** The column of every screen of the session: as wide as a phone, in the middle of a laptop screen, with the step bar inside it. */
const column = 'mx-auto flex w-full max-w-[560px] flex-1 flex-col'
const bigButton = 'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-18 px-5 py-3 text-center text-[19px] font-bold text-balance no-underline'

/** The right answer, on top of the question for a moment: "Answer:" and the answer drawn as maths. */
function Reveal({ answer }: { answer: string }) {
  return (
    <div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-5">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-3 rounded-[26px] border border-line bg-card px-6 py-8 text-center shadow-[0_8px_24px_rgba(31,29,54,0.12)]">
        <span className="text-[17px] font-semibold text-body">Answer:</span>
        <span className="text-[34px] leading-[1.2] font-bold [overflow-wrap:anywhere]">
          <FractionText text={answer} size={38} rule={3} gap={4} side={5} typeset="all" />
        </span>
      </div>
    </div>
  )
}

/**
 * The learner's way through the saved lesson: read it, answer Question 1, skip the others (each skip shows the right answer for a moment and counts as
 * wrong), then the results with every question explained, and a button to the teacher's view. The screens are the app's own (the lesson pictures, the
 * question screen with its maths editor, the results); only the data is saved, and nothing is sent anywhere.
 */
export function TourSession() {
  const lesson = useMemo(tourLessonForChild, [])
  const questions = useMemo(tourQuestionsForChild, [])
  const [phase, setPhase] = useState<Phase>('learn')
  const [at, setAt] = useState(0)
  const [typed, setTyped] = useState<Typed>([])
  const [reveal, setReveal] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  // Each screen starts at its top: the lesson is long, and the learner taps I'm ready at the bottom of it.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phase, at])

  const review = useMemo(() => reviewTour(TOUR_QUESTIONS, typed), [typed])

  /** Keeps what the learner did on this question (null for a skip) and moves on: to the next question, or to the results after the last. */
  const record = (value: string | null) => {
    // A tap on Next behind the answer card (a key press) does not count.
    if (reveal !== null && value !== null) return
    const next = [...typed.slice(0, at), value]
    setTyped(next)
    if (at + 1 < questions.length) return void setAt(at + 1)
    saveTourResult(sessionStorage, reviewTour(TOUR_QUESTIONS, next).map((m) => m.correct ?? false))
    setPhase('results')
  }

  const skip = () => {
    if (reveal !== null) return
    // The maths keyboard of the question goes down, so the answer is not hidden behind it.
    ;(window as unknown as { mathVirtualKeyboard?: { hide: () => void } }).mathVirtualKeyboard?.hide()
    setReveal(answerText(TOUR_QUESTIONS[at]!, TOUR_QUESTIONS[at]!.answer))
    timer.current = setTimeout(() => {
      setReveal(null)
      record(null)
    }, SKIP_MS)
  }

  const again = () => {
    clearTimeout(timer.current)
    setReveal(null)
    setTyped([])
    setAt(0)
    setPhase('learn')
  }

  const q = questions[at]!
  return (
    <div className="flex flex-1 flex-col bg-ground font-sans leading-[normal]">
      <div className={column}>
        <TourStepHeader current={phase === 'learn' ? 1 : phase === 'try' ? 2 : 3} closeLabel={phase === 'results' ? 'Close' : 'Stop for now'} />
        {phase === 'learn' ? <LearnDiagram lesson={lesson} onReady={() => setPhase('try')} /> : null}
        {phase === 'try' ? (
          <>
            <QuestionScreen key={q.position} q={q} topic={TOUR_TOPIC_NAME} busy={false} onAnswer={record} />
            <div className="px-5 pb-7">
              <button
                type="button"
                onClick={skip}
                disabled={reveal !== null}
                className="flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-18 border-2 border-edge bg-card px-5 py-3 text-center text-[18px] font-semibold text-ink disabled:cursor-default disabled:opacity-60"
              >
                Skip
              </button>
            </div>
          </>
        ) : null}
        {phase === 'results' ? (
          <>
            <Results firstName={TOUR_LEARNER} missed={review} />
            <div className="flex flex-col gap-3 px-5 pb-[26px]">
              <Link href="/tour/teacher" className={`${bigButton} border-0 bg-ink text-white`}>
                Switch to the teacher&apos;s view
              </Link>
              <button type="button" onClick={again} className={`${bigButton} border-2 border-edge bg-card text-ink`}>
                Start again
              </button>
            </div>
          </>
        ) : null}
      </div>
      {reveal !== null ? <Reveal answer={reveal} /> : null}
    </div>
  )
}
