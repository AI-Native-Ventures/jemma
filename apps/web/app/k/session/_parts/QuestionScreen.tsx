'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuestionForChild } from '../[sessionId]/logic'
import { Frac, isFraction, withFractions } from './Frac'

const CHOICE_LETTERS = ['A', 'B', 'C', 'D']
const noteClass = 'm-0 flex items-start gap-2.5 text-[15px] leading-[1.45] text-body'

function Note({ children }: { children: string }) {
  return (
    <p className={noteClass}>
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-[5px] flex-none">
        <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
      </svg>
      {children}
    </p>
  )
}

const nextClass =
  'flex h-[60px] cursor-pointer items-center justify-center rounded-18 border-0 bg-ink text-[19px] font-bold text-white disabled:cursor-default disabled:opacity-40'

export type QuestionScreenProps = {
  q: QuestionForChild
  busy: boolean
  /** Called with the typed or picked answer and how many seconds it took. */
  onAnswer: (value: string, seconds: number) => void
}

/** One warm-up or try question. It never shows whether an answer was right. */
export function QuestionScreen({ q, busy, onAnswer }: QuestionScreenProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [text, setText] = useState('')
  const shown = useRef(Date.now())
  useEffect(() => {
    shown.current = Date.now()
  }, [])

  const warm = q.phase === 'warmup'
  const fractionSum = q.render === 'fraction_sum' && q.terms?.length === 2
  const value = q.choices ? (picked ?? '') : fractionSum ? (top.trim() && bottom.trim() ? `${top.trim()}/${bottom.trim()}` : '') : text.trim()
  const submit = () => value && !busy && onAnswer(value, (Date.now() - shown.current) / 1000)

  if (warm) {
    return (
      <main className="flex flex-1 flex-col gap-[22px] px-5 pt-6 pb-7">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[15px] font-semibold text-body">Warm-up · {q.index} of {q.of}</p>
          <p className="m-0 text-[16px] text-body">A quick one from a gap you already fixed.</p>
        </div>
        <h1 data-prompt={q.prompt} className="m-0 flex flex-wrap items-center gap-3 text-[28px] leading-[1.2] font-semibold">
          {withFractions(q.prompt, (n, d, k) => (
            <Frac key={k} top={n} bottom={d} size={34} rule={3} gap={4} side={5} />
          )).map((part, i) => (typeof part === 'string' ? part.trim() ? <span key={`t${i}`}>{part.trim()}</span> : null : part))}
        </h1>
        <div className="grid grid-cols-2 gap-3">
          {(q.choices ?? []).map((choice, i) => {
            const letter = CHOICE_LETTERS[i]!
            const on = picked === letter
            return (
              <button
                key={letter}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(letter)}
                className={`flex h-[124px] cursor-pointer items-center justify-center rounded-[22px] ${
                  on ? 'border-[3px] border-ink bg-ink text-white' : 'border-2 border-edge bg-card text-ink'
                }`}
              >
                {isFraction(choice) ? (
                  <Frac top={choice.split('/')[0]!} bottom={choice.split('/')[1]!} size={38} rule={3} gap={5} side={6} color={on ? '#FFFFFF' : '#1F1D36'} />
                ) : (
                  <span className="text-[30px] font-bold">{choice}</span>
                )}
              </button>
            )
          })}
        </div>
        <Note>No rush. We look at your answers together at the end.</Note>
        <div className="flex-1" />
        <button type="button" disabled={!value || busy} onClick={submit} className={nextClass}>Next</button>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-[26px] px-5 pt-[22px] pb-7">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[16px] font-semibold">Question {q.index} of {q.of}</p>
        <span aria-hidden="true" className="flex gap-1.5">
          {Array.from({ length: q.of }, (_, i) => (
            <span
              key={i}
              className={`size-3 rounded-pill ${
                i + 1 < q.index ? 'bg-ink' : i + 1 === q.index ? 'border-[3px] border-coral' : 'border-[1.5px] border-muted-2'
              }`}
            />
          ))}
        </span>
      </div>
      <section aria-label="Question" className="flex flex-col items-center gap-[30px] rounded-[28px] border border-line bg-card px-[18px] py-[30px]">
        {fractionSum ? (
          <>
            <h1 data-prompt={q.prompt} className="m-0 flex items-center gap-4 text-[44px] font-bold">
              {q.terms!.map((t, i) => {
                const [n, d] = t.split('/')
                return (
                  <span key={i} className="flex items-center gap-4">
                    {i > 0 ? <span className="font-medium">+</span> : null}
                    <Frac top={n!} bottom={d!} size={44} rule={4} gap={6} side={6} />
                  </span>
                )
              })}
              <span className="font-medium">=</span>
              <span className="sr-only">{q.prompt} equals what?</span>
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-2.5">
                <label htmlFor="top" className="sr-only">Top number</label>
                <input
                  id="top"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={top}
                  onChange={(e) => setTop(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="h-[76px] w-24 rounded-18 border-2 border-ink bg-card text-center text-[40px] font-bold text-ink outline-none"
                />
                <span aria-hidden="true" className="h-1 w-28 rounded-pill bg-ink" />
                <label htmlFor="bottom" className="sr-only">Bottom number</label>
                <input
                  id="bottom"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={bottom}
                  onChange={(e) => setBottom(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="h-[76px] w-24 rounded-18 border-[3px] border-coral bg-card text-center text-[40px] font-bold text-ink outline-none"
                />
              </div>
              <div aria-hidden="true" className="flex flex-col gap-[70px] text-[14px] font-semibold text-body">
                <span>top</span>
                <span>bottom</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 data-prompt={q.prompt} className="m-0 text-center text-[30px] leading-[1.2] font-bold">
              {withFractions(q.prompt, (n, d, k) => (
                <Frac key={k} top={n} bottom={d} size={34} rule={3} gap={4} side={5} className="mx-1 align-middle" />
              ))}
            </h1>
            {q.choices ? (
              <div className="grid w-full grid-cols-2 gap-3">
                {q.choices.map((choice, i) => {
                  const letter = CHOICE_LETTERS[i]!
                  return (
                    <button
                      key={letter}
                      type="button"
                      aria-pressed={picked === letter}
                      onClick={() => setPicked(letter)}
                      className={`h-20 cursor-pointer rounded-[22px] text-[26px] font-bold ${
                        picked === letter ? 'border-[3px] border-ink bg-ink text-white' : 'border-2 border-edge bg-card text-ink'
                      }`}
                    >
                      {choice}
                    </button>
                  )
                })}
              </div>
            ) : (
              <>
                <label htmlFor="answer" className="sr-only">Your answer</label>
                <input
                  id="answer"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="h-[76px] w-48 rounded-18 border-[3px] border-coral bg-card text-center text-[40px] font-bold text-ink outline-none"
                />
              </>
            )}
          </>
        )}
      </section>
      <Note>Take your time. You&apos;ll see how you did at the end.</Note>
      <div className="flex-1" />
      <button type="button" disabled={!value || busy} onClick={submit} className={nextClass}>Next</button>
    </main>
  )
}
