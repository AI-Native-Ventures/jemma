'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppHeader } from '../_parts/AppHeader'
import { LearnAudio } from '../_parts/LearnAudio'
import { LearnCards } from '../_parts/LearnCards'
import { LearnDiagram } from '../_parts/LearnDiagram'
import { LoadError, Loading, Progress } from '../_parts/Status'
import { QuestionScreen } from '../_parts/QuestionScreen'
import { Results } from '../_parts/Results'
import { StepHeader } from '../_parts/StepHeader'
import { answer, beginSession, finishSession } from './actions'
import type { QuestionForChild } from './logic'
import type { FinishedSession, LessonForChild } from './types'

type Phase = 'loading' | 'error' | 'warmup' | 'learn' | 'try' | 'finishing' | 'results' | 'progress'

export type SessionFlowProps = {
  sessionId: string
  firstName: string
  warmup: QuestionForChild[]
  tryCount: number
  topic: string
}

const learnNote = (topic: string, format?: LessonForChild['format']) =>
  format === 'audio' ? 'Recording your memo' : format === 'reading' ? 'Writing your cards' : /fraction/i.test(topic) ? 'Drawing your fraction bars' : 'Drawing your pictures'

export function SessionFlow({ sessionId, firstName, warmup, tryCount, topic }: SessionFlowProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [lesson, setLesson] = useState<LessonForChild | null>(null)
  const [q, setQ] = useState<QuestionForChild | null>(null)
  /** The question after the warm-up, held while the child learns. */
  const [pending, setPending] = useState<QuestionForChild | null>(null)
  const [card, setCard] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<FinishedSession | null>(null)
  const started = useRef(false)

  const finish = useCallback(async () => {
    setPhase('finishing')
    try {
      setDone(await finishSession(sessionId))
      setPhase('results')
    } catch {
      setPhase('error')
    }
  }, [sessionId])

  const begin = useCallback(async () => {
    setPhase('loading')
    try {
      const { lesson: l } = await beginSession(sessionId)
      setLesson(l)
      if (!l.first) return void finish()
      if (l.first.phase === 'warmup') {
        setQ(l.first)
        setPhase('warmup')
      } else {
        setPending(l.first)
        setPhase('learn')
      }
    } catch {
      setPhase('error')
    }
  }, [sessionId, finish])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void begin()
  }, [begin])

  const submit = async (value: string, seconds: number) => {
    if (!q) return
    setBusy(true)
    try {
      const { next } = await answer(sessionId, q.position, value, seconds)
      if (q.phase === 'warmup') {
        if (next?.phase === 'warmup') return void setQ(next)
        setPending(next)
        setQ(null)
        if (lesson) setPhase('learn')
        else await begin()
      } else if (next) {
        setQ(next)
      } else {
        await finish()
      }
    } catch {
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  const startTry = () => {
    if (!pending) return void finish()
    setQ(pending)
    setPending(null)
    setPhase('try')
  }

  const toWarmup = () => {
    if (warmup.length === 0) return
    setQ(warmup[0]!)
    setPhase('warmup')
  }

  if (phase === 'loading' || phase === 'error') {
    return (
      <div className="flex flex-1 flex-col leading-[normal]">
        <AppHeader firstName={firstName} />
        {phase === 'loading' ? (
          <Loading warmup={warmup.length} tries={tryCount} learnNote={learnNote(topic, lesson?.format)} />
        ) : (
          <LoadError onRetry={() => void (lesson ? (q ? setPhase(q.phase) : finish()) : begin())} warmupHref={!lesson && warmup.length > 0 ? toWarmup : undefined} />
        )}
      </div>
    )
  }

  const step = phase === 'warmup' ? 0 : phase === 'learn' ? 1 : phase === 'try' ? 2 : 3
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground font-sans leading-[normal] lg:static lg:z-auto lg:min-h-dvh lg:overflow-visible">
      {phase === 'progress' ? (
        <header className="flex items-center justify-start pt-2.5 pr-[18px] pb-1.5 pl-2">
          <button type="button" aria-label="Close" onClick={() => router.push('/k')} className="flex size-11 cursor-pointer items-center justify-center rounded-12 border-0 bg-transparent text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
      ) : (
        <StepHeader current={step} closeLabel={phase === 'results' ? 'Close' : 'Stop for now'} />
      )}
      {(phase === 'warmup' || phase === 'try') && q ? <QuestionScreen key={q.position} q={q} busy={busy} onAnswer={submit} /> : null}
      {phase === 'learn' && lesson ? (
        lesson.format === 'diagram' && lesson.diagram ? (
          <LearnDiagram lesson={lesson} onReady={startTry} />
        ) : lesson.format === 'audio' && lesson.audio ? (
          <LearnAudio lesson={lesson} firstName={firstName} onReady={startTry} />
        ) : lesson.cards?.length ? (
          <LearnCards
            lesson={lesson}
            card={card}
            onBack={() => setCard((c) => Math.max(0, c - 1))}
            onNext={() => (card >= lesson.cards!.length - 1 ? startTry() : setCard((c) => c + 1))}
          />
        ) : (
          <div className="flex flex-1 flex-col gap-4 p-5">
            <h1 className="m-0 text-[28px] font-bold">{lesson.title}</h1>
            <button type="button" onClick={startTry} className="h-[60px] rounded-18 border-0 bg-ink text-[19px] font-bold text-white">I&apos;m ready</button>
          </div>
        )
      ) : null}
      {phase === 'finishing' ? <div role="status" className="flex flex-1 items-center justify-center text-[18px] text-body">One moment...</div> : null}
      {phase === 'results' && done ? (
        <>
          <Results firstName={firstName} missed={done.missed} />
          <div className="px-5 pb-[26px]">
            <button type="button" onClick={() => setPhase('progress')} className="flex h-[60px] w-full cursor-pointer items-center justify-center rounded-18 border-0 bg-ink text-[19px] font-bold text-white">
              Got it
            </button>
          </div>
        </>
      ) : null}
      {phase === 'progress' && done ? <Progress done={done} onDone={() => router.push('/k/done')} /> : null}
    </div>
  )
}
