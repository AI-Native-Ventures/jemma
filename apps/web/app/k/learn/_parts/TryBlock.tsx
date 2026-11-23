'use client'

import { useMemo, useState } from 'react'
import { CHOICE_LETTERS, choiceLabel, composeReasonAnswer } from '@jemma/profiling/logic'
import { PendingButton } from '@/components/ui/Button'
import type { LessonAnswerResult, StrippedQuestion } from '@/lib/teaching'
import { forScreen } from '@/lib/teaching'
import { answerShape, answerValue } from '../../session/[sessionId]/logic'
import { AnswerArea, Choices, MissingQuestion, type Boxes } from '../../session/_parts/QuestionScreen'
import { CardQuestion } from '../../session/_parts/QuestionPrompt'
import { QuestionPicture } from '../../session/_parts/QuestionPicture'
import { ReasonPicker } from '../../session/_parts/answers/ReasonPicker'
import { TrueFalse } from '../../session/_parts/answers/TrueFalse'
import type { TypesetMode } from '../../session/_parts/typeset'
import { answerLessonQuestion } from '../actions'
import { LessonText } from './LessonText'

const primary =
  'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-18 border-0 bg-green px-5 py-3 text-center text-[19px] font-bold text-balance text-white disabled:cursor-default disabled:opacity-40'
const secondary =
  'flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-4 py-2 text-center text-[17px] font-semibold text-balance text-ink'
const textButton = 'flex min-h-11 cursor-pointer items-center self-start border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'

export type TryBlockProps = {
  /** The place of the block in the lesson: the server finds the question by it. */
  index: number
  question: StrippedQuestion
  hint: string
  topicLessonId: string
  topic: string
  typeset: TypesetMode
  /** The picture of the question comes before its words (the Pictures delivery). */
  pictureFirst: boolean
  /** Only one answer box is on the page at a time (the maths editor and its keyboard are shared), so a block opens when the learner chooses it. */
  open: boolean
  onOpen: () => void
  /** The saved tour only: marks the answer in the browser instead of sending it to the server. Absent in the app, where the server marks. */
  mark?: (value: string) => LessonAnswerResult | Promise<LessonAnswerResult>
}

/**
 * "Your turn": a question in the lesson. The question and its picture are always there; the answer box opens on a tap, the hint on a second one. The answer is
 * marked on the server (`answerLessonQuestion`): the screen holds no answer until it is sent. Then the right answer, the steps and the right way are shown,
 * and a wrong answer can be tried again.
 */
export function TryBlock({ index, question, hint, topicLessonId, topic, typeset, pictureFirst, open, onOpen, mark }: TryBlockProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [whole, setWhole] = useState('')
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [text, setText] = useState('')
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [hintOpen, setHintOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(LessonAnswerResult & { wrote: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = useMemo(() => forScreen(question, 1, 1), [question])
  const shape = answerShape(q)
  // A choice, a true or false and a reason (P149) are picked: the letter, the word or the reason (with its number, when it has one).
  const value =
    shape.kind === 'choice' || shape.kind === 'truefalse'
      ? (picked ?? '')
      : shape.kind === 'reason'
        ? composeReasonAnswer({ reason: picked ?? '', value: text, withValue: shape.withValue })
        : answerValue(shape, { whole, top, bottom, text, x, y })
  const boxes: Boxes = { whole, top, bottom, text, x, y, set: { whole: setWhole, top: setTop, bottom: setBottom, text: setText, x: setX, y: setY } }
  // What the learner wrote, as words: a choice letter is the choice (a picture with no words is "Picture B").
  const at = CHOICE_LETTERS.indexOf((picked ?? '') as (typeof CHOICE_LETTERS)[number])
  const wrote = shape.kind === 'choice' && q.choices?.[at] !== undefined ? choiceLabel(q.choices[at]!, at) : value

  const check = async () => {
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      setResult({ ...(await (mark ? mark(value) : answerLessonQuestion(topicLessonId, { kind: 'try', block: index }, value))), wrote })
    } catch {
      setError('That did not go through. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const again = () => {
    setResult(null)
    setPicked(null)
    for (const set of [setWhole, setTop, setBottom, setText, setX, setY]) set('')
  }

  const picture = <QuestionPicture spec={q.diagram} />
  return (
    <div className="flex flex-col gap-4">
      {pictureFirst ? picture : null}
      {shape.kind === 'missing' && open && !result ? (
        <MissingQuestion q={q} shape={shape} value={text} onChange={setText} />
      ) : (
        <CardQuestion prompt={q.prompt} typeset={typeset} />
      )}
      {pictureFirst ? null : picture}

      {result ? (
        <div role="status" data-result={result.correct ? 'right' : 'wrong'} className={`flex flex-col gap-2.5 rounded-18 border p-4 ${result.correct ? 'border-green bg-green-tint' : 'border-red bg-card'}`}>
          <p className="m-0 text-[18px] font-bold">{result.correct ? 'Yes, that is right.' : 'Not quite.'}</p>
          {result.correct ? null : (
            <>
              <p className="m-0 text-[15px] text-body">You wrote:</p>
              <LessonText text={result.wrote} typeset="all" size={22} className="font-semibold" />
              <p className="m-0 text-[15px] text-body">The answer is:</p>
            </>
          )}
          <LessonText text={result.answer} typeset="all" size={22} className="font-semibold" />
          {result.steps ? (
            <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Steps">
              {result.steps.map((s, i) => (
                <li key={i}>
                  <LessonText text={s} typeset="all" size={21} />
                </li>
              ))}
            </ol>
          ) : null}
          <LessonText text={result.rightWay} typeset={typeset} size={20} className="text-[16px] text-body" />
          {result.correct ? null : (
            <button type="button" onClick={again} className={secondary}>
              Try again
            </button>
          )}
        </div>
      ) : open ? (
        <>
          {shape.kind === 'choice' ? (
            <Choices q={q} picked={picked} onPick={setPicked} warm={false} />
          ) : shape.kind === 'truefalse' ? (
            <TrueFalse picked={picked} onPick={setPicked} />
          ) : shape.kind === 'reason' ? (
            <ReasonPicker reason={picked ?? ''} onReason={(r) => setPicked(r || null)} withValue={shape.withValue} value={text} onValue={setText} />
          ) : shape.kind === 'missing' ? null : (
            <AnswerArea shape={shape} b={boxes} prompt={q.prompt} topic={topic} />
          )}
          {hintOpen ? (
            <div className="flex flex-col gap-1 rounded-14 bg-soft-2 p-3 text-[16px] leading-[1.45] text-body">
              <p className="m-0 font-semibold text-ink">Hint</p>
              <LessonText text={hint} typeset={typeset} size={20} />
            </div>
          ) : (
            <button type="button" onClick={() => setHintOpen(true)} className={textButton}>
              Need a hint?
            </button>
          )}
          {error ? <p role="alert" className="m-0 text-[14px] text-red-text">{error}</p> : null}
          <PendingButton type="button" pending={busy} disabled={!value || busy} onClick={check} className={primary}>
            Check
          </PendingButton>
        </>
      ) : (
        <button type="button" onClick={onOpen} className={secondary}>
          Answer this one
        </button>
      )}
    </div>
  )
}
