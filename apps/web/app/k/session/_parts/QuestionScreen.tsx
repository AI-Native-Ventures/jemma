'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { answerShape, answerValue, type AnswerShape, type QuestionForChild } from '../[sessionId]/logic'
import { PendingButton } from '@/components/ui/Button'
import { Frac, FractionText, withFractions } from './Frac'

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

/** One short line under the boxes that says what goes in them. It never says whether an answer was right. */
function Hint({ children }: { children: string }) {
  return <p className="m-0 text-center text-[16px] leading-[1.4] text-body">{children}</p>
}

/** What may be typed: digits, and for a number with a comma, the comma or a point too. */
const digits = (s: string, max: number) => s.replace(/\D/g, '').slice(0, max)
const numberText = (s: string) => s.replace(/[^\d.,]/g, '').slice(0, 10)

type BoxProps = { id: string; label: string; value: string; onChange: (v: string) => void; className: string; mode?: 'numeric' | 'decimal'; style?: React.CSSProperties }

function Box({ id, label, value, onChange, className, mode = 'numeric', style }: BoxProps) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="text"
        inputMode={mode}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={style}
        className={`mx-auto block rounded-18 bg-card text-center font-bold text-ink outline-none ${className}`}
      />
    </>
  )
}

/** The top box over the bottom box with the line between them, as a fraction sum has always had them. */
function FractionBoxes({ top, bottom, onTop, onBottom }: { top: string; bottom: string; onTop: (v: string) => void; onBottom: (v: string) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2.5">
        <Box id="top" label="Top number" value={top} onChange={(v) => onTop(digits(v, 3))} className="h-[76px] w-24 border-2 border-ink text-[40px]" />
        <span aria-hidden="true" className="h-1 w-28 rounded-pill bg-ink" />
        <Box id="bottom" label="Bottom number" value={bottom} onChange={(v) => onBottom(digits(v, 3))} className="h-[76px] w-24 border-[3px] border-coral text-[40px]" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-[70px] text-[14px] font-semibold text-body">
        <span>top</span>
        <span>bottom</span>
      </div>
    </div>
  )
}

type Boxes = {
  whole: string
  top: string
  bottom: string
  text: string
  set: { whole: (v: string) => void; top: (v: string) => void; bottom: (v: string) => void; text: (v: string) => void }
}

/** The boxes and the line for every answer that is typed, by what kind of answer it is. A missing number is not here: it is typed in the question. */
function AnswerArea({ shape, b }: { shape: AnswerShape; b: Boxes }) {
  switch (shape.kind) {
    case 'fraction':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <FractionBoxes top={b.top} bottom={b.bottom} onTop={b.set.top} onBottom={b.set.bottom} />
          <Hint>Type the top number and the bottom number.</Hint>
        </div>
      )
    case 'mixed':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <Box id="whole" label="Whole number" value={b.whole} onChange={(v) => b.set.whole(digits(v, 3))} className="h-[76px] w-24 border-2 border-ink text-[40px]" />
              <span aria-hidden="true" className="text-[14px] font-semibold text-body">whole</span>
            </div>
            <FractionBoxes top={b.top} bottom={b.bottom} onTop={b.set.top} onBottom={b.set.bottom} />
          </div>
          <Hint>Type the whole number, then the fraction.</Hint>
        </div>
      )
    case 'money':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <div className="flex items-center gap-2.5">
            <span data-currency="true" aria-hidden="true" className="text-[40px] font-bold text-ink">R</span>
            <Box id="answer" label="Your answer" value={b.text} onChange={(v) => b.set.text(numberText(v))} mode="decimal" className="h-[76px] w-40 border-[3px] border-coral text-[40px]" />
          </div>
          <Hint>Type the amount, like 12,50.</Hint>
        </div>
      )
    case 'decimal':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <Box id="answer" label="Your answer" value={b.text} onChange={(v) => b.set.text(numberText(v))} mode="decimal" className="h-[76px] w-48 border-[3px] border-coral text-[40px]" />
          <Hint>Type a number with a comma, like 0,5.</Hint>
        </div>
      )
    case 'whole':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <Box id="answer" label="Your answer" value={b.text} onChange={(v) => b.set.text(numberText(v))} className="h-[76px] w-48 border-[3px] border-coral text-[40px]" />
          <Hint>Type a whole number.</Hint>
        </div>
      )
    default:
      // The lesson gave no kind we know: one plain box.
      return (
        <div className="flex flex-col items-center gap-3.5">
          <Box id="answer" label="Your answer" value={b.text} onChange={(v) => b.set.text(v.slice(0, 20))} mode="decimal" className="h-[76px] w-48 border-[3px] border-coral text-[40px]" />
          <Hint>Type your answer.</Hint>
        </div>
      )
  }
}

/** The question with its missing number as a box inside the fraction, big enough to tap, and the line under it. */
function MissingQuestion({ q, shape, value, onChange }: { q: QuestionForChild; shape: Extract<AnswerShape, { kind: 'missing' }>; value: string; onChange: (v: string) => void }) {
  const { unknown } = shape.part
  const words: ReactNode[] = withFractions(q.prompt, (n, d, k) => {
    const isMissing = n === null || d === null
    const slot = (
      <Box
        id="missing"
        label="Missing number"
        value={value}
        onChange={(v) => onChange(digits(v, 4))}
        style={{ height: 64, width: 76 }}
        className="border-[3px] border-coral text-[34px]"
      />
    )
    return (
      <Frac
        key={k}
        top={isMissing && unknown === 'top' ? slot : n}
        bottom={isMissing && unknown === 'bottom' ? slot : d}
        size={40}
        rule={4}
        gap={7}
        side={6}
      />
    )
  })
  return (
    <div className="flex flex-col items-center gap-3.5">
      {/* The words for a screen reader and for the page's own checks; the drawing is the row below. */}
      <h1 data-prompt={q.prompt} className="sr-only">{q.prompt}</h1>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5 text-[30px] leading-[1.2] font-bold">
        {words.map((part, i) => (typeof part === 'string' ? (part.trim() ? <span key={`t${i}`} aria-hidden="true">{part.trim()}</span> : null) : part))}
      </div>
      <Hint>Type the missing number.</Hint>
    </div>
  )
}

/** The answer buttons of a choice question: a fraction in a choice is stacked too. */
function Choices({ q, picked, onPick, warm }: { q: QuestionForChild; picked: string | null; onPick: (letter: string) => void; warm: boolean }) {
  return (
    <div className={`grid gap-3 ${warm ? 'grid-cols-2' : 'w-full grid-cols-2'}`}>
      {(q.choices ?? []).map((choice, i) => {
        const letter = CHOICE_LETTERS[i]!
        const on = picked === letter
        return (
          <button
            key={letter}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(letter)}
            className={`flex cursor-pointer items-center justify-center rounded-[22px] ${warm ? 'h-[124px]' : 'h-20'} font-bold ${
              warm ? 'text-[30px]' : 'text-[26px]'
            } ${on ? 'border-[3px] border-ink bg-ink text-white' : 'border-2 border-edge bg-card text-ink'}`}
          >
            <FractionText text={choice} size={warm ? 38 : 28} rule={3} gap={warm ? 5 : 4} side={6} color={on ? '#FFFFFF' : '#1F1D36'} className="" />
          </button>
        )
      })}
    </div>
  )
}

export type QuestionScreenProps = {
  q: QuestionForChild
  busy: boolean
  /** Called with the typed or picked answer and how many seconds it took. */
  onAnswer: (value: string, seconds: number) => void
}

/** One warm-up or try question. It never shows whether an answer was right. */
export function QuestionScreen({ q, busy, onAnswer }: QuestionScreenProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [whole, setWhole] = useState('')
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [text, setText] = useState('')
  const shown = useRef(Date.now())
  useEffect(() => {
    shown.current = Date.now()
  }, [])

  const warm = q.phase === 'warmup'
  const shape = answerShape(q)
  const value = shape.kind === 'choice' ? (picked ?? '') : answerValue(shape, { whole, top, bottom, text })
  const submit = () => value && !busy && onAnswer(value, (Date.now() - shown.current) / 1000)
  const boxes: Boxes = { whole, top, bottom, text, set: { whole: setWhole, top: setTop, bottom: setBottom, text: setText } }
  const nextButton = (
    <PendingButton type="button" pending={busy} disabled={!value || busy} onClick={submit} className={nextClass}>Next</PendingButton>
  )

  if (warm) {
    return (
      <main className="flex flex-1 flex-col gap-[22px] px-5 pt-6 pb-7">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[15px] font-semibold text-body">Warm-up · {q.index} of {q.of}</p>
          <p className="m-0 text-[16px] text-body">A quick one from a gap you already fixed.</p>
        </div>
        {shape.kind === 'missing' ? (
          <MissingQuestion q={q} shape={shape} value={text} onChange={setText} />
        ) : (
          <>
            <h1 data-prompt={q.prompt} className="m-0 text-[28px] leading-[1.2] font-semibold">
              <FractionText text={q.prompt} size={34} rule={3} gap={4} side={5} className="mx-1.5 align-middle" />
            </h1>
            {shape.kind === 'choice' ? <Choices q={q} picked={picked} onPick={setPicked} warm /> : <AnswerArea shape={shape} b={boxes} />}
          </>
        )}
        <Note>No rush. We look at your answers together at the end.</Note>
        <div className="flex-1" />
        {nextButton}
      </main>
    )
  }

  const fractionSum = q.render === 'fraction_sum' && q.terms?.length === 2
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
        {shape.kind === 'missing' ? (
          <MissingQuestion q={q} shape={shape} value={text} onChange={setText} />
        ) : (
          <>
            {fractionSum ? (
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
            ) : (
              <h1 data-prompt={q.prompt} className="m-0 text-center text-[30px] leading-[1.2] font-bold">
                <FractionText text={q.prompt} size={34} rule={3} gap={4} side={5} />
              </h1>
            )}
            {shape.kind === 'choice' ? <Choices q={q} picked={picked} onPick={setPicked} warm={false} /> : <AnswerArea shape={shape} b={boxes} />}
          </>
        )}
      </section>
      <Note>Take your time. You&apos;ll see how you did at the end.</Note>
      <div className="flex-1" />
      {nextButton}
    </main>
  )
}
