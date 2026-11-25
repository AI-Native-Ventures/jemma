'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BeadRing, GemBurst } from '@/components/sa'
import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'

// P163: the screens of the level check around its questions: the top bar, the start, Jemma writing the questions, a failure, and the end. The words
// are for the learner: short, plain, no marks and no score.

const big = 'flex min-h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink no-underline disabled:opacity-60'
const quiet = 'flex min-h-14 w-full items-center justify-center rounded-18 px-5 py-3 text-center text-[17px] font-semibold text-ink no-underline'

/** The bar over every screen of the check: a cross that stops for now (the answers so far are kept) and the name of the check. */
export function LevelTop() {
  return (
    <header className="flex items-center gap-2 pt-2.5 pr-3 pb-1.5 pl-2">
      <Link href="/k" aria-label="Stop for now" className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </Link>
      <span className="flex-1 text-[16px] font-semibold text-body">Find my level</span>
    </header>
  )
}

function Row({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <li className="flex min-h-[64px] items-center gap-3.5 border-t border-soft first:border-t-0">
      <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-14 bg-gold-tint">
        {icon}
      </span>
      <span className="flex flex-1 flex-col leading-[1.3]">
        <span className="text-[18px] font-semibold">{title}</span>
        <span className="text-[15px] text-body">{sub}</span>
      </span>
    </li>
  )
}

const stroke = { fill: 'none', stroke: '#161616', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/** Before the first question: what the check is, in three lines, and Start. */
export function LevelStart({ firstName, grade, of = 12, pending, onStart }: { firstName: string; grade: number; of?: number; pending: boolean; onStart: () => void }) {
  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-4 pb-7">
      <h1 className="m-0 text-[32px] leading-[1.12] font-bold tracking-[-0.02em] text-pretty">Let&apos;s find your level, {firstName}.</h1>
      <ul className="m-0 flex list-none flex-col rounded-[24px] border border-line bg-card px-4 py-1.5">
        <Row
          icon={<svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>}
          title={`${of} questions`}
          sub={`From all of Grade ${grade}`}
        />
        <Row
          icon={<svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M10 2h4" /></svg>}
          title="About 10 minutes"
          sub="No rush. Stop any time."
        />
        <Row
          icon={<svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z" /></svg>}
          title="No marks"
          sub="Just do your best."
        />
      </ul>
      <p className="m-0 rounded-18 bg-green-tint px-4 py-3.5 text-[16px] leading-[1.45] font-semibold">Not sure? Tap &ldquo;I don&apos;t know yet&rdquo;. That helps Jemma too.</p>
      <div className="flex-1" />
      <PendingButton type="button" pending={pending} onClick={onStart} className={big}>
        Start
      </PendingButton>
    </main>
  )
}

/** While Jemma writes the 12 questions. The page looks again by itself. */
export function LevelWriting() {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-5 pt-14 pb-7 text-center">
      <section role="status" aria-live="polite" className="flex flex-col items-center gap-3.5">
        <BeadRing lit={7} size={120} />
        <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">Jemma is writing your questions.</h1>
        <p className="m-0 text-[18px] leading-[1.45] text-body">About a minute. You can wait here.</p>
      </section>
    </main>
  )
}

/** Jemma could not write the questions: one button tries again. */
export function LevelFailed({ pending, onRetry, error }: { pending: boolean; onRetry: () => void; error?: string | null }) {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-14 pb-7">
      <section role="alert" className="flex flex-col gap-4 rounded-[26px] border border-line bg-card p-5">
        <h1 className="m-0 text-[26px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma could not write your questions.</h1>
        <p className="m-0 text-[16px] leading-[1.45] text-body">Nothing is lost. Try again in a moment.</p>
        <PendingButton type="button" pending={pending} onClick={onRetry} className={big}>
          <IconLabel
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 4v4.5h-4.5" />
              </svg>
            }
          >
            Try again
          </IconLabel>
        </PendingButton>
        {error ? <p role="alert" className="m-0 text-center text-[14px] text-red-text">{error}</p> : null}
      </section>
    </main>
  )
}

/** The end: no score, only that Jemma knows where to start, and the first topic. `first` is null when every topic was solid. */
export function LevelDone({ firstName, first }: { firstName: string; first: string | null }) {
  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-7">
      <div className="flex flex-col items-center gap-3 text-center">
        <GemBurst width={172} />
        <h1 className="m-0 text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-pretty">All done, {firstName}!</h1>
        <p className="m-0 text-[18px] leading-[1.45] text-body">Jemma knows where to start now.</p>
      </div>
      {first ? (
        <section aria-labelledby="level-first" className="flex flex-col gap-1.5 rounded-[24px] border border-line bg-card p-5">
          <span id="level-first" className="text-[14px] font-semibold text-red-text">Your first lesson</span>
          <span className="text-[24px] leading-[1.2] font-bold text-pretty">{first}</span>
          <span className="text-[16px] leading-[1.45] text-body">Jemma is writing it now.</span>
        </section>
      ) : (
        <section aria-labelledby="level-first" className="flex flex-col gap-1.5 rounded-[24px] border border-line bg-card p-5">
          <span id="level-first" className="text-[14px] font-semibold text-red-text">Every topic right</span>
          <span className="text-[22px] leading-[1.25] font-bold text-pretty">Pick something new to learn in My maths.</span>
        </section>
      )}
      <div className="flex-1" />
      <Link href="/k" className={big}>
        Go to my maths
      </Link>
      <Link href="/k/maths" className={quiet}>
        Pick a topic myself
      </Link>
    </main>
  )
}
