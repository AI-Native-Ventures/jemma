'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import type { QuestionForChild } from '../session/[sessionId]/logic'
import { QuestionScreen } from '../session/_parts/QuestionScreen'
import { LevelDone, LevelFailed, LevelStart, LevelWriting } from './_parts/LevelScreens'
import { answerLevel, retryLevelCheck, startLevelCheck } from './actions'

// P163: the level check on the learner's screen. The server says where the check is (`state`); from the first question on, this screen asks the server
// for each next question and never learns an answer.

export type LevelFlowProps =
  | { state: 'start' | 'writing' | 'failed'; firstName: string; grade: number }
  | { state: 'ready'; firstName: string; grade: number; checkId: string; question: QuestionForChild }
  | { state: 'done'; firstName: string; grade: number; first: string | null }

/** How often the page looks again while Jemma writes the questions. */
const LOOK_AGAIN_MS = 3000

export function LevelFlow(props: LevelFlowProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState<QuestionForChild | null>(props.state === 'ready' ? props.question : null)
  const [done, setDone] = useState<{ first: string | null } | null>(props.state === 'done' ? { first: props.first } : null)

  useEffect(() => {
    if (props.state !== 'writing') return
    const timer = setInterval(() => router.refresh(), LOOK_AGAIN_MS)
    return () => clearInterval(timer)
  }, [props.state, router])

  const run = (act: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      try {
        const res = await act()
        if (res.ok) {
          setError(null)
          router.refresh()
        } else setError(res.message)
      } catch {
        setError('Something went wrong. Try again.')
      }
    })

  const answer = (checkId: string, q: QuestionForChild, value: string | null, seconds: number) =>
    start(async () => {
      try {
        const step = await answerLevel(checkId, q.position, value, seconds)
        setError(null)
        if (step.done) setDone(step.done)
        else if (step.next) setQuestion(step.next)
      } catch {
        setError('Your answer was not saved. Try again.')
      }
    })

  if (done) return <LevelDone firstName={props.firstName} first={done.first} />
  if (props.state === 'start')
    return (
      <>
        <LevelStart firstName={props.firstName} grade={props.grade} pending={pending} onStart={() => run(startLevelCheck)} />
        {error ? <p role="alert" className="m-0 px-5 pb-6 text-center text-[15px] text-red-text">{error}</p> : null}
      </>
    )
  if (props.state === 'writing') return <LevelWriting />
  if (props.state === 'failed') return <LevelFailed pending={pending} onRetry={() => run(retryLevelCheck)} error={error} />
  if (props.state === 'ready' && question)
    return (
      <>
        <QuestionScreen
          key={question.position}
          q={question}
          busy={pending}
          onAnswer={(value, seconds) => answer(props.checkId, question, value, seconds)}
          note="No marks. Just do your best."
          skip={{ label: "I don't know yet", onSkip: (seconds) => answer(props.checkId, question, null, seconds) }}
        />
        {error ? <p role="alert" className="m-0 px-5 pb-6 text-center text-[15px] text-red-text">{error}</p> : null}
      </>
    )
  return null
}
