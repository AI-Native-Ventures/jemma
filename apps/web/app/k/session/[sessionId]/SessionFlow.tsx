'use client'

import { PAPER_QUESTION_COUNT } from '@jemma/profiling/logic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import { AppHeader } from '../_parts/AppHeader'
import { LearnAudio } from '../_parts/LearnAudio'
import { LearnCards } from '../_parts/LearnCards'
import { LearnDiagram } from '../_parts/LearnDiagram'
import { PaperChoice, PaperFailed, PaperReading, PaperSheet } from '../_parts/Paper'
import { LoadError, Loading, Progress } from '../_parts/Status'
import { QuestionScreen } from '../_parts/QuestionScreen'
import { Results } from '../_parts/Results'
import { StepHeader } from '../_parts/StepHeader'
import { answer, beginSession, finishSession, paperProgress, type SnapResult } from './actions'
import type { QuestionForChild } from './logic'
import type { FinishedSession, LessonForChild } from './types'

type Phase =
  | 'loading'
  | 'error'
  | 'warmup'
  | 'learn'
  | 'choose'
  | 'paper'
  | 'reading'
  | 'failed'
  | 'try'
  | 'finishing'
  | 'results'
  | 'progress'

/** How often the screen asks again while Jemma reads a photo (the way the practice card asks). */
const ASK_AGAIN_MS = 3000

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
  /** A photo is being sent, and why the last one did not go. */
  const [sending, setSending] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
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
      const { lesson: l, paper } = await beginSession(sessionId)
      setLesson(l)
      if (!l.first) return void finish()
      // The child already sent a photo: wait for it (or offer what to do when it could not be read), do not start the questions again.
      if (l.first.phase === 'try' && (paper === 'reading' || paper === 'failed')) {
        setPending(l.first)
        setPhase(paper)
        return
      }
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

  /** The questions on the screen: today's flow, unchanged. */
  const startScreen = () => {
    if (!pending) return void finish()
    setQ(pending)
    setPending(null)
    setPhase('try')
  }

  /** After Learn. Before the first Try question (while no Try answer is stored) the child chooses how to answer. */
  const startTry = () => {
    if (!pending) return void finish()
    if (pending.index === 1 && lesson?.paper?.length === PAPER_QUESTION_COUNT) return void setPhase('choose')
    startScreen()
  }

  const sendPhoto = async (file: File) => {
    setSending(true)
    setPhotoError(null)
    try {
      const form = new FormData()
      form.append('file', await shrinkPhoto(file))
      const res = await postFiles<SnapResult>('k', 'snapPractice', [sessionId], form)
      if (res.ok) setPhase('reading')
      else setPhotoError(res.message)
    } catch {
      setPhotoError('That did not upload. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  // While Jemma reads the photo: ask every 3 seconds. A closed session shows the results, a read that failed shows what to do. A question
  // that cannot be answered (the connection) is asked again at the next tick.
  useEffect(() => {
    if (phase !== 'reading') return
    let live = true
    const id = setInterval(async () => {
      try {
        const progress = await paperProgress(sessionId)
        if (!live) return
        if (progress === 'done') void finish()
        else if (progress === 'failed') setPhase('failed')
      } catch {
        // asked again in 3 seconds
      }
    }, ASK_AGAIN_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [phase, sessionId, finish])

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

  const step = phase === 'warmup' ? 0 : phase === 'learn' ? 1 : phase === 'try' || phase === 'choose' || phase === 'paper' || phase === 'reading' || phase === 'failed' ? 2 : 3
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
      {phase === 'choose' ? <PaperChoice onPaper={() => setPhase('paper')} onScreen={startScreen} /> : null}
      {phase === 'paper' ? <PaperSheet questions={lesson?.paper ?? []} busy={sending} error={photoError} onPhoto={sendPhoto} onScreen={startScreen} /> : null}
      {phase === 'reading' ? <PaperReading /> : null}
      {phase === 'failed' ? <PaperFailed busy={sending} error={photoError} onPhoto={sendPhoto} onScreen={startScreen} /> : null}
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
