import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EmptyState, Headline, NeedsYouList, WhatJemmaDid } from '@/components/blocks'
import { ChevronRightIcon } from '@/components/ui/icons'
import { getClassHome, getGapDetail, type ClassGapView, type ClassHome, type GapStage } from '@/lib/data/p18'
import { LaptopHome } from './LaptopHome'
import { FullLogLink } from './log/FullLogLink'
import { Only } from './Only'
import { ShareCard } from './ShareCard'

const dot = 'size-[9px] rounded-pill'

function Dots({ filled, total }: { filled: number; total: number }) {
  return (
    <span aria-hidden="true" className="flex gap-[3px]">
      {Array.from({ length: total }, (_, i) =>
        i < filled ? <span key={i} className={`${dot} bg-ink`} /> : <span key={i} className={`${dot} border-[1.5px] border-muted-2`} />,
      )}
    </span>
  )
}

function Rank({ n, first }: { n: number; first: boolean }) {
  return (
    <span
      className={`flex size-7 flex-none items-center justify-center rounded-pill text-[14px] font-bold ${first ? 'bg-ink text-white' : 'bg-soft-4 text-ink'}`}
    >
      {n}
    </span>
  )
}

function Glyph({ stage, size }: { stage: GapStage | null; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {stage === 'practising' ? (
        <>
          <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth={size === 12 ? 1.6 : 1.4} />
        </>
      ) : (
        <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" />
      )}
    </svg>
  )
}

const gapCard =
  'flex flex-col gap-3 rounded-18 border border-line bg-card py-4 pr-3 pl-4 text-ink no-underline'

function HomeGap({ gap, index, base, hideDots }: { gap: ClassGapView; index: number; base: string; hideDots: boolean }) {
  return (
    <Link href={`${base}/gaps/${gap.key}`} className={gapCard}>
      <span className="flex items-start gap-3">
        <Rank n={index + 1} first={index === 0} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] leading-[1.3] font-semibold">{gap.topicName}</span>
          <span className="flex items-center gap-2 text-[14px] text-body">
            {!hideDots ? <Dots filled={gap.count} total={gap.total} /> : null}
            {gap.count} of {gap.total} learners
          </span>
        </span>
        <ChevronRightIcon className="mt-1 flex-none" />
      </span>
      {gap.mistake ? (
        <span className="ml-10 rounded-12 bg-soft-2 px-3 py-2.5 text-[14px] leading-[1.45]">
          {gap.mistake.label}: {gap.mistake.example.pre}
          <strong className="font-bold whitespace-nowrap">{gap.mistake.example.strong}</strong>
        </span>
      ) : null}
    </Link>
  )
}

function stageCounts(g: ClassGapView) {
  return [g.counts.practising ? `${g.counts.practising} practising` : '', g.counts.new ? `${g.counts.new} new` : '']
    .filter(Boolean)
    .join(', ')
}

function NextGap({ gap, index, base }: { gap: ClassGapView; index: number; base: string }) {
  const lesson = index > 0 && gap.nextLesson ? `${gap.nextLesson.name}'s lesson is ${gap.nextLesson.weekday}` : ''
  const sub = [`${gap.count} of ${gap.total} learners`, stageCounts(gap), lesson]
    .filter(Boolean)
    .join(' · ')
  if (index > 0) {
    return (
      <Link href={`${base}/gaps/${gap.key}`} className="flex items-center gap-3 rounded-18 border border-line bg-card py-4 pr-3 pl-4 text-ink no-underline">
        <Rank n={index + 1} first={false} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[17px] font-semibold">{gap.topicName}</span>
          <span className="text-[14px] text-body">{sub}</span>
        </span>
        <ChevronRightIcon className="flex-none" />
      </Link>
    )
  }
  return (
    <Link href={`${base}/gaps/${gap.key}`} className={gapCard}>
      <span className="flex items-start gap-3">
        <Rank n={1} first />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[17px] leading-[1.3] font-semibold">{gap.topicName}</span>
          <span className="text-[14px] text-body">{sub}</span>
        </span>
        <ChevronRightIcon className="mt-1 flex-none" />
      </span>
      <span className="ml-10 flex flex-wrap gap-1.5">
        {gap.learners.map((l) => (
          <span
            key={l.childId}
            className={`inline-flex items-center gap-[5px] rounded-pill py-[5px] pr-2.5 pl-2 text-[13px] font-semibold ${
              l.stage === 'practising' ? 'border border-[#FFC9BB] bg-[#FFF1ED]' : 'bg-soft-2'
            }`}
          >
            <Glyph stage={l.stage} size={12} />
            {l.name}
          </span>
        ))}
      </span>
    </Link>
  )
}

function Gaps({ home, base, hideDots }: { home: ClassHome; base: string; hideDots: boolean }) {
  return (
    <section aria-labelledby="gaps" className="flex flex-col gap-2.5">
      <h2 id="gaps" className="m-0 text-[18px] font-semibold">
        What the class doesn&apos;t get yet
      </h2>
      {home.gaps.map((g, i) =>
        home.mode === 'next' ? <NextGap key={g.key} gap={g} index={i} base={base} /> : <HomeGap key={g.key} gap={g} index={i} base={base} hideDots={hideDots} />,
      )}
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col gap-0.5 rounded-12 bg-soft-2 px-3 py-2.5">
      <span className="text-[22px] font-bold tabular-nums">{value}</span>
      <span className="text-[13px] text-body">{label}</span>
    </span>
  )
}

function LatestTest({ test, base }: { test: NonNullable<ClassHome['latestTest']>; base: string }) {
  return (
    <Link href={`${base}/tests/${test.id}`} aria-labelledby="latest" className="flex flex-col gap-3 rounded-18 border border-line bg-card p-4 text-ink no-underline">
      <span className="flex items-center justify-between">
        <span id="latest" className="text-[14px] font-semibold text-body">
          Latest test
        </span>
        <ChevronRightIcon />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[17px] font-semibold">{test.title}</span>
        <span className="text-[14px] text-body">
          Written {test.writtenOn} · {test.papers} papers
          {test.toCheck > 0 ? ` · ${test.toCheck} answer${test.toCheck === 1 ? '' : 's'} still to check` : ''}
        </span>
      </span>
      <span className="grid grid-cols-3 gap-2">
        <Stat value={test.average === null ? '-' : `${test.average}%`} label="Average" />
        <Stat value={test.range ? `${test.range[0]} to ${test.range[1]}` : '-'} label="Range, %" />
        <Stat value={test.hardest === null ? '-' : `Q${test.hardest}`} label="Hardest" />
      </span>
    </Link>
  )
}

function NextCards({ home, base }: { home: ClassHome; base: string }) {
  const r = home.reteach
  return (
    <>
      {home.needsYou.length === 0 ? (
        <EmptyState body={home.doneName ? `Nothing right now. ${home.doneName}'s paper is done.` : 'Nothing right now.'} />
      ) : (
        <NeedsYouList items={home.needsYou} />
      )}
      {r && !r.doneAt ? (
        <Link href={`${base}/gaps/${home.topGapKey}`} className="flex items-center gap-3.5 rounded-18 border border-line bg-card py-4 pr-3 pl-4 text-ink no-underline">
          <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-14 bg-coral-tint">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="5" rx="1" />
              <rect x="3.5" y="14" width="17" height="5" rx="1" />
              <path d="M12 5v5M8 14v5M12 14v5M16 14v5" />
            </svg>
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-coral-text">Today</span>
            <span className="text-[17px] font-semibold">Reteach {r.topicName.split(' with ')[0]!.toLowerCase()}</span>
            <span className="text-[14px] text-body">
              {r.content.title} · {r.content.minutes} minutes · plan ready
            </span>
          </span>
          <ChevronRightIcon className="flex-none" />
        </Link>
      ) : null}
      <section aria-labelledby="lessons" className="flex flex-col gap-2.5 rounded-18 border border-line bg-card p-4">
        <h2 id="lessons" className="m-0 text-[16px] font-semibold">
          Last night&apos;s lessons
        </h2>
        {home.lastNightSessions.map((s) => (
          <Link
            key={s.childId}
            href={`${base}/learners/${s.childId}`}
            className="flex min-h-16 items-center gap-3 rounded-14 bg-ground py-2 pr-1.5 pl-2.5 text-ink no-underline"
          >
            <span aria-hidden="true" className="relative flex size-[38px] flex-none items-center justify-center rounded-pill bg-coral-soft text-[14px] font-bold">
              {s.name.slice(0, 1)}
              <svg width="18" height="18" viewBox="0 0 16 16" className="absolute -right-1 -bottom-1 rounded-pill bg-card p-px">
                <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
                <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.4" />
              </svg>
            </span>
            <span className="flex flex-1 flex-col gap-0.5 leading-[1.3]">
              <span className="text-[16px] font-semibold">
                {s.name} · {s.right} of {s.of}
              </span>
              <span className="text-[14px] text-body">{s.note}</span>
            </span>
            <ChevronRightIcon className="flex-none" />
          </Link>
        ))}
        {home.waiting.length > 0 ? (
          <p className="m-0 flex items-center gap-2.5 text-[14px] leading-[1.4] text-body">
            <span aria-hidden="true" className="flex flex-none">
              {home.waiting.slice(0, 4).map((n, i) => (
                <span
                  key={n}
                  className={`flex size-[26px] items-center justify-center rounded-pill border-2 border-card bg-soft-3 text-[11px] font-bold text-ink ${i > 0 ? '-ml-2' : ''}`}
                >
                  {n.slice(0, 1)}
                </span>
              ))}
            </span>
            {home.waiting.length === 1
              ? `${home.waiting[0]} hasn't done theirs yet.`
              : `${home.waiting.slice(0, -1).join(', ')} and ${home.waiting[home.waiting.length - 1]} haven't done theirs yet.`}
          </p>
        ) : null}
      </section>
    </>
  )
}

export default async function TeacherClassHome({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ gap?: string }>
}) {
  const { classId } = await params
  const { gap } = await searchParams
  const home = await getClassHome(classId)
  if (!home) notFound()
  const base = `/t/${classId}`
  const next = home.mode === 'next'
  const phone = <PhoneHome home={home} base={base} classId={classId} />
  if (next) return <div className="lg:mx-auto lg:max-w-[640px]">{phone}</div>
  const key = home.gaps.some((g) => g.key === gap) ? gap! : home.topGapKey
  const detail = key ? await getGapDetail(classId, key) : null
  return (
    <>
      <Only on="phone">{phone}</Only>
      <Only on="laptop">
        <LaptopHome home={home} detail={detail} base={base} classId={classId} />
      </Only>
    </>
  )
}

function PhoneHome({ home, base, classId }: { home: ClassHome; base: string; classId: string }) {
  const next = home.mode === 'next'
  const desktopOff = home.needsYou.some((item) => item.desktopOff)
  return (
    <div className="flex flex-col gap-5 px-5 pt-3.5 pb-5 leading-[normal]">
      {next ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14px] font-semibold text-body">Class · {home.dateLabel}</p>
          <Headline>{home.headline}</Headline>
        </div>
      ) : (
        <Headline action={home.topGapKey && !desktopOff ? { href: `${base}/gaps/${home.topGapKey}`, label: 'See the papers it comes from' } : undefined}>
          {home.headline}
        </Headline>
      )}
      {home.shareCard ? <ShareCard classId={classId} card={home.shareCard} /> : null}
      {next ? <NextCards home={home} base={base} /> : <NeedsYouList items={home.needsYou} />}
      <Gaps home={home} base={base} hideDots={desktopOff} />
      {!next && home.latestTest ? <LatestTest test={home.latestTest} base={base} /> : null}
      {next ? (
        <section aria-labelledby="did" className="flex flex-col gap-2.5 rounded-18 border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 id="did" className="m-0 text-[16px] font-semibold">
              What Jemma did since yesterday
            </h2>
            <Link href={`${base}/notifications`} className="flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-[3px]">
              See all
            </Link>
          </div>
          <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
            {home.activity.map((e, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-[1.4]">
                <span className={`${e.at.length > 5 ? 'w-[66px]' : 'w-10'} flex-none text-body tabular-nums`}>{e.at}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
          <FullLogLink href={`${base}/log`} />
        </section>
      ) : (
        <div className="flex flex-col gap-1">
          <WhatJemmaDid entries={home.activity} seeAllHref={`${base}/notifications`} />
          <FullLogLink href={`${base}/log`} className="px-4" />
        </div>
      )}
    </div>
  )
}
