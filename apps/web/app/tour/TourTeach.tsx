'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CHOICE_LETTERS, choiceLabel } from '@jemma/profiling/logic'
import { forScreen, type LessonAnswerResult, type StrippedQuestion } from '@/lib/teaching'
import { DELIVERIES, DELIVERY_LABEL, type Delivery } from '../k/learn/_parts/delivery'
import { LessonText } from '../k/learn/_parts/LessonText'
import { QuestionScreen } from '../k/session/_parts/QuestionScreen'
import { markTourPractice, tourPracticeCount, tourPracticeQuestion } from './data/library'
import { TOUR_TOPIC_NAME } from './data/lesson'
import { alsoMissedLine, groupMissed, learnsBest, learnsBestLine, questionWords, saveReteach, type PartOutcome } from './reteach'
import { TourLessonReader } from './TourLessonReader'

/** How many times a part is tried: the way chosen first, then one other way. */
export const MAX_TRIES = 2

type Stage = 'intro' | 'choose' | 'learn' | 'check' | 'feedback' | 'summary'
type Last = { wrote: string; res: LessonAnswerResult }

const column = 'mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-5 px-5 pt-6 pb-7'
const bigButton = 'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-18 px-5 py-3 text-center text-[19px] font-bold text-balance no-underline'
const primary = `${bigButton} border-0 bg-ink text-white`
const secondary = `${bigButton} border-2 border-edge bg-card text-ink`
const card = 'flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4'

/** What each way of learning offers, in a few words under its name. */
const HOW: Record<Delivery, string> = {
  read: 'The whole lesson in words, at your own speed.',
  pictures: 'Pictures first, with just a little text.',
  listen: 'Jemma reads it to you. The pictures stay.',
}

/** What the learner wrote, as words: a choice letter is the choice (a picture with no words is "Picture B"). */
function wroteOf(q: StrippedQuestion, value: string): string {
  const at = CHOICE_LETTERS.indexOf(value.trim().toUpperCase() as (typeof CHOICE_LETTERS)[number])
  return q.choices?.[at] !== undefined ? choiceLabel(q.choices[at]!, at) : value
}

/** The steps, the answer and the way, as the lesson's own questions show them after an answer. `full` also names the right answer. */
function Worked({ last, full }: { last: Last; full: boolean }) {
  const { res } = last
  return (
    <>
      <p className="m-0 text-[15px] text-body">You wrote:</p>
      <LessonText text={last.wrote} typeset="all" size={22} className="font-semibold" />
      {full || !res.steps ? (
        <>
          <p className="m-0 text-[15px] text-body">The answer is:</p>
          <LessonText text={res.answer} typeset="all" size={22} className="font-semibold" />
        </>
      ) : null}
      {res.steps ? (
        <ol aria-label="Steps" className="m-0 flex list-none flex-col gap-1 p-0">
          {res.steps.map((s, i) => (
            <li key={i}>
              <LessonText text={s} typeset="all" size={21} />
            </li>
          ))}
        </ol>
      ) : null}
      <LessonText text={res.rightWay} typeset="all" size={20} className="text-[16px] text-body" />
    </>
  )
}

/**
 * Step 4 of the tour, Teach again: Jemma looks at the questions that were missed, groups them into the parts of the library they belong to, and teaches each part
 * again in the way the learner picks (Read, Pictures or Listen). One question of that lesson's practice checks it: if it worked, the way is noted; if not, the learner
 * picks another way and gets a second question; after two tries the worked answer is shown and the next part starts. What Jemma finds is kept in the browser tab for
 * the teacher's page. The lessons, the voice and the marking are the library's own, run in the browser from the saved copy: nothing is sent anywhere.
 */
export function TourTeach({ correct, onAgain }: { correct: boolean[]; onAgain: () => void }) {
  const groups = useMemo(() => groupMissed(correct), [correct])
  const parts = groups.parts
  const [stage, setStage] = useState<Stage>('intro')
  const [at, setAt] = useState(0)
  const [delivery, setDelivery] = useState<Delivery>('read')
  const [tried, setTried] = useState<Delivery[]>([])
  const [last, setLast] = useState<Last | null>(null)
  const [done, setDone] = useState<PartOutcome[]>([])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [stage, at])

  const part = parts[at]
  const also = alsoMissedLine(groups.also)
  const missedCount = correct.filter((c) => !c).length

  const start = () => {
    if (parts.length > 0) return setStage('choose')
    saveReteach(sessionStorage, { parts: [] })
    setStage('summary')
  }

  const pick = (d: Delivery) => {
    setDelivery(d)
    setStage('learn')
  }

  const answer = (value: string) => {
    if (!part) return
    const index = Math.min(tried.length, tourPracticeCount(part.lesson) - 1)
    const q = tourPracticeQuestion(part.lesson, index)
    const res = markTourPractice(part.lesson, index, value)
    if (!q || !res) return
    setTried([...tried, delivery])
    setLast({ wrote: wroteOf(q, value), res })
    setStage('feedback')
  }

  /** The part is finished (it worked, or both tries are used): keep what happened, and go to the next part or to what Jemma found. */
  const finish = (worked: Delivery | null) => {
    if (!part) return
    const all = [...done, { lesson: part.lesson, label: part.label, tried, worked }]
    setDone(all)
    if (at + 1 < parts.length) {
      setAt(at + 1)
      setTried([])
      setLast(null)
      return setStage('choose')
    }
    saveReteach(sessionStorage, { parts: all })
    setStage('summary')
  }

  if (stage === 'intro') {
    return (
      <main className={column}>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">Jemma looked at your answers</h1>
          <p className="m-0 text-[17px] leading-[1.45] text-body">
            {missedCount === 0
              ? 'You got every question right. Nothing to teach again.'
              : `You missed ${missedCount} of ${correct.length} questions. Here is what Jemma will go over with you, the biggest gap first.`}
          </p>
        </div>
        {parts.length > 0 ? (
          <ol aria-label="Parts to teach again" className="m-0 flex list-none flex-col gap-3 p-0">
            {parts.map((p, i) => (
              <li key={p.lesson} data-part={p.lesson} className={card}>
                <span className="text-[15px] font-semibold text-body">Part {i + 1}</span>
                <span className="text-[20px] leading-[1.25] font-bold">{p.label}</span>
                <span className="text-[16px] text-body">{questionWords(p.questions)} missed</span>
              </li>
            ))}
          </ol>
        ) : null}
        {also ? <p data-also="true" className="m-0 rounded-14 bg-soft-2 p-3 text-[16px] leading-[1.45]">{also}</p> : null}
        <div className="flex-1" />
        <button type="button" onClick={start} className={primary}>
          {parts.length > 0 ? 'Teach me again' : 'See what Jemma found'}
        </button>
      </main>
    )
  }

  if (stage === 'summary') {
    const best = learnsBest(done)
    return (
      <main className={column}>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">What Jemma found</h1>
          <p className="m-0 text-[17px] leading-[1.45] text-body">
            {done.length === 0 ? 'No part needed teaching again.' : 'Here is how each part went, and the way that worked.'}
          </p>
        </div>
        {done.length > 0 ? (
          <ul aria-label="How each part went" className="m-0 flex list-none flex-col gap-3 p-0">
            {done.map((p) => (
              <li key={p.lesson} data-part={p.lesson} data-worked={p.worked ?? 'none'} className={card}>
                <span className="text-[19px] leading-[1.25] font-bold">{p.label}</span>
                <span className="text-[16px]">{p.worked ? `Worked: ${DELIVERY_LABEL[p.worked]}` : 'Not yet'}</span>
                {p.tried.length > 1 || !p.worked ? <span className="text-[14px] text-body">Tried: {p.tried.map((d) => DELIVERY_LABEL[d]).join(', ')}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {done.length > 0 ? (
          <p data-learns-best="true" className="m-0 rounded-18 border border-line bg-soft-2 px-4 py-3.5 text-[20px] leading-[1.3] font-bold">
            {learnsBestLine(best)}
          </p>
        ) : null}
        <div className="flex-1" />
        <div className="flex flex-col gap-3">
          <Link href="/tour/teacher" className={primary}>
            Switch to the teacher&apos;s view
          </Link>
          <button type="button" onClick={onAgain} className={secondary}>
            Start again
          </button>
        </div>
      </main>
    )
  }

  if (!part) return null

  if (stage === 'choose') {
    return (
      <main className={column}>
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[15px] font-semibold text-body">Part {at + 1} of {parts.length}</p>
          <p className="m-0 text-[20px] leading-[1.25] font-bold">{part.label}</p>
          <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">How do you want to learn it?</h1>
          {tried.length > 0 ? (
            <p className="m-0 text-[16px] leading-[1.45] text-body">
              {tried.map((d) => DELIVERY_LABEL[d]).join(' and ')} did not work this time. Pick another way and try a new question.
            </p>
          ) : null}
        </div>
        <div role="group" aria-label="How you want to learn" className="flex flex-col gap-3">
          {DELIVERIES.map((d) => {
            const used = tried.includes(d)
            return (
              <button
                key={d}
                type="button"
                data-delivery={d}
                aria-label={used ? `${DELIVERY_LABEL[d]}, tried` : DELIVERY_LABEL[d]}
                disabled={used}
                onClick={() => pick(d)}
                className={`flex min-h-[88px] w-full flex-col items-start justify-center gap-0.5 rounded-[22px] px-5 py-3 text-left ${
                  used ? 'cursor-default border-2 border-dashed border-edge bg-soft-2 text-body' : 'cursor-pointer border-2 border-ink bg-card text-ink'
                }`}
              >
                <span className="text-[24px] leading-[1.2] font-bold">{DELIVERY_LABEL[d]}{used ? ' (tried)' : ''}</span>
                <span className="text-[15px] leading-[1.4] text-body">{HOW[d]}</span>
              </button>
            )
          })}
        </div>
      </main>
    )
  }

  if (stage === 'learn') {
    return (
      <TourLessonReader key={`${at}-${tried.length}`} position={part.lesson} delivery={delivery} onDelivery={setDelivery}>
        <button type="button" onClick={() => setStage('check')} className={primary}>
          Check what you learned
        </button>
      </TourLessonReader>
    )
  }

  if (stage === 'check') {
    const index = Math.min(tried.length, tourPracticeCount(part.lesson) - 1)
    const q = tourPracticeQuestion(part.lesson, index)
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
        <div className="flex flex-col gap-1 px-5 pt-[18px]">
          <p className="m-0 text-[15px] font-semibold text-body">Check · {part.label}</p>
          <p className="m-0 text-[16px] text-body">One question on what you just learned.</p>
        </div>
        {q ? <QuestionScreen key={`${at}-${tried.length}`} q={forScreen(q, 1, 1)} topic={TOUR_TOPIC_NAME} busy={false} onAnswer={answer} /> : null}
      </div>
    )
  }

  // feedback
  const right = last?.res.correct ?? false
  const usedAll = tried.length >= MAX_TRIES
  const lastPart = at + 1 >= parts.length
  const next = lastPart ? 'See what Jemma found' : 'Next part'
  return (
    <main className={column}>
      <div role="status" data-result={right ? 'right' : 'wrong'} className={`flex flex-col gap-3 rounded-[22px] border p-4 ${right ? 'border-line bg-soft-2' : 'border-[#FFC9BB] bg-coral-wash'}`}>
        <p className="m-0 text-[15px] font-semibold text-body">{part.label}</p>
        <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">{right ? `That worked: ${DELIVERY_LABEL[delivery]}` : usedAll ? 'Not yet' : 'Not quite'}</h1>
        {right ? (
          <>
            <p className="m-0 text-[17px]">Yes, that is right.</p>
            {last ? <LessonText text={last.res.answer} typeset="all" size={22} className="font-semibold" /> : null}
            <p className="m-0 text-[16px] text-body">Jemma will teach you this way again.</p>
          </>
        ) : last ? (
          <>
            {usedAll ? <p className="m-0 text-[16px] font-semibold">The worked answer</p> : <p className="m-0 text-[16px] font-semibold">Here is how it works</p>}
            <Worked last={last} full={usedAll} />
            {usedAll ? <p className="m-0 text-[16px] text-body">Jemma teaches this part again in your next practice.</p> : null}
          </>
        ) : null}
      </div>
      <div className="flex-1" />
      {right || usedAll ? (
        <button type="button" onClick={() => finish(right ? delivery : null)} className={primary}>
          {next}
        </button>
      ) : (
        <button type="button" onClick={() => setStage('choose')} className={primary}>
          Try it another way
        </button>
      )}
    </main>
  )
}
