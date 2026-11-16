import type { Metadata } from 'next'
import Link from 'next/link'
import { IconLabel } from '@/components/ui/IconLabel'
import { getLearnerToday, type LearnerToday } from '@/lib/data/p27'
import { JoinClassCard } from './join/JoinClassCard'
import { AppHeader } from './session/_parts/AppHeader'
import { ChevronRight, FormatChip, MinutesChip } from './session/_parts/Chips'
import { Diamond, Gem } from './session/_parts/Gems'
import { PreviewBars } from './session/_parts/PreviewBars'
import { OwnWorkLink } from './OwnWorkLink'
import { PracticeCard } from './PracticeCard'
import { WorkspaceSwitch } from './WorkspaceSwitch'

export const metadata: Metadata = { title: 'Today' }
export const dynamic = 'force-dynamic'

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,29,54,0.06)]'

/** "You've fixed N gaps so far": there from one fixed gap on. At none it says nothing (a line that reads "fixed 0" is a dead line). */
function GapsCard({ today, tone }: { today: LearnerToday; tone: 'today' | 'rest' }) {
  if (today.fixed < 1) return null
  const stroke = tone === 'today' ? '#8C89A3' : '#1F1D36'
  return (
    <Link
      href="/k/maths"
      className="flex items-center gap-3.5 rounded-20 border border-line bg-card py-4 pr-3.5 pl-[18px] text-ink no-underline"
    >
      <span className="flex flex-1 flex-col gap-2">
        <span className="text-[17px] font-semibold">
          You&apos;ve fixed {today.fixed} {today.fixed === 1 ? 'gap' : 'gaps'} so far
        </span>
        <span aria-hidden="true" className="flex items-center gap-1.5">
          {today.gems.map((kind, i) => (
            <Gem key={i} kind={tone === 'today' && kind === 'half' ? 'empty' : kind} stroke={stroke} />
          ))}
        </span>
        {tone === 'today' && today.toGo > 0 ? <span className="text-[14px] text-body">{today.toGo} more to go</span> : null}
      </span>
      <ChevronRight />
    </Link>
  )
}

export default async function ChildToday() {
  const today = await getLearnerToday()
  const { firstName, tonight, next } = today

  if (!tonight) {
    // Nothing planned. On a learner's own record no teacher ever plans anything, so the home asks what to practise instead of waiting for a lesson
    // that never comes. A school learner is told plainly that no lesson comes from the class tonight (and which day the next one is, when one is booked).
    const own = today.workspace === 'own'
    const heading = own
      ? `What will you practise today, ${firstName}?`
      : next
        ? `No new lesson from your class tonight. Your next lesson is on ${next.day}.`
        : 'No new lesson from your class tonight.'
    const pickLine = !own && today.practice === 'ready' && today.suggestion !== null
    const nextCard = next ? (
      <section aria-labelledby="wed" className={`${card} gap-3.5`}>
        <span className="text-[14px] font-semibold text-coral-text">{next.day}</span>
        <h2 id="wed" className="m-0 text-[25px] leading-[1.2] font-bold">{next.topic}</h2>
        <span className="flex flex-wrap gap-2">
          {next.minutes ? <MinutesChip minutes={next.minutes} /> : null}
          {next.format ? <FormatChip format={next.format} /> : null}
        </span>
      </section>
    ) : null
    return (
      <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
        <AppHeader firstName={firstName} />
        <div className="flex flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px]">
          <WorkspaceSwitch current={today.workspace} alone={today.alone} />
          <div className="flex items-start gap-2.5">
            <Diamond size={16} className="mt-3 flex-none" />
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{heading}</h1>
          </div>
          {own ? null : nextCard}
          {pickLine ? <p className="m-0 -mb-2 px-1 text-[16px] leading-[1.45] text-body">Pick something to practise.</p> : null}
          <PracticeCard state={today.practice} suggestion={today.suggestion} workspace={today.workspace} />
          {own ? nextCard : null}
          <GapsCard today={today} tone="rest" />
          {today.workspace === 'own' ? <OwnWorkLink /> : null}
          <JoinClassCard where="home" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={firstName} />
      <div className="flex flex-1 flex-col gap-[22px] px-5 pt-[18px] pb-[22px]">
        <WorkspaceSwitch current={today.workspace} alone={today.alone} />
        <div className="flex items-start gap-2.5">
          <Diamond size={16} className="mt-3 flex-none" />
          <h1 className="m-0 text-[31px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">
            Hi {firstName}. One thing tonight, then you&apos;re done.
          </h1>
        </div>
        <section aria-labelledby="tonight" className={`${card} gap-[18px]`}>
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold text-coral-text">Tonight</span>
            <h2 id="tonight" className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.01em]">{tonight.topic}</h2>
          </div>
          {tonight.preview ? <PreviewBars spec={tonight.preview} /> : null}
          <div className="flex flex-wrap gap-2">
            <MinutesChip minutes={tonight.minutes} />
            <FormatChip format={tonight.format} />
          </div>
          <Link
            href={`/k/session/${tonight.sessionId}`}
            className="flex min-h-[68px] items-center justify-center gap-3 rounded-20 bg-coral px-5 py-3 text-center text-[20px] font-bold text-balance text-ink no-underline sm:text-[24px]"
          >
            <IconLabel icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>}>Start</IconLabel>
          </Link>
        </section>
        <GapsCard today={today} tone="today" />
        {today.workspace === 'own' ? <OwnWorkLink /> : null}
        <JoinClassCard where="home" />
      </div>
    </div>
  )
}
