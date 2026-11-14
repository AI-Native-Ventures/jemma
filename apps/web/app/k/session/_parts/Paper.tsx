'use client'

import type { ReactNode } from 'react'
import { answerShape, type AnswerShape, type QuestionForChild } from '../[sessionId]/logic'
import { Frac, FractionText } from './Frac'

// A practice answered on paper: the choice before the first Try question, the sheet of five questions with the photo button, the wait while
// Jemma reads the photo, and the card for a photo that could not be read. All of them are drawn from their props alone (the state lives in
// SessionFlow), so they render the same on the server and in a test.

const CHOICE_LETTERS = ['A', 'B', 'C', 'D']

/** The same coral ring the lesson-loading screen and the practice card turn while Jemma works. */
function Ring() {
  return (
    <svg aria-hidden="true" width="44" height="44" viewBox="0 0 28 28" className="motion-safe:animate-spin">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#EEEDF5" strokeWidth="3.5" />
      <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#FF6A4D" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M11 17.5h2" />
    </svg>
  )
}

/** Both choices are the same size and the same weight: neither is pushed. */
const choiceButton =
  'flex h-[76px] w-full cursor-pointer items-center justify-center gap-3.5 rounded-20 border-2 border-ink bg-card px-4 text-[22px] font-bold text-ink'
const linkButton = 'flex min-h-11 cursor-pointer items-center justify-center border-0 bg-transparent text-[16px] font-semibold text-ink underline underline-offset-[3px]'
const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,29,54,0.06)]'

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
          <CameraIcon />
          Answer on paper
        </button>
        <button type="button" onClick={onScreen} className={choiceButton}>
          <PhoneIcon />
          Answer on the screen
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
    case 'missing':
      return 'Write the missing number.'
    case 'fraction':
      return 'Write the top number and the bottom number.'
    case 'mixed':
      return 'Write the whole number, then the fraction.'
    case 'money':
      return 'Write the amount, like 12,50.'
    case 'decimal':
      return 'Write a number with a comma, like 0,5.'
    case 'whole':
      return 'Write a whole number.'
    // The four kinds of a senior class: the same lines as the question screen, for a pencil.
    case 'expression':
      return shape.form === 'factorised'
        ? 'Write it as a product of brackets, like (x + 2)(x - 2).'
        : shape.form === 'expanded'
          ? 'Write it with no brackets, like x\u00b2 + 4x + 4.'
          : 'Write an expression, like 2x + 3.'
    case 'equation':
      return 'Write the answer, like x = 4. Two answers: x = 3 or x = -1.'
    case 'point':
      return 'Write the x and the y of the point, like (2; 3).'
    case 'number':
      return 'Write a number. It may be negative, like -3.'
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
        {shape.kind === 'choice' ? (
          <ol aria-label="Choices" className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {(q.choices ?? []).map((choice, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-14 border-2 border-edge px-3 py-2.5 text-[22px] font-bold">
                <span className="flex size-7 flex-none items-center justify-center rounded-pill bg-soft-2 text-[15px]">{CHOICE_LETTERS[i]}</span>
                <FractionText text={choice} size={26} rule={3} gap={4} side={5} className="mx-0.5 align-middle" />
              </li>
            ))}
          </ol>
        ) : null}
        <p className="m-0 text-[15px] leading-[1.4] text-body">{writeLine(shape)}</p>
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
      className={`relative flex h-[68px] w-full items-center justify-center gap-3 rounded-20 bg-coral text-[22px] font-bold text-ink focus-within:ring-4 focus-within:ring-ink ${
        busy ? 'cursor-default opacity-60' : 'cursor-pointer'
      }`}
    >
      <CameraIcon />
      {busy ? 'Sending your photo...' : label}
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
          <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-coral-text">
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
          <p role="alert" className="m-0 text-center text-[15px] leading-[1.4] text-coral-text">
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
