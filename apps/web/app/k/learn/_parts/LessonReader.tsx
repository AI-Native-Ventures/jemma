'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { TeachingSource } from '@jemma/profiling/schemas'
import { sourceHref, type LibraryEntry, type TeachingLessonForChild } from '@/lib/teaching'
import { startTopicLesson } from '../actions'
import { LessonBlock } from './Block'
import { DeliverySwitch } from './DeliverySwitch'
import { readDelivery, saveDelivery, speechOf, type Delivery } from './delivery'
import { LessonPractice } from './LessonPractice'
import { LessonText, typesetFor } from './LessonText'
import { canSpeak, speakText, stopSpeaking } from './voice'

const primaryLink =
  'flex min-h-[60px] w-full items-center justify-center rounded-18 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white no-underline'
const secondaryLink =
  'flex min-h-[52px] w-full items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-4 py-2 text-center text-[17px] font-semibold text-balance text-ink no-underline'
const startButton =
  'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white'
const playAllButton = 'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-4 text-[16px] font-semibold text-ink'

export type LessonReaderProps = {
  topicId: string
  topicName: string
  grade: number
  entry: LibraryEntry
  /** How many lessons the topic has. */
  count: number
  lesson: TeachingLessonForChild
  source: TeachingSource
  /** The lesson after this one, or null at the last. */
  next: { position: number; title: string } | null
  /** The practice session the learner came from, so the way back to it is offered. */
  session: string | null
  /** The delivery the learner's best format gives. A choice kept on this device wins over it. */
  initialDelivery: Delivery
}

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 w-full overflow-hidden rounded-pill bg-soft-3">
      <div className="h-full rounded-pill bg-coral" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * One lesson: what it covers and its key words, then the blocks in order (an idea, a picture, a worked example, a question for the learner, the usual
 * mistake), a summary, the credit of the source, and then its practice. The delivery switch at the top (Read, Pictures, Listen) changes how the blocks are
 * shown, never which blocks there are. The choice is kept on this device; with none kept, the learner's best format opens the lesson.
 */
export function LessonReader({ topicId, topicName, grade, entry, count, lesson, source, next, session, initialDelivery }: LessonReaderProps) {
  const [delivery, setDelivery] = useState<Delivery>(initialDelivery)
  const [phase, setPhase] = useState<'learn' | 'practice'>('learn')
  const [read, setRead] = useState(0)
  const [practiced, setPracticed] = useState(0)
  const [voiceOk, setVoiceOk] = useState(false)
  const [speaking, setSpeaking] = useState<number | null>(null)
  const [playAll, setPlayAll] = useState(false)
  const [activeTry, setActiveTry] = useState<number | null>(null)
  const typeset = typesetFor(grade)
  const query = session ? `?session=${session}` : ''
  const listHref = `/k/learn/${topicId}${query}`
  const href = sourceHref(source.address)

  // On the device: the choice kept, whether it can speak, and the first open of the lesson (so the list says "Continue").
  useEffect(() => {
    const saved = readDelivery(window.localStorage)
    if (saved) setDelivery(saved)
    setVoiceOk(canSpeak())
    startTopicLesson(entry.id).catch(() => {})
    return stopSpeaking
  }, [entry.id])

  // How far down the lesson the learner is.
  useEffect(() => {
    if (phase !== 'learn') return
    const onScroll = () => {
      const page = document.documentElement
      const room = page.scrollHeight - page.clientHeight
      setRead(room > 0 ? Math.min(1, window.scrollY / room) : 1)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [phase])

  const stopAll = () => {
    stopSpeaking()
    setSpeaking(null)
    setPlayAll(false)
  }

  const choose = (d: Delivery) => {
    stopAll()
    setDelivery(d)
    saveDelivery(window.localStorage, d)
  }

  function speakAt(i: number, chain: boolean) {
    const block = lesson.blocks[i]
    if (!block) return
    setSpeaking(i)
    setPlayAll(chain)
    document.getElementById(`block-${i}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    speakText(speechOf(block), {
      onEnd: () => {
        if (chain && i + 1 < lesson.blocks.length) return speakAt(i + 1, true)
        setSpeaking(null)
        setPlayAll(false)
      },
      onError: () => {
        setSpeaking(null)
        setPlayAll(false)
      },
    })
  }

  const toggle = (i: number) => (speaking === i ? stopAll() : speakAt(i, false))

  const startPractice = () => {
    stopAll()
    setPhase('practice')
    window.scrollTo?.(0, 0)
  }

  const progress = phase === 'learn' ? read : practiced
  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-ground">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-5 pt-2 pb-3">
          <div className="flex items-center gap-2">
            <Link href={listHref} aria-label="Close the lesson" className="-ml-2 flex size-11 flex-none items-center justify-center rounded-12 text-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Link>
            <p className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">{topicName}</p>
          </div>
          <Bar value={progress} label={phase === 'learn' ? 'How far you have read' : 'How far you are in the practice'} />
          <DeliverySwitch value={delivery} onChange={choose} />
        </div>
      </header>

      {phase === 'learn' ? (
        <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-5 pt-5 pb-8">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[15px] font-semibold text-body">
              Lesson {entry.position} of {count} · {lesson.minutes} min
            </p>
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{lesson.title}</h1>
          </div>

          <section aria-labelledby="goals" className="flex flex-col gap-2 rounded-[22px] border border-line bg-card p-4 lg:p-5">
            <h2 id="goals" className="m-0 text-[17px] font-bold">In this lesson</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lesson.objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-[7px] flex-none">
                    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
                  </svg>
                  <LessonText text={o} typeset={typeset} size={20} className="text-[17px]" />
                </li>
              ))}
            </ul>
          </section>

          {lesson.keyWords.length > 0 ? (
            <section aria-labelledby="words" className="flex flex-col gap-2 rounded-[22px] border border-line bg-card p-4 lg:p-5">
              <h2 id="words" className="m-0 text-[17px] font-bold">Key words</h2>
              <dl className="m-0 flex flex-col gap-2.5">
                {lesson.keyWords.map((k) => (
                  <div key={k.word} className="flex flex-col gap-0.5">
                    <dt className="text-[17px] font-semibold">{k.word}</dt>
                    <dd className="m-0 text-[16px] text-body">
                      <LessonText text={k.meaning} typeset={typeset} size={20} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {delivery === 'listen' ? (
            voiceOk ? (
              <button type="button" aria-pressed={playAll} onClick={() => (playAll ? stopAll() : speakAt(0, true))} className={playAllButton}>
                {playAll ? 'Stop reading' : 'Play all'}
              </button>
            ) : (
              <p className="m-0 rounded-14 bg-soft-2 p-3 text-[15px] leading-[1.45] text-body">This phone cannot read aloud here, so the words are shown.</p>
            )
          ) : null}

          {lesson.blocks.map((block, i) => (
            <LessonBlock
              key={i}
              index={i}
              block={block}
              delivery={delivery}
              typeset={typeset}
              voice={{ ok: voiceOk, playing: speaking === i, onToggle: () => toggle(i) }}
              topicLessonId={entry.id}
              topic={topicName}
              activeTry={activeTry}
              onOpenTry={setActiveTry}
            />
          ))}

          <section aria-labelledby="remember" className="flex flex-col gap-2 rounded-[22px] border border-line bg-card p-4 lg:p-5">
            <h2 id="remember" className="m-0 text-[17px] font-bold">Remember</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lesson.summary.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-[7px] flex-none">
                    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
                  </svg>
                  <LessonText text={s} typeset={typeset} size={20} className="text-[17px]" />
                </li>
              ))}
            </ul>
          </section>

          {source.credit ? (
            <p data-credit="true" className="m-0 text-[13px] leading-[1.45] text-muted">
              {source.credit}
              {href ? (
                <>
                  {' '}
                  <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-[3px]">
                    See the original
                  </a>
                </>
              ) : null}
            </p>
          ) : null}

          <button type="button" onClick={startPractice} className={startButton}>
            Start the practice
          </button>
        </main>
      ) : (
        <LessonPractice
          topicLessonId={entry.id}
          questions={lesson.practice}
          topic={topicName}
          typeset={typeset}
          onProgress={(answered, total) => setPracticed(total > 0 ? answered / total : 0)}
          after={
            <div className="flex flex-col gap-3">
              {next ? (
                <Link href={`/k/learn/${topicId}/${next.position}${query}`} className={primaryLink}>
                  Next lesson: {next.title}
                </Link>
              ) : null}
              <Link href={listHref} className={next ? secondaryLink : primaryLink}>
                Back to the lessons
              </Link>
              {session ? (
                <Link href={`/k/session/${session}`} className={secondaryLink}>
                  Back to your practice
                </Link>
              ) : null}
            </div>
          }
        />
      )}
    </div>
  )
}
