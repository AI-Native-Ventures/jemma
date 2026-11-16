'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CHOICE_LETTERS, choiceText, composeReasonAnswer, hasPictureChoices } from '@jemma/profiling/logic'
import { answerShape, answerValue, type AnswerShape, type QuestionForChild } from '../[sessionId]/logic'
import { PendingButton } from '@/components/ui/Button'
import { numberHint, ratioHint, timeHint } from './answers/hints'
import { QuantityAnswer } from './answers/QuantityAnswer'
import { UnitFrame } from './answers/QuantityBox'
import { RatioBoxes } from './answers/RatioBoxes'
import { TimeBoxes } from './answers/TimeBoxes'
import { Frac, FractionText, withFractions } from './Frac'
import { equationShapeHint } from './answers/hints'
import { isValuesShape, ValuesAnswer } from './answers/ValuesAnswer'
import { YoungSize } from './answers/YoungSize'
import { MathAnswerField } from './MathAnswerField'
import { promptLayout } from './prompt-layout'
import { QuestionContext, QuestionHeading } from './QuestionPrompt'
import { QuestionPicture } from './QuestionPicture'
import { PictureChoices } from './answers/PictureChoices'
import { ReasonPicker } from './answers/ReasonPicker'
import { TrueFalse } from './answers/TrueFalse'

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
  'flex min-h-[60px] cursor-pointer items-center justify-center rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white disabled:cursor-default disabled:opacity-40'

/** One short line under the boxes that says what goes in them. It never says whether an answer was right. */
function Hint({ children }: { children: string }) {
  // P129: the example in a hint is maths ("like (x + 2)(x - 2)"), drawn as it is in a textbook. A hint of words, or of a plain number, is the same text as before.
  return (
    <p className="m-0 text-center text-[16px] leading-[1.4] text-body">
      <FractionText text={children} size={18} rule={2} gap={3} side={3} typeset="all" />
    </p>
  )
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

// ---- The four kinds of a senior class (P86): an expression, an equation, a point and a number that may be negative ------------------------------------------

const MINUS = '\u2212'
/** A number as it is typed with a minus: digits, a comma or a point, and a minus in front. A phone's number pad has no minus, so there is a key for it. */
const signedNumber = (s: string, max: number) => {
  const kept = s.replace(/\u2212/g, '-').replace(/[^\d.,-]/g, '')
  return ((kept.startsWith('-') ? '-' : '') + kept.replace(/-/g, '')).slice(0, max)
}
const toggleMinus = (v: string, max: number) => (v.startsWith('-') ? v.slice(1) : `-${v}`.slice(0, max))

const FORM_HINTS = {
  any: 'Type an expression, like 2x + 3.',
  factorised: 'Type it as a product of brackets, like (x + 2)(x - 2).',
  expanded: 'Type it with no brackets, like x\u00b2 + 4x + 4.',
} as const
const EQUATION_HINT = 'Type the answer, like x = 4. Two answers: x = 3 or x = -1.'

/** The minus key of a number: a phone's number pad has none. It puts a minus in front of the number, and takes it away again. */
function MinusKey({ label, onPress, className = 'h-[76px] w-14 text-[34px]' }: { label: string; onPress: () => void; className?: string }) {
  return (
    <button type="button" aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onPress} className={`flex flex-none cursor-pointer items-center justify-center rounded-18 border-2 border-edge bg-card font-bold text-ink ${className}`}>
      {MINUS}
    </button>
  )
}

/** One coordinate of a point: the minus key, the box, and under them which one it is. */
function Coordinate({ axis, value, onChange }: { axis: 'x' | 'y'; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <MinusKey label={`Minus sign for ${axis}`} onPress={() => onChange(toggleMinus(value, 10))} className="h-14 w-9 text-[26px]" />
        <Box
          id={axis}
          label={`${axis} of the point`}
          value={value}
          onChange={(v) => onChange(signedNumber(v, 10))}
          mode="decimal"
          className="h-14 w-[80px] border-[3px] border-coral text-[26px]"
        />
      </div>
      <span aria-hidden="true" className="text-[14px] font-semibold text-body">{axis}</span>
    </div>
  )
}

export type Boxes = {
  whole: string
  top: string
  bottom: string
  text: string
  x: string
  y: string
  set: {
    whole: (v: string) => void
    top: (v: string) => void
    bottom: (v: string) => void
    text: (v: string) => void
    x: (v: string) => void
    y: (v: string) => void
  }
}

/** The boxes and the line for every answer that is typed, by what kind of answer it is. A missing number is not here: it is typed in the question. */
export function AnswerArea({ shape, b, prompt, topic }: { shape: AnswerShape; b: Boxes; prompt: string; topic?: string }) {
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
      // P148: a unit, a round or a minus key (a senior class): the box of answers/QuantityBox.tsx. Without one it is the box it always was.
      if (shape.unit || shape.signed || shape.round !== undefined) return <QuantityAnswer kind="decimal" extras={shape} value={b.text} onChange={b.set.text} />
      return (
        <div className="flex flex-col items-center gap-3.5">
          <Box id="answer" label="Your answer" value={b.text} onChange={(v) => b.set.text(numberText(v))} mode="decimal" className="h-[76px] w-48 border-[3px] border-coral text-[40px]" />
          <Hint>Type a number with a comma, like 0,5.</Hint>
        </div>
      )
    case 'whole':
      if (shape.unit || shape.signed || shape.round !== undefined) return <QuantityAnswer kind="whole" extras={shape} value={b.text} onChange={b.set.text} />
      return (
        <div className="flex flex-col items-center gap-3.5">
          <Box id="answer" label="Your answer" value={b.text} onChange={(v) => b.set.text(numberText(v))} className="h-[76px] w-48 border-[3px] border-coral text-[40px]" />
          <Hint>Type a whole number.</Hint>
        </div>
      )
    case 'expression':
      return <MathAnswerField kind="expression" topic={topic} prompt={prompt} value={b.text} onChange={b.set.text} hint={FORM_HINTS[shape.form]} />
    case 'equation':
      return <MathAnswerField kind="equation" topic={topic} prompt={prompt} value={b.text} onChange={b.set.text} hint={equationShapeHint(shape, EQUATION_HINT)} />
    case 'point':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <div data-point="true" className="flex items-start justify-center gap-1">
            <span aria-hidden="true" className="pt-1 text-[40px] leading-[1] font-bold text-ink">(</span>
            <Coordinate axis="x" value={b.x} onChange={b.set.x} />
            <span aria-hidden="true" className="pt-1 text-[40px] leading-[1] font-bold text-ink">;</span>
            <Coordinate axis="y" value={b.y} onChange={b.set.y} />
            <span aria-hidden="true" className="pt-1 text-[40px] leading-[1] font-bold text-ink">)</span>
          </div>
          <Hint>Type the x and the y of the point.</Hint>
        </div>
      )
    case 'number':
      return (
        <UnitFrame unit={shape.unit}>
          <MathAnswerField kind="number" topic={topic} prompt={prompt} value={b.text} onChange={b.set.text} hint={numberHint(shape)} />
        </UnitFrame>
      )
    // P148: a time and a ratio, each its own boxes (answers/TimeBoxes.tsx, RatioBoxes.tsx).
    case 'time':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <YoungSize young={shape.young} kind="time"><TimeBoxes style={shape.style} onChange={b.set.text} /></YoungSize>
          <Hint>{timeHint(shape.style, shape.young === true)}</Hint>
        </div>
      )
    case 'ratio':
      return (
        <div className="flex flex-col items-center gap-3.5">
          <RatioBoxes parts={shape.parts} onChange={b.set.text} />
          <Hint>{ratioHint(shape.parts)}</Hint>
        </div>
      )
    case 'list':
    case 'order':
    case 'table':
      // P150: several values (a row of boxes, chips to put in order, the empty cells of a table), sent as one text.
      return <YoungSize young={shape.young}><ValuesAnswer shape={shape} onChange={b.set.text} /></YoungSize>
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
export function MissingQuestion({ q, shape, value, onChange }: { q: QuestionForChild; shape: Extract<AnswerShape, { kind: 'missing' }>; value: string; onChange: (v: string) => void }) {
  const { unknown } = shape.part
  // A long prompt (P130): the sentences before the line that holds the fraction (and any after it) are normal text, and only that line is drawn big.
  const layout = promptLayout(q.prompt, 'algebra')
  const words: ReactNode[] = withFractions(layout.split ? layout.line : q.prompt, (n, d, k) => {
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
      {layout.before ? <div className="w-full"><QuestionContext text={layout.before} typeset="algebra" /></div> : null}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5 text-[30px] leading-[1.2] font-bold">
        {words.map((part, i) => (typeof part === 'string' ? (part.trim() ? <span key={`t${i}`} aria-hidden="true">{part.trim()}</span> : null) : part))}
      </div>
      {layout.after ? <div className="w-full"><QuestionContext text={layout.after} typeset="algebra" /></div> : null}
      <Hint>Type the missing number.</Hint>
    </div>
  )
}

/** The answer buttons of a choice question: a fraction in a choice is stacked too. Options that are pictures (P149) are cards of their own. */
export function Choices({ q, picked, onPick, warm }: { q: QuestionForChild; picked: string | null; onPick: (letter: string) => void; warm: boolean }) {
  if (hasPictureChoices(q.choices)) return <PictureChoices choices={q.choices!} picked={picked} onPick={onPick} inCard={!warm} />
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
            className={`flex cursor-pointer items-center justify-center rounded-[22px] px-5 py-3 text-center text-balance ${warm ? 'min-h-[124px]' : 'min-h-20'} font-bold ${
              warm ? 'text-[30px]' : 'text-[26px]'
            } ${on ? 'border-[3px] border-ink bg-ink text-white' : 'border-2 border-edge bg-card text-ink'}`}
          >
            <FractionText text={choiceText(choice) ?? ''} size={warm ? 38 : 28} rule={3} gap={warm ? 5 : 4} side={6} color={on ? '#FFFFFF' : '#1F1D36'} className="" />
          </button>
        )
      })}
    </div>
  )
}

/** True for the answers that are picked, not typed: a choice, true or false, and a reason from the list (P149). The picked letter, word or reason is in `picked`. */
const isPick = (shape: AnswerShape) => shape.kind === 'choice' || shape.kind === 'truefalse' || shape.kind === 'reason'

/** The control of a picked answer. A reason keeps its number (when it has one) in the text box of the screen. */
function PickArea({ q, shape, picked, onPick, text, onText, warm }: { q: QuestionForChild; shape: AnswerShape; picked: string | null; onPick: (v: string | null) => void; text: string; onText: (v: string) => void; warm: boolean }) {
  if (shape.kind === 'truefalse') return <TrueFalse picked={picked} onPick={onPick} warm={warm} />
  if (shape.kind === 'reason') return <ReasonPicker reason={picked ?? ''} onReason={(r) => onPick(r || null)} withValue={shape.withValue} value={text} onValue={onText} />
  return <Choices q={q} picked={picked} onPick={onPick} warm={warm} />
}

export type QuestionScreenProps = {
  q: QuestionForChild
  /** The name of the lesson's topic: with the words of the question it decides which maths keys a senior question gets. */
  topic?: string
  busy: boolean
  /** Called with the typed or picked answer and how many seconds it took. */
  onAnswer: (value: string, seconds: number) => void
}

/** One warm-up or try question. It never shows whether an answer was right. */
export function QuestionScreen({ q, topic, busy, onAnswer }: QuestionScreenProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [whole, setWhole] = useState('')
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [text, setText] = useState('')
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const shown = useRef(Date.now())
  useEffect(() => {
    shown.current = Date.now()
  }, [])

  const warm = q.phase === 'warmup'
  const shape = answerShape(q)
  // A question of a senior class (the four typed kinds) has its maths typeset whenever it has a sign in it; any other question when it has algebra in it.
  // A statement to call true or false, and a step to give the reason for (P149), are maths too.
  const typeset =
    shape.kind === 'number' ||
    shape.kind === 'expression' ||
    shape.kind === 'equation' ||
    shape.kind === 'point' ||
    shape.kind === 'truefalse' ||
    shape.kind === 'reason' ||
    isValuesShape(shape)
      ? 'all'
      : 'algebra'
  const value =
    shape.kind === 'choice' || shape.kind === 'truefalse'
      ? (picked ?? '')
      : shape.kind === 'reason'
        ? composeReasonAnswer({ reason: picked ?? '', value: text, withValue: shape.withValue })
        : answerValue(shape, { whole, top, bottom, text, x, y })
  const submit = () => value && !busy && onAnswer(value, (Date.now() - shown.current) / 1000)
  const boxes: Boxes = { whole, top, bottom, text, x, y, set: { whole: setWhole, top: setTop, bottom: setBottom, text: setText, x: setX, y: setY } }
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
          <>
            <QuestionPicture spec={q.diagram} />
            <MissingQuestion q={q} shape={shape} value={text} onChange={setText} />
          </>
        ) : (
          <>
            <QuestionHeading prompt={q.prompt} typeset={typeset} tone="warm" />
            <QuestionPicture spec={q.diagram} />
            {isPick(shape) ? <PickArea q={q} shape={shape} picked={picked} onPick={setPicked} text={text} onText={setText} warm /> : <AnswerArea shape={shape} b={boxes} prompt={q.prompt} topic={topic} />}
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
          <>
            <QuestionPicture spec={q.diagram} />
            <MissingQuestion q={q} shape={shape} value={text} onChange={setText} />
          </>
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
              <QuestionHeading prompt={q.prompt} typeset={typeset} tone="try" />
            )}
            <QuestionPicture spec={q.diagram} />
            {isPick(shape) ? <PickArea q={q} shape={shape} picked={picked} onPick={setPicked} text={text} onText={setText} warm={false} /> : <AnswerArea shape={shape} b={boxes} prompt={q.prompt} topic={topic} />}
          </>
        )}
      </section>
      <Note>Take your time. You&apos;ll see how you did at the end.</Note>
      <div className="flex-1" />
      {nextButton}
    </main>
  )
}
