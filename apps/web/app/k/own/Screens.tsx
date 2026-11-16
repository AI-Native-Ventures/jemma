import Link from 'next/link'
import type { ReactNode } from 'react'
import { PracticeRow } from '../Practise'
import { AppHeader } from '../session/_parts/AppHeader'
import { ChevronRight } from '../session/_parts/Chips'
import { FractionText } from '../session/_parts/Frac'
import { Diamond } from '../session/_parts/Gems'
import { WorkspaceSwitch } from '../WorkspaceSwitch'
import { NOT_OWN, homeTestLine, rightLine, wrongLine, type OwnCurriculumRow, type OwnCurriculumState, type OwnTestRow, type OwnTestView } from './format'
import { Poll, RetryTest } from './TestPieces'

// The screens of "Add your own work" in My own (P97), drawn from their props alone (the server pages read the data, see lib/data/own-uploads.ts), so
// they render the same on the server and in a test. The parts that need a browser (the poll, the retry, the camera) are in the client files beside.

const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'
const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,29,54,0.06)]'
const linkButton = 'flex min-h-11 items-center justify-center text-[16px] font-semibold text-ink underline underline-offset-[3px]'
const choiceCard = 'flex min-h-[112px] w-full cursor-pointer flex-col justify-center gap-1 rounded-20 border-2 border-ink bg-card px-5 py-4 text-left text-ink no-underline'

/** The one shell of these screens: the phone header (the laptop has the sidebar) and a column of the same width as "My maths". */
export function Shell({ firstName, children }: { firstName?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      {firstName ? <AppHeader firstName={firstName} /> : null}
      <main className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">{children}</main>
    </div>
  )
}

export function Title({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Diamond size={16} className="mt-3 flex-none" />
      <h1 id={id} className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{children}</h1>
    </div>
  )
}

/** A link back one step, with room to tap. */
export function Back({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center self-start text-[16px] font-semibold text-ink no-underline">
      <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>
      {children}
    </Link>
  )
}

/** The same coral ring the lesson-loading screen and the practice card turn while Jemma works. */
export function Ring() {
  return (
    <svg aria-hidden="true" width="44" height="44" viewBox="0 0 28 28" className="motion-safe:animate-spin">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#EEEDF5" strokeWidth="3.5" />
      <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#FF6A4D" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

/** A learner in My school who opens "Add your own work": one plain line and the switch. Nothing can be added there. */
export function NotOwnScreen({ firstName }: { firstName: string }) {
  return (
    <Shell firstName={firstName}>
      <WorkspaceSwitch current="school" />
      <Title>Add your own work</Title>
      <p className="m-0 text-[17px] leading-[1.45] text-body">{NOT_OWN}</p>
    </Shell>
  )
}

const TEST_NOTE: Record<OwnTestRow['state'], string> = { reading: 'Marked test: Jemma is reading it', failed: 'Marked test: could not be read', marked: '' }
const CURRICULUM_NOTE: Record<OwnCurriculumState, string> = { reading: 'Jemma is reading it', draft: 'Ready to check', approved: 'Done', failed: 'Could not be read' }

/** The home: two big choices, then what the learner added (marked tests with their state and result, own curricula with their state). */
export function OwnHomeScreen({ firstName, tests, curricula, alone = false }: { firstName: string; tests: OwnTestRow[]; curricula: OwnCurriculumRow[]; alone?: boolean }) {
  return (
    <Shell firstName={firstName}>
      <WorkspaceSwitch current="own" alone={alone} />
      <Title>Add your own work</Title>
      <div className="flex flex-col gap-3">
        <Link href="/k/own/test" className={choiceCard}>
          <span className="text-[22px] leading-[1.2] font-bold">A marked test</span>
          <span className="text-[16px] leading-[1.4] text-body">Take a photo of a test you got back. Jemma reads the ticks and crosses.</span>
        </Link>
        <Link href="/k/own/curriculum" className={choiceCard}>
          <span className="text-[22px] leading-[1.2] font-bold">Your own curriculum</span>
          <span className="text-[16px] leading-[1.4] text-body">{alone ? "A plan or a book's contents." : "Your school's plan or a book's contents."} Jemma turns it into topics you check.</span>
        </Link>
      </div>
      {tests.length + curricula.length > 0 ? (
        <section aria-labelledby="added" className="flex flex-col gap-2.5">
          <h2 id="added" className="m-0 text-[17px] font-bold">What you added</h2>
          <ul className={list}>
            {tests.map((t) => (
              <Row key={`t-${t.id}`} href={`/k/own/test/${t.id}`} title={t.state === 'marked' ? homeTestLine(t.right, t.outOf) : TEST_NOTE[t.state]} note={t.day} />
            ))}
            {curricula.map((c) => (
              <Row key={`c-${c.id}`} href={`/k/own/curriculum/${c.id}`} title={c.name} note={[`Grade ${c.grade}`, CURRICULUM_NOTE[c.state], c.day].filter(Boolean).join(' · ')} />
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  )
}

function Row({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <li className="border-t border-soft first:border-t-0">
      <Link href={href} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[17px] leading-[1.3] font-semibold text-pretty">{title}</span>
          {note ? <span className="text-[14px] text-body">{note}</span> : null}
        </span>
        <ChevronRight />
      </Link>
    </li>
  )
}

function Mark({ right }: { right: boolean }) {
  return (
    <span role="img" aria-label={right ? 'Right' : 'Not right'} className={`flex size-8 flex-none items-center justify-center rounded-pill ${right ? 'bg-soft-4 text-ink' : 'bg-coral-tint text-coral-text'}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {right ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6 6 18" />}
      </svg>
    </span>
  )
}

/** The screen of one marked test, in each of its states: Jemma reading it, marked (each question, then what to practise), or not readable. */
export function TestScreen({ view, firstName }: { view: OwnTestView; firstName?: string }) {
  if (view.state === 'reading') {
    return (
      <Shell firstName={firstName}>
        <Poll active />
        <section role="status" aria-live="polite" aria-labelledby="own-test-reading" className={`${card} items-center gap-3.5 text-center`}>
          <Ring />
          <h1 id="own-test-reading" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma is reading your test.</h1>
          <p className="m-0 text-[17px] leading-[1.45] text-body">About a minute. You can wait here.</p>
        </section>
      </Shell>
    )
  }
  if (view.state === 'failed') {
    return (
      <Shell firstName={firstName}>
        <Poll active={false} />
        <section role="alert" aria-labelledby="own-test-failed" className={`${card} gap-4`}>
          <h1 id="own-test-failed" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma could not read this test.</h1>
          <RetryTest paperId={view.paperId} />
        </section>
        <Link href="/k/own" className={linkButton}>Back</Link>
      </Shell>
    )
  }
  return (
    <Shell firstName={firstName}>
      <Poll active={view.finding} />
      <Back href="/k/own">Add your own work</Back>
      <Title>{rightLine(view.right, view.outOf)}</Title>
      <ol aria-label="Your questions" className={list}>
        {view.questions.map((q) => (
          <li key={q.n} className="flex items-start gap-3 border-t border-soft py-3 first:border-t-0">
            <Mark right={q.right} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[17px] leading-[1.3] font-semibold text-pretty">
                <FractionText text={q.prompt} size={22} rule={2} gap={3} side={3} />
              </span>
              <span className="text-[14px] leading-[1.35] text-body">{q.answer.trim() ? `You wrote: ${q.answer.trim()}` : 'You left this blank.'}</span>
            </span>
          </li>
        ))}
      </ol>
      {view.leftOut > 0 ? <p className="m-0 text-[15px] leading-[1.4] text-body">Questions Jemma could not read: {view.leftOut}</p> : null}
      {view.gaps.length > 0 ? (
        <section aria-labelledby="own-practise" className="flex flex-col gap-2.5">
          <h2 id="own-practise" className="m-0 text-[17px] font-bold">What to practise</h2>
          <ul className={list}>
            {view.gaps.map((g) => (
              <PracticeRow key={`${g.topicId ?? ''}|${g.topicName}`} choice={{ topicId: g.topicId, topicName: g.topicName }} name={g.topicName} lines={[wrongLine(g.wrong)]} locked={false} />
            ))}
          </ul>
        </section>
      ) : view.finding ? (
        <p className="m-0 text-[16px] leading-[1.45] text-body">Jemma is finding what to practise.</p>
      ) : null}
    </Shell>
  )
}
