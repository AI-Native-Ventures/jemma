import Link from 'next/link'
import type { ReactNode } from 'react'
import { FractionText } from '@/app/k/session/_parts/Frac'
import { ChevronRightIcon } from '@/components/ui/icons'
import { BackHeader } from '../tests/back-header'
import { dayText, practisedLine, scoreLine, typesetFor, type LearnerResult, type MissedQuestion, type PartLine, type TopicLine } from './logic'

// The pieces of the three Topics screens (P139). Server parts: no state, no data of their own. Every maths line (a prompt, an answer, the AI's notes)
// is drawn by FractionText, typeset for Grades 8 to 12 and as it always was for the primary grades.

/** The page frame: the back header, then the body. */
export function Shell({ href, backLabel, eyebrow, title, children }: { href: string; backLabel: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="leading-[normal] lg:max-w-[860px]">
      <BackHeader href={href} backLabel={backLabel} eyebrow={eyebrow} title={title} />
      <div className="flex flex-col gap-4 px-5 pt-2 pb-8 lg:px-6">{children}</div>
    </div>
  )
}

export function Heading({ title, line }: { title: string; line?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.015em] text-pretty">{title}</h1>
      {line ? <p className="m-0 text-[15px] leading-[1.4] text-body">{line}</p> : null}
    </div>
  )
}

/** A small bar for a percent: ink, and coral when the class is below half. */
export function Bar({ percent, className = 'h-2 w-full' }: { percent: number | null; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex overflow-hidden rounded-pill bg-soft-4 ${className}`}>
      {percent === null ? null : <span className={percent < 50 ? 'bg-coral' : 'bg-ink'} style={{ width: `${Math.max(percent, 3)}%` }} />}
    </span>
  )
}

export const Stat = ({ value, label }: { value: string; label: string }) => (
  <span className="flex flex-col gap-0.5 rounded-14 border border-line bg-card p-3">
    <span className="text-[22px] font-bold tabular-nums">{value}</span>
    <span className="text-[13px] text-body">{label}</span>
  </span>
)

const percentText = (p: number | null) => (p === null ? '-' : `${p}%`)

const rowCard = 'flex flex-col gap-3 rounded-18 border border-line bg-card py-4 pr-3 pl-4 text-ink no-underline'

/** One card for a part of Mathematics: its name, the class average and how many learners practised. */
export function PartCard({ href, line, learnersInClass }: { href: string; line: PartLine; learnersInClass: number }) {
  return (
    <Link href={href} className={rowCard}>
      <span className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[18px] leading-[1.3] font-semibold">{line.label}</span>
          <span className="text-[14px] text-body">
            {line.topicCount} topic{line.topicCount === 1 ? '' : 's'} · {line.tried === 0 ? 'none practised yet' : `${line.tried} practised`}
          </span>
        </span>
        <span className="flex flex-col items-end leading-[1.1]">
          <span className="text-[24px] font-bold tabular-nums">{percentText(line.percent)}</span>
          <span className="text-[12px] text-body">class average</span>
        </span>
        <ChevronRightIcon className="mt-1.5 flex-none" />
      </span>
      <Bar percent={line.percent} />
      <span className="text-[14px] text-body">{practisedLine(line.tally.learners, learnersInClass)}</span>
    </Link>
  )
}

/** One card for a topic of a part. */
export function TopicCard({ href, line, name, learnersInClass }: { href: string; line: TopicLine; name: string; learnersInClass: number }) {
  return (
    <Link href={href} className={rowCard}>
      <span className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[17px] leading-[1.3] font-semibold">{name}</span>
          <span className="text-[14px] text-body">{practisedLine(line.tally.learners, learnersInClass)}</span>
        </span>
        <span className="flex flex-col items-end leading-[1.1]">
          <span className="text-[22px] font-bold tabular-nums">{percentText(line.percent)}</span>
          <span className="text-[12px] text-body">class average</span>
        </span>
        <ChevronRightIcon className="mt-1.5 flex-none" />
      </span>
      <Bar percent={line.percent} />
    </Link>
  )
}

/** A short plain line in a card: nothing to show yet. */
export const EmptyCard = ({ children }: { children: ReactNode }) => (
  <p className="m-0 rounded-18 border border-line bg-card p-4 text-[16px] leading-[1.45] text-body">{children}</p>
)

/** Every learner of the class with the last result on the topic: score, day, number of tries and a small bar. A learner who has not tried is told so. */
export function LearnerList({ results, base }: { results: LearnerResult[]; base: string }) {
  return (
    <section aria-labelledby="learners" className="flex flex-col gap-2.5">
      <h2 id="learners" className="m-0 text-[18px] font-semibold">
        Learners
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {results.map((r) => (
          <li key={r.childId} className="rounded-14 border border-line bg-card px-4 py-3">
            <Link href={`${base}/learners/${r.childId}`} className="flex flex-col gap-2 text-ink no-underline">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[16px] font-semibold">{r.name}</span>
                {r.last ? (
                  <span className="text-[16px] font-bold tabular-nums">{r.last.percent}%</span>
                ) : (
                  <span className="text-[14px] font-semibold text-body">Not tried</span>
                )}
              </span>
              <Bar percent={r.last ? r.last.percent : null} className="h-1.5 w-full" />
              <span className="text-[14px] text-body">
                {r.last
                  ? `${scoreLine(r.last.right, r.last.asked)} · ${dayText(r.last.finishedAt)} · ${r.tries} ${r.tries === 1 ? 'try' : 'tries'}`
                  : 'No practice on this topic yet'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

const maths = (text: string, grade: number) => <FractionText text={text} size={17} rule={2} gap={3} side={3} typeset={typesetFor(grade)} />

function Missed({ q, grade }: { q: MissedQuestion; grade: number }) {
  return (
    <li className="flex flex-col gap-2 rounded-14 bg-ground p-3.5">
      <span className="text-[13px] font-semibold text-coral-text">
        Missed by {q.missedBy} of {q.triedBy} learner{q.triedBy === 1 ? '' : 's'} who tried it
      </span>
      <span className="text-[16px] leading-[1.45] font-semibold [overflow-wrap:anywhere]">{maths(q.prompt, grade)}</span>
      {q.commonWrong ? (
        <span className="text-[14px] leading-[1.45] [overflow-wrap:anywhere]">
          <strong className="font-bold">Most common wrong answer:</strong> {maths(q.commonWrong.answer, grade)}
        </span>
      ) : null}
      {q.why ? (
        <span className="text-[14px] leading-[1.45] [overflow-wrap:anywhere]">
          <strong className="font-bold">Why it goes wrong:</strong> {maths(q.why, grade)}
        </span>
      ) : null}
      {q.rightWay ? (
        <span className="text-[14px] leading-[1.45] [overflow-wrap:anywhere]">
          <strong className="font-bold">The right way:</strong> {maths(q.rightWay, grade)}
        </span>
      ) : null}
    </li>
  )
}

/**
 * The AI analysis of a topic: made from what the AI already wrote with the practice questions, nothing new is asked of it. The questions the class
 * missed most with the AI's own note on the mistake and its right way, then the learners who need help first.
 */
export function AnalysisCard({ missed, needHelp, anyone, grade, base }: { missed: MissedQuestion[]; needHelp: LearnerResult[]; anyone: boolean; grade: number; base: string }) {
  return (
    <section aria-labelledby="ai" className="flex flex-col gap-4 rounded-20 border border-line bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 id="ai" className="m-0 text-[18px] font-semibold">
          AI analysis
        </h2>
        <p className="m-0 text-[14px] leading-[1.4] text-body">Made from the questions and notes Jemma&apos;s AI already wrote for these practices. Nothing new is asked of it here.</p>
      </div>
      {!anyone ? (
        <p className="m-0 text-[16px] leading-[1.45] text-body">No one has practised this topic yet, so there is nothing to look at.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <h3 className="m-0 text-[15px] font-semibold">Questions the class missed most</h3>
            {missed.length === 0 ? (
              <p className="m-0 text-[15px] leading-[1.45] text-body">Nobody got a question wrong.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {missed.map((q) => (
                  <Missed key={q.prompt} q={q} grade={grade} />
                ))}
              </ol>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="m-0 text-[15px] font-semibold">Who needs help first</h3>
            {needHelp.length === 0 ? (
              <p className="m-0 text-[15px] leading-[1.45] text-body">Everyone who tried is at 80% or more.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {needHelp.map((r, i) => (
                  <li key={r.childId}>
                    <Link href={`${base}/learners/${r.childId}`} className="flex items-center gap-3 rounded-14 bg-ground px-3 py-2.5 text-ink no-underline">
                      <span aria-hidden="true" className={`flex size-7 flex-none items-center justify-center rounded-pill text-[14px] font-bold ${i === 0 ? 'bg-ink text-white' : 'bg-soft-4'}`}>
                        {i + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                        <span className="text-[16px] font-semibold">{r.name}</span>
                        <span className="text-[14px] text-body">
                          {scoreLine(r.last!.right, r.last!.asked)} · {r.last!.percent}% · {r.tries} {r.tries === 1 ? 'try' : 'tries'}
                        </span>
                      </span>
                      <ChevronRightIcon className="flex-none" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  )
}
