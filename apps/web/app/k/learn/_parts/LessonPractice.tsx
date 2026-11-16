'use client'

import { useState, type ReactNode } from 'react'
import { CHOICE_LETTERS, choiceLabel } from '@jemma/profiling/logic'
import { forScreen, type LessonAnswerResult, type StrippedQuestion } from '@/lib/teaching'
import { scoreLines } from '../../session/[sessionId]/logic'
import { CardQuestion } from '../../session/_parts/QuestionPrompt'
import { QuestionPicture } from '../../session/_parts/QuestionPicture'
import { QuestionScreen } from '../../session/_parts/QuestionScreen'
import type { TypesetMode } from '../../session/_parts/typeset'
import { answerLessonQuestion, finishTopicLesson } from '../actions'
import { LessonText } from './LessonText'

type Answered = { q: StrippedQuestion; wrote: string; res: LessonAnswerResult }

const retry =
  'flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-4 py-2 text-center text-[17px] font-semibold text-balance text-ink'

/** What the learner wrote, as words: a choice letter is the choice (a picture with no words is "Picture B"). */
const wroteOf = (q: StrippedQuestion, value: string): string => {
  const at = CHOICE_LETTERS.indexOf(value.trim().toUpperCase() as (typeof CHOICE_LETTERS)[number])
  return q.choices?.[at] !== undefined ? choiceLabel(q.choices[at]!, at) : value
}

export type LessonPracticeProps = {
  topicLessonId: string
  questions: StrippedQuestion[]
  topic: string
  typeset: TypesetMode
  /** How many questions are answered so far (the reader's progress bar). */
  onProgress: (answered: number, total: number) => void
  /** What comes under the score: the way on (next lesson, back to the lessons). */
  after: ReactNode
}

/**
 * The practice at the end of a lesson: the lesson's own questions, one at a time, easiest first, on the same question screen as a practice session. Each
 * answer is marked on the server (`answerLessonQuestion`) and the screen is told only whether it was right; the learner sees the score at the end and the
 * right way for each one missed. The score is saved with the lesson (`finishTopicLesson`), which ticks it on the lesson list.
 */
export function LessonPractice({ topicLessonId, questions, topic, typeset, onProgress, after }: LessonPracticeProps) {
  const [answered, setAnswered] = useState<Answered[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<'saving' | 'saved' | 'failed'>('saving')
  const total = questions.length
  const finished = answered.length === total

  const save = async (all: Answered[]) => {
    setSaved('saving')
    try {
      await finishTopicLesson(topicLessonId, all.filter((a) => a.res.correct).length, total)
      setSaved('saved')
    } catch {
      setSaved('failed')
    }
  }

  const submit = async (value: string) => {
    if (busy || finished) return
    const q = questions[answered.length]!
    setBusy(true)
    setError(null)
    try {
      const res = await answerLessonQuestion(topicLessonId, { kind: 'practice', index: answered.length }, value)
      const all = [...answered, { q, wrote: wroteOf(q, value), res }]
      setAnswered(all)
      onProgress(all.length, total)
      if (all.length === total) void save(all)
    } catch {
      setError('That did not go through. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!finished) {
    const at = answered.length + 1
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
        {error ? <p role="alert" className="mx-5 mt-3 mb-0 text-[15px] text-coral-text">{error}</p> : null}
        <QuestionScreen key={at} q={forScreen(questions[at - 1]!, at, total)} topic={topic} busy={busy} onAnswer={(value) => void submit(value)} />
      </div>
    )
  }

  const right = answered.filter((a) => a.res.correct).length
  const { score, cheer } = scoreLines(right, total)
  const missed = answered.map((a, i) => ({ ...a, n: i + 1 })).filter((a) => !a.res.correct)
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-5 px-5 pt-6 pb-7">
      <div className="flex flex-col gap-1.5" role="status">
        <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em]">Practice done</h1>
        <p className="m-0 text-[20px] font-semibold">{score}</p>
        <p className="m-0 text-[17px] text-body">{cheer}</p>
      </div>
      {saved === 'failed' ? (
        <div className="flex flex-col gap-2.5 rounded-18 border border-[#FFC9BB] bg-coral-wash p-4">
          <p className="m-0 text-[16px] leading-[1.45]">We could not save your score, so the lesson is not ticked yet.</p>
          <button type="button" onClick={() => void save(answered)} className={retry}>Try saving again</button>
        </div>
      ) : null}
      {missed.length > 0 ? (
        <section aria-labelledby="fix-these" className="flex flex-col gap-3">
          <h2 id="fix-these" className="m-0 text-[19px] font-bold">Look at these again</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {missed.map((m) => (
              <li key={m.n} className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4">
                <p className="m-0 text-[15px] font-semibold text-body">Question {m.n}</p>
                <CardQuestion prompt={m.q.prompt} typeset={typeset} />
                <QuestionPicture spec={m.q.diagram} variant="card" />
                <p className="m-0 text-[15px] text-body">You wrote:</p>
                <LessonText text={m.wrote} typeset="all" size={22} className="font-semibold" />
                <p className="m-0 text-[15px] text-body">The answer is:</p>
                <LessonText text={m.res.answer} typeset="all" size={22} className="font-semibold" />
                {m.res.steps ? (
                  <ol aria-label="Steps" className="m-0 flex list-none flex-col gap-1 p-0">
                    {m.res.steps.map((s, i) => (
                      <li key={i}>
                        <LessonText text={s} typeset="all" size={21} />
                      </li>
                    ))}
                  </ol>
                ) : null}
                <LessonText text={m.res.rightWay} typeset={typeset} size={20} className="text-[16px] text-body" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {after}
    </div>
  )
}
