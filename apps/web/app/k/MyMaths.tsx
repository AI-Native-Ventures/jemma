import Link from 'next/link'
import { IconLabel } from '@/components/ui/IconLabel'
import { getScreenShape } from '@/lib/data/own-screens'
import { getPastPractice } from '@/lib/data/p120'
import { getLearnerToday, type LearnerToday } from '@/lib/data/p27'
import { getMyMaths } from '@/lib/data/p80'
import { ADD_A_GRADE, higherGradeLine, noTopicsLine } from '@/lib/own-grades'
import { getMyLimit } from '@/lib/data/p161'
import { JoinClassCard } from './join/JoinClassCard'
import { LimitCard } from './LimitCard'
import { GradeChips } from './maths/GradeChips'
import { gapLine, levelOfScore, lockOf, progressLabel, rowScore, summaryLine, summaryOf } from './maths/format'
import { ProgressDots, ProgressLegend } from './maths/ProgressDots'
import { OwnWorkLink } from './OwnWorkLink'
import { PastPractice } from './PastPractice'
import { PracticeCard } from './PracticeCard'
import { PracticeRow } from './Practise'
import { AppHeader } from './session/_parts/AppHeader'
import { ChevronRight, FormatChip, MinutesChip } from './session/_parts/Chips'
import { Diamond, Gem } from './session/_parts/Gems'
import { PreviewBars } from './session/_parts/PreviewBars'
import { WorkspaceSwitch } from './WorkspaceSwitch'

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(22,22,22,0.06)]'
const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'

/** What the address may carry: `?class=<id>` (a class of the learner's own workspace), or the old `?grade=7` (the CAPS class of that grade). */
export type MathsQuery = { class?: string | string[]; grade?: string | string[] }

/** "You've fixed N topics so far": there from one fixed topic on. At none it says nothing (a line that reads "fixed 0" is a dead line). It sits with "What to practise". Learners never read the word gap (P160). */
function GapsCard({ today, tone }: { today: LearnerToday; tone: 'today' | 'rest' }) {
  if (today.fixed < 1) return null
  const stroke = tone === 'today' ? '#8F8D88' : '#161616'
  return (
    <div className="flex items-center gap-3.5 rounded-20 border border-line bg-card px-[18px] py-4 text-ink">
      <span className="flex flex-1 flex-col gap-2">
        <span className="text-[17px] font-semibold">
          You&apos;ve fixed {today.fixed} {today.fixed === 1 ? 'topic' : 'topics'} so far
        </span>
        <span aria-hidden="true" className="flex items-center gap-1.5">
          {today.gems.map((kind, i) => (
            <Gem key={i} kind={tone === 'today' && kind === 'half' ? 'empty' : kind} stroke={stroke} />
          ))}
        </span>
        {tone === 'today' && today.toGo > 0 ? <span className="text-[14px] text-body">{today.toGo} more to go</span> : null}
      </span>
    </div>
  )
}

/** The one short line under "My maths": what the old home said as its heading (P124), by state. */
function lineOf(today: LearnerToday): string {
  const { firstName, tonight, next } = today
  if (tonight) return `Hi ${firstName}. One thing tonight, then you're done.`
  // On a learner's own record no teacher ever plans anything, so the line asks what to practise instead of waiting for a lesson that never comes.
  if (today.workspace === 'own') return `What will you practise today, ${firstName}?`
  return next ? `No new lesson from your class tonight. Your next lesson is on ${next.day}.` : 'No new lesson from your class tonight.'
}

/** Tonight's lesson: the topic, the minutes and the format, and Start. */
function TonightCard({ tonight }: { tonight: NonNullable<LearnerToday['tonight']> }) {
  return (
    <section aria-labelledby="tonight" className={`${card} gap-[18px]`}>
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold text-red-text">Tonight</span>
        <h2 id="tonight" className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.01em]">{tonight.topic}</h2>
      </div>
      {tonight.preview ? <PreviewBars spec={tonight.preview} /> : null}
      <div className="flex flex-wrap gap-2">
        <MinutesChip minutes={tonight.minutes} />
        <FormatChip format={tonight.format} />
      </div>
      <Link
        href={`/k/session/${tonight.sessionId}`}
        className="flex min-h-[68px] items-center justify-center gap-3 rounded-20 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink no-underline sm:text-[24px]"
      >
        <IconLabel icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="#161616" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>}>Start</IconLabel>
      </Link>
    </section>
  )
}

/** A later lesson that is booked: its day, topic, minutes and format. */
function NextCard({ next }: { next: NonNullable<LearnerToday['next']> }) {
  return (
    <section aria-labelledby="wed" className={`${card} gap-3.5`}>
      <span className="text-[14px] font-semibold text-red-text">{next.day}</span>
      <h2 id="wed" className="m-0 text-[25px] leading-[1.2] font-bold">{next.topic}</h2>
      <span className="flex flex-wrap gap-2">
        {next.minutes ? <MinutesChip minutes={next.minutes} /> : null}
        {next.format ? <FormatChip format={next.format} /> : null}
      </span>
    </section>
  )
}

/**
 * "My maths", the learner's one page (P128): the address /k and the address /k/maths draw it. The old "Today" home is gone and everything it showed is
 * here, with the current thing first: tonight's lesson with Start, or the practice card (Jemma is writing it, it failed with Try again, or the first
 * suggestion with its Practise button). Then, in this order: the switch's grade chips, "Suggested for you", "Your gaps" (with the line "You've fixed N
 * gaps so far"), "Join your class", "Add your own work", "Your practice" (P120), and the key and the parts of Mathematics, a row of circles for each
 * part, one circle for each topic of the part filled by the learner's own score, drawn like the teacher's Long view (P122), with one short line under them
 * ("2 of 10 secure · 3 started"). A part the map has no topic for keeps its count in words ("5 of 6 right", never a percent). The count is the
 * learner's own, from class tests the teacher has shared and from their own practices.
 * In My own the switch is on top and, under it, a chip for each class of the learner's private workspace (the CAPS class of a grade, and a curriculum
 * of the learner's own): the lists are that one class's map (the address carries it, `?class=<id>`; the old `?grade=7` means the CAPS class of that
 * grade), with one plain line above a class of a grade higher than the learner's own and "No topics yet" for a class with no map.
 * The first suggestion is the practice card's, so the list under "Suggested for you" does not show it a second time.
 */
export async function MyMaths({ searchParams }: { searchParams?: Promise<MathsQuery> } = {}) {
  const shape = await getScreenShape((await searchParams) ?? {})
  const own = shape.workspace === 'own' ? shape : null
  const [today, { maths, status }, past, limit] = await Promise.all([getLearnerToday(), getMyMaths(own?.picked?.classId), getPastPractice(), getMyLimit()])
  const { firstName, tonight, next } = today
  // P155: tonight's lesson is never a gate, so `lock` is only there while a practice is being written (Practise is held back, nothing else).
  const lock = lockOf(status)
  // P161: with no practice left (today's 2, or the family's month), Practise is held back too; Learn never is.
  const locked = lock !== null || limit !== null
  const grade = own?.picked?.grade ?? null
  const topicCount = maths.strands.reduce((n, s) => n + s.topics.length, 0)
  // Nothing to list: My own with no grade yet, or a grade with no map (a school outside South Africa has no CAPS map to load).
  const empty = own !== null && (grade === null || topicCount === 0)
  const higher = own && grade !== null ? higherGradeLine(grade, own.schoolGrade) : null
  const toPart = (family: string) => `/k/maths/${family}${own?.picked ? `?class=${own.picked.classId}` : ''}`

  // The practice card names the first suggestion when it is ready: the list does not repeat that topic.
  const keyOf = (c: { topicId?: string | null; topicName: string }) => `${c.topicId ?? ''}|${c.topicName}`
  const featured = !tonight && today.practice === 'ready' ? today.suggestion : null
  const suggestions = maths.suggestions.filter((s) => featured === null || keyOf(s) !== keyOf(featured))
  // The card of a practice that is being written already says so: the note says it once (it is only a fallback when the two reads disagree for a moment).
  const note = lock && !empty && today.practice !== 'writing' ? lock.text : null
  const pickLine = !tonight && today.workspace !== 'own' && today.practice === 'ready' && today.suggestion !== null && limit === null
  const gapsCard = <GapsCard today={today} tone={tonight ? 'today' : 'rest'} />

  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={firstName} />
      <div className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">
        <WorkspaceSwitch current={shape.workspace} alone={own?.alone} />
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <Diamond size={16} className="mt-3 flex-none" />
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">My maths</h1>
          </div>
          <p className="m-0 pl-[26px] text-[17px] leading-[1.4] text-body">{lineOf(today)}</p>
        </div>

        {tonight ? (
          <TonightCard tonight={tonight} />
        ) : (
          <>
            {pickLine ? <p className="m-0 -mb-2 px-1 text-[16px] leading-[1.45] text-body">Pick something to practise.</p> : null}
            {limit && today.practice !== 'writing' ? <LimitCard {...limit} /> : <PracticeCard state={today.practice} suggestion={today.suggestion} workspace={today.workspace} />}
            {next ? <NextCard next={next} /> : null}
          </>
        )}

        {note ? <p className="m-0 rounded-20 border border-[#FFDC93] bg-gold-wash p-4 text-[16px] leading-[1.45]">{note}</p> : null}

        {own ? <GradeChips grades={own.grades} current={own.picked?.classId ?? null} /> : null}
        {own && grade === null ? <p className="m-0 text-[16px] leading-[1.45] text-body">{ADD_A_GRADE}</p> : null}
        {higher ? <p className="m-0 text-[16px] leading-[1.45] text-body">{higher}</p> : null}
        {empty && grade !== null ? <p className="m-0 rounded-20 border border-line bg-card p-4 text-[16px] leading-[1.45] text-body">{noTopicsLine(grade)}</p> : null}

        {suggestions.length > 0 && !empty ? (
          <section aria-labelledby="suggested" className="flex flex-col gap-2.5">
            <h2 id="suggested" className="m-0 text-[17px] font-bold">Suggested for you</h2>
            <ul className={list}>
              {suggestions.map((s) => (
                <PracticeRow key={keyOf(s)} choice={{ topicId: s.topicId, topicName: s.topicName }} name={s.topicName} lines={[s.reason, rowScore(s.score)]} locked={locked} />
              ))}
            </ul>
          </section>
        ) : null}

        {(maths.gaps.length > 0 || today.fixed > 0) && !empty ? (
          <section aria-labelledby="gaps" className="flex flex-col gap-2.5">
            <h2 id="gaps" className="m-0 text-[17px] font-bold">What to practise</h2>
            {gapsCard}
            {maths.gaps.length > 0 ? (
              <ul className={list}>
                {maths.gaps.map((g) => (
                  <PracticeRow key={keyOf(g)} choice={{ topicId: g.topicId, topicName: g.topicName }} name={g.topicName} lines={[gapLine(g)]} locked={locked} />
                ))}
              </ul>
            ) : null}
          </section>
        ) : empty ? (
          gapsCard
        ) : null}

        <JoinClassCard where="home" />
        {own ? <OwnWorkLink /> : null}

        <PastPractice rows={past} />

        {empty ? null : (
          <section aria-labelledby="all" className="flex flex-col gap-2.5">
            <h2 id="all" className="m-0 text-[17px] font-bold">All of {maths.subject}</h2>
            {topicCount > 0 ? <ProgressLegend /> : null}
            <ul className={list}>
              {maths.strands.map((s) => {
                // One circle for each topic of the part in map order. A part with no topic in the map keeps its count in words.
                const levels = s.topics.map((t) => levelOfScore(t.score))
                const summary = summaryOf(levels)
                return (
                  <li key={s.family} className="border-t border-soft first:border-t-0">
                    <Link href={toPart(s.family)} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-[17px] leading-[1.3] font-semibold">{s.label}</span>
                        {levels.length > 0 ? <ProgressDots levels={levels} label={progressLabel(s.label, summary)} /> : null}
                        <span className="text-[14px] text-body">{levels.length > 0 ? summaryLine(summary) : rowScore(s.score)}</span>
                      </span>
                      <ChevronRight />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
