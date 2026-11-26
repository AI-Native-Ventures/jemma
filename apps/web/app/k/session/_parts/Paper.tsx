'use client'

import type { ReactNode } from 'react'
import { IconLabel } from '@/components/ui/IconLabel'
import { blankLabels, CHOICE_LETTERS, choiceText, hasPictureChoices } from '@jemma/profiling/logic'
import { answerShape, type AnswerShape, type QuestionForChild } from '../[sessionId]/logic'
import { numberWriteLine, plainNumberWriteLine, ratioWriteLine, timeWriteLine } from './answers/hints'
import { INEQUALITY_WRITE_LINE, PAIR_WRITE_LINE } from './answers/hints'
import { Frac, FractionText } from './Frac'
import { QuestionPicture } from './QuestionPicture'
import { PictureChoices } from './answers/PictureChoices'
import { ReasonList } from './answers/ReasonPicker'
import { PaperValues } from './answers/PaperValues'
import { DataGraph } from './answers/DataGraph'
import { ColumnsSum } from './answers/ColumnsSum'
import { PlotGrid } from './answers/PlotGrid'
import { ClockFace } from './answers/ClockFace'
import { LineGrid } from './answers/LineGrid'
import { PinLine } from './answers/PinLine'
import { ShadedResult } from './answers/ShadeShape'
import { TapPicture } from './answers/TapShapes'
import { paperValuesLine } from './answers/values-hints'

// A practice answered on paper: the choice before the first Try question, the sheet of five questions with the photo button, the wait while
// Jemma reads the photo, and the card for a photo that could not be read. All of them are drawn from their props alone (the state lives in
// SessionFlow), so they render the same on the server and in a test.

/** The same green ring the lesson-loading screen and the practice card turn while Jemma works. */
function Ring() {
  return (
    <svg aria-hidden="true" width="44" height="44" viewBox="0 0 28 28" className="motion-safe:animate-spin">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#EFECE6" strokeWidth="3.5" />
      <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#007749" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M11 17.5h2" />
    </svg>
  )
}

/** Both choices are the same size and the same weight: neither is pushed. */
const choiceButton =
  'flex min-h-[76px] w-full cursor-pointer items-center justify-center gap-3.5 rounded-20 border-2 border-ink bg-card px-5 py-3 text-center text-[20px] font-bold text-balance text-ink sm:text-[22px]'
const linkButton = 'flex min-h-11 cursor-pointer items-center justify-center border-0 bg-transparent text-[16px] font-semibold text-ink underline underline-offset-[3px]'
const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(22,22,22,0.06)]'

/** After Learn and before the first Try question: how does the child want to answer? */
export function PaperChoice({ onPaper, onScreen }: { onPaper: () => void; onScreen: () => void }) {
  return (
    <main className="flex flex-1 flex-col gap-[22px] px-5 pt-6 pb-7">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[15px] font-semibold text-body">Try · 5 questions</p>
        <h1 className="m-0 text-[30px] leading-[1.15] font-bold tracking-[-0.02em] text-pretty">How do you want to answer?</h1>
        <p className="m-0 text-[17px] leading-[1.45] text-body">Pick the one that is easier for you.</p>
      </div>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={onPaper} className={choiceButton}>
          <IconLabel icon={<CameraIcon />} gap={14}>Answer on paper</IconLabel>
        </button>
        <button type="button" onClick={onScreen} className={choiceButton}>
          <IconLabel icon={<PhoneIcon />} gap={14}>Answer on the screen</IconLabel>
        </button>
      </div>
      <p className="m-0 text-[16px] leading-[1.45] text-body">On paper you write your answers and take one photo. You do not need a pencil on the screen.</p>
      <div className="flex-1" />
    </main>
  )
}

/** The line under a question that says how to write its answer: the lines of the question screen, for a pencil. */
export function writeLine(shape: AnswerShape): string {
  switch (shape.kind) {
    case 'choice':
      return 'Write the letter of your answer.'
    // P149: a true or false and a reason (the reasons are the ones the lesson names: a geometry reason is written in words).
    case 'truefalse':
      return 'Write True or False.'
    case 'reason':
      return shape.withValue ? 'Write the value, then the reason in words, like 40, angles in the same segment.' : 'Write the reason in words, like angles on a straight line.'
    case 'missing':
      return 'Write the missing number.'
    case 'fraction':
      return 'Write the top number and the bottom number.'
    case 'mixed':
      return 'Write the whole number, then the fraction.'
    case 'money':
      return 'Write the amount, like 12,50.'
    case 'decimal':
      return shape.unit || shape.signed || shape.round !== undefined ? plainNumberWriteLine('decimal', shape) : 'Write a number with a comma, like 0,5.'
    case 'whole':
      return shape.unit || shape.signed || shape.round !== undefined ? plainNumberWriteLine('whole', shape) : 'Write a whole number.'
    // The four kinds of a senior class: the same lines as the question screen, for a pencil.
    case 'expression':
      return shape.form === 'factorised'
        ? 'Write it as a product of brackets, like (x + 2)(x - 2).'
        : shape.form === 'expanded'
          ? 'Write it with no brackets, like x\u00b2 + 4x + 4.'
          : 'Write an expression, like 2x + 3.'
    case 'equation':
      return shape.inequality
        ? INEQUALITY_WRITE_LINE
        : shape.pair
          ? PAIR_WRITE_LINE
          : shape.count !== undefined && shape.count > 4
            ? 'Write every answer, with the word or between them.'
            : 'Write the answer, like x = 4.'
    // An equation with two answers or more (P146): a blank for each.
    case 'answers':
      return Array.from({ length: shape.count }, (_, i) => `Answer ${i + 1}: ____`).join('  ')
    case 'point':
      return 'Write the x and the y of the point, like (2; 3).'
    case 'number':
      return numberWriteLine(shape)
    // P148: a time and a ratio.
    case 'time':
      return timeWriteLine(shape.style, shape.young === true)
    case 'ratio':
      return ratioWriteLine(shape.parts)
    // P150: several values, with a semicolon between them (that is how the photo is read).
    case 'list':
    case 'order':
    case 'table':
      return paperValuesLine(shape)
    // P177: a clock is set on paper by drawing its hands, and its time written.
    case 'clock':
      return `Draw the hands on the clock on your paper. Then write the time. ${writeLine(shape.typed)}`
    // P175: a pin on a number line is written as its number.
    case 'pin':
      return `Mark the number on your paper, then write it. ${writeLine(shape.typed)}`
    // P174: a line is written as two points on it.
    case 'line':
      return 'Write two points your line goes through: x1; y1; x2; y2.'
    // P173: shapes to tap are written as their numbers.
    case 'tap':
      return 'Write the numbers of the shapes that fit, with a semicolon between them.'
    // P172: a shape to shade is shaded on paper and the number of parts written.
    case 'shade':
      return 'Shade the parts on your paper, then write how many you shaded.'
    // P171: points on a grid are written as the x and the y of each, in order. P176: a sketch is drawn on paper, and 3 points of it written, in any order.
    case 'plot':
      return shape.plot.curve
        ? `Sketch the graph on your paper. Then write the x and the y of ${shape.plot.place.length} points on it, with a semicolon between them.`
        : `Write the x and the y of ${shape.plot.place.map((n) => n.trim()).join(', ')}, in order, with a semicolon between them.`
    // P170: groups are written as the number of the group of each thing, in order.
    case 'groups':
      return `Write the group of each one, in order: ${shape.groups.names.map((n, i) => `${i + 1} for ${n.trim()}`).join(', ')}. Put a semicolon between them.`
    // P169: blocks cannot be put on paper: the learner draws them and writes the number they make.
    case 'blocks':
      return 'Draw the blocks, then write the number they make.'
    // P168: a sum in columns is worked on paper under its line.
    case 'columns':
      return 'Work it in columns and write the answer under the line.'
    // P167: a graph to draw is written as its numbers: the one for its empty bar, or one for each, in order.
    case 'graph': {
      const names = blankLabels(shape.graph)
      return names.length === 1 ? `Write the number for ${names[0]}.` : writeLine(shape.typed)
    }
    default:
      return 'Write your answer.'
  }
}

/** One question of the sheet, drawn the way the question screen draws it: stacked fractions, the missing part as an empty box, the choices as A, B, C, D. */
function PaperQuestion({ q }: { q: QuestionForChild }) {
  const shape = answerShape(q)
  const fractionSum = q.render === 'fraction_sum' && q.terms?.length === 2
  return (
    <li data-n={q.index} className="flex items-start gap-3.5 rounded-[22px] border border-line bg-card p-4">
      <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-pill bg-ink text-[18px] font-bold text-white">
        {q.index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="sr-only">Question {q.index}.</span>
        {fractionSum ? (
          <h2 data-prompt={q.prompt} className="m-0 flex flex-wrap items-center gap-3 text-[30px] font-bold">
            {q.terms!.map((t, i) => {
              const [n, d] = t.split('/')
              return (
                <span key={i} className="flex items-center gap-3">
                  {i > 0 ? <span className="font-medium">+</span> : null}
                  <Frac top={n!} bottom={d!} size={30} rule={3} gap={5} side={5} />
                </span>
              )
            })}
            <span className="font-medium">=</span>
            <span className="sr-only">{q.prompt} equals what?</span>
          </h2>
        ) : (
          <h2 data-prompt={q.prompt} className="m-0 text-[24px] leading-[1.3] font-semibold">
            <FractionText text={q.prompt} size={30} rule={3} gap={4} side={5} className="mx-1 align-middle" />
          </h2>
        )}
        <QuestionPicture spec={q.diagram} />
        {shape.kind === 'graph' ? <DataGraph graph={shape.graph} values={[]} mode="paper" /> : null}
        {shape.kind === 'columns' ? <ColumnsSum columns={shape.columns} mode="paper" /> : null}
        {shape.kind === 'plot' ? <PlotGrid plot={shape.plot} mode="paper" /> : null}
        {shape.kind === 'line' ? <LineGrid line={shape.line} mode="paper" /> : null}
        {shape.kind === 'pin' ? <PinLine pin={shape.pin} at={null} mode="paper" /> : null}
        {shape.kind === 'clock' ? <div className="w-[200px] self-center"><ClockFace time={null} mode="paper" /></div> : null}
        {shape.kind === 'shade' ? <ShadedResult shade={shape.shade} wrote="0" /> : null}
        {shape.kind === 'tap' ? (
          <div className="flex flex-col gap-1">
            <TapPicture tap={shape.tap} picked={[]} label={`${shape.tap.shapes.length} shapes, numbered from 1.`} />
            <p className="m-0 text-[14px] text-body">The shapes are numbered from 1, left to right and top to bottom.</p>
          </div>
        ) : null}
        {shape.kind === 'groups' ? (
          <ol aria-label="The things to sort" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {shape.groups.items.map((item, i) => (
              <li key={i} className="flex min-h-10 items-center rounded-12 border-2 border-edge bg-card px-3 py-1 text-[20px] font-bold">{item.trim()}</li>
            ))}
          </ol>
        ) : null}
        {shape.kind === 'choice' && hasPictureChoices(q.choices) ? (
          <PictureChoices choices={q.choices!} />
        ) : shape.kind === 'choice' ? (
          <ol aria-label="Choices" className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {(q.choices ?? []).map((choice, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-14 border-2 border-edge px-3 py-2.5 text-[22px] font-bold">
                <span className="flex size-7 flex-none items-center justify-center rounded-pill bg-soft-2 text-[15px]">{CHOICE_LETTERS[i]}</span>
                <FractionText text={choiceText(choice) ?? ''} size={26} rule={3} gap={4} side={5} className="mx-0.5 align-middle" />
              </li>
            ))}
          </ol>
        ) : null}
        {shape.kind === 'reason' ? <ReasonList /> : null}
        <PaperValues shape={shape.kind === 'graph' ? shape.typed : shape} />
        <p className="m-0 text-[15px] leading-[1.4] whitespace-pre-wrap text-body">{writeLine(shape)}</p>
      </div>
    </li>
  )
}

export type PhotoButtonProps = {
  label: string
  /** The photo is being sent: the button waits. */
  busy: boolean
  onPhoto: (file: File) => void
}

/**
 * The one button that sends a photo: a label that looks like a button around a file input. On a phone `capture="environment"` opens the back
 * camera; on a laptop it is a file picker. The input is hidden from the eye, not from the keyboard: the label shows when it has focus.
 */
export function PhotoButton({ label, busy, onPhoto }: PhotoButtonProps) {
  return (
    <label
      className={`relative flex min-h-[68px] w-full items-center justify-center gap-3 rounded-20 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink focus-within:ring-4 focus-within:ring-ink sm:text-[22px] ${
        busy ? 'cursor-default opacity-60' : 'cursor-pointer'
      }`}
    >
      <IconLabel icon={<CameraIcon />}>{busy ? 'Sending your photo...' : label}</IconLabel>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="paper-photo"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPhoto(file)
        }}
      />
    </label>
  )
}

export type PaperSheetProps = {
  questions: QuestionForChild[]
  busy: boolean
  /** Why the last photo did not go, in plain words. */
  error: string | null
  onPhoto: (file: File) => void
  onScreen: () => void
}

/** "Answer on paper": the five questions, numbered, and the photo button. */
export function PaperSheet({ questions, busy, error, onPhoto, onScreen }: PaperSheetProps) {
  return (
    <main className="flex flex-1 flex-col gap-[22px] px-5 pt-6 pb-7">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[15px] font-semibold text-body">Try · on paper</p>
        <h1 className="m-0 text-[28px] leading-[1.18] font-bold tracking-[-0.02em] text-pretty">Write your answers on paper. Number them 1 to 5.</h1>
      </div>
      <ol aria-label="Your five questions" className="m-0 flex list-none flex-col gap-3 p-0">
        {questions.map((q) => (
          <PaperQuestion key={q.index} q={q} />
        ))}
      </ol>
      <div className="flex flex-col gap-1.5">
        <PhotoButton label="Take a photo of your answers" busy={busy} onPhoto={onPhoto} />
        {error ? (
          <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-red-text">
            {error}
          </p>
        ) : null}
        <button type="button" onClick={onScreen} disabled={busy} className={linkButton}>
          Answer on the screen instead
        </button>
      </div>
    </main>
  )
}

function Card({ children, role, label }: { children: ReactNode; role: 'status' | 'alert'; label: string }) {
  return (
    <main className="flex flex-1 flex-col gap-[22px] px-5 pt-[26px] pb-7">
      <section role={role} aria-live={role === 'status' ? 'polite' : undefined} aria-labelledby={label} className={`${card} items-center gap-3.5 text-center`}>
        {children}
      </section>
    </main>
  )
}

/** While Jemma reads the photo. The screen asks again every 3 seconds (SessionFlow). */
export function PaperReading() {
  return (
    <Card role="status" label="paper-reading">
      <Ring />
      <h1 id="paper-reading" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">
        Jemma is reading your answers.
      </h1>
      <p className="m-0 text-[17px] leading-[1.45] text-body">About a minute. You can wait here.</p>
    </Card>
  )
}

export type PaperFailedProps = { busy: boolean; error: string | null; onPhoto: (file: File) => void; onScreen: () => void }

/** The photo could not be read: take it again, or answer on the screen. */
export function PaperFailed({ busy, error, onPhoto, onScreen }: PaperFailedProps) {
  return (
    <main className="flex flex-1 flex-col gap-[22px] px-5 pt-[26px] pb-7">
      <section role="alert" aria-labelledby="paper-failed" className={`${card} gap-3.5`}>
        <h1 id="paper-failed" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">
          Jemma could not read your photo.
        </h1>
        <p className="m-0 text-[17px] leading-[1.45] text-body">Lay the page flat in good light and try again.</p>
      </section>
      <div className="flex flex-col gap-2.5">
        <PhotoButton label="Take the photo again" busy={busy} onPhoto={onPhoto} />
        {error ? (
          <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-red-text">
            {error}
          </p>
        ) : null}
        <button type="button" onClick={onScreen} disabled={busy} className={linkButton}>
          Answer on the screen instead
        </button>
      </div>
    </main>
  )
}
