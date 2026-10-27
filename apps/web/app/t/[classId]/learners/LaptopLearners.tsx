import Link from 'next/link'
import type { ChildProfileView, LearnerView, LearnersView, TopicMark } from '@/lib/data/p19'
import type { LearnerDetailExtras } from '@/lib/data/p33'

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const svg = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

const diamond = (size: number, mt: string) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`flex-none ${mt}`}>
    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
  </svg>
)

const chevron = (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...svg} stroke="#1F1D36" className="flex-none">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

const docIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" {...svg}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
)

function Change({ change }: { change: number | null }) {
  if (change === null) return <span />
  const base = 'inline-flex min-w-[52px] items-center justify-center rounded-pill px-2 py-0.5 text-[13px] font-semibold'
  if (change === 0) return <span className={`${base} bg-soft-2 text-body`}>same</span>
  const down = change < 0
  return (
    <span className={`${base} gap-0.5 ${down ? 'bg-[#FFEDE8] text-coral-text' : 'bg-soft-4 text-ink'}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="3" {...svg} aria-hidden={undefined} role="img" aria-label={down ? 'down' : 'up'}>
        <path d={down ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'} />
      </svg>
      {Math.abs(change)}
    </span>
  )
}

function MarkRow({ m, first, href }: { m: TopicMark; first: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`grid min-h-12 grid-cols-[minmax(150px,1.6fr)_minmax(36px,0.7fr)_44px_58px_18px] items-center gap-2.5 text-ink no-underline ${first ? '' : 'border-t border-soft'}`}
    >
      <span className="text-[14px] font-semibold">{m.name}</span>
      <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-pill bg-soft-4">
        <span className="block h-full rounded-pill bg-ink" style={{ width: `${m.pct}%` }} />
      </span>
      <span className="text-right text-[16px] font-bold tabular-nums">{m.pct}%</span>
      <Change change={m.change} />
      {chevron}
    </Link>
  )
}

function StageGlyph({ stage }: { stage: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      {stage === 'practising' ? (
        <>
          <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" />
        </>
      ) : (
        <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#1F1D36" strokeWidth="1.6" />
      )}
    </svg>
  )
}

const card = 'flex min-w-0 flex-col gap-2.5 rounded-18 bg-ground p-4'

function Detail({ view, profile, extras, base }: { view: LearnerView; profile: ChildProfileView; extras: LearnerDetailExtras; base: string }) {
  const heading =
    profile.average === null
      ? `${view.name} has no marked test yet.`
      : `${view.name} is at ${profile.average}%.${profile.topGap ? ` Their gap is ${lower(profile.topGap)}${profile.misconception ? `: ${lower(profile.misconception)}` : ''}.` : ''}`
  const markHref = (m: TopicMark) => (m.gapKey ? `${base}/gaps/${m.gapKey}` : profile.testId ? `${base}/tests/${profile.testId}` : `${base}/tests`)
  const paperHref = profile.testId ? `${base}/tests/${profile.testId}` : `${base}/tests`
  const tonight = extras.tonight
  return (
    <section aria-labelledby="child" className="flex min-w-0 flex-[1_1_560px] flex-col gap-[18px] rounded-20 border border-line bg-card px-6 py-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-12 flex-none items-center justify-center rounded-pill bg-coral-soft text-[18px] font-bold">
            {view.name.charAt(0)}
          </span>
          <div className="flex flex-col leading-[1.25]">
            <h2 id="child" className="m-0 text-[24px] font-bold tracking-[-0.01em]">
              {view.name}
            </h2>
            <span className="text-[14px] text-body">
              Grade {view.grade}
              {view.linkedTo ? ` · linked to ${view.linkedTo}` : ''}
            </span>
          </div>
        </div>
        <Link href={paperHref} className="flex h-[46px] flex-none items-center justify-center gap-2 rounded-14 bg-ink px-[18px] text-[15px] font-semibold text-white no-underline">
          <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" {...svg} stroke="#FFFFFF">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
          See her paper or fix a mark
        </Link>
      </div>
      {view.linkedTo ? (
        <p className="m-0 inline-flex items-center gap-2 gap-y-0 self-start rounded-pill bg-soft-2 px-3 py-1.5 text-[14px] font-medium">
          <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.9" {...svg} stroke="#1F1D36">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Same profile {view.linkedTo} sees. You can fix marks.
        </p>
      ) : null}
      <p className="m-0 flex gap-2.5 text-[20px] leading-[1.35] font-semibold text-pretty">
        {diamond(13, 'mt-[7px]')}
        <span>{heading}</span>
      </p>

      <div className="flex flex-wrap items-start gap-[18px]">
        <section aria-labelledby="marks" className="flex min-w-0 flex-[1.2_1_340px] flex-col gap-0.5">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 id="marks" className="m-0 text-[16px] font-semibold">
              Marks by topic
            </h3>
            <span className="text-[13px] text-body">Change since Term {Math.max(profile.term - 1, 1)}</span>
          </div>
          {profile.marks.map((m, i) => (
            <MarkRow key={m.name} m={m} first={i === 0} href={markHref(m)} />
          ))}
        </section>
        <section aria-labelledby="noticed" className="flex min-w-0 flex-[1_1_300px] flex-col">
          <h3 id="noticed" className="m-0 mb-0.5 text-[16px] font-semibold">
            What Jemma has noticed
          </h3>
          <ul className="m-0 list-none p-0">
            {profile.noticed.map((n, i) => (
              <li key={i} className={`flex flex-col gap-2 py-3 ${i > 0 ? 'border-t border-soft' : ''}`}>
                <span className="text-[15px] leading-[1.45] font-medium">{n.text}</span>
                <span className="flex flex-wrap gap-1.5">
                  {n.chips.map((c) => (
                    <Link key={c} href={paperHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-12 bg-soft-2 px-3 text-[14px] font-semibold text-ink no-underline">
                      {docIcon}
                      {c}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        <section aria-labelledby="notes" className={`${card} flex-[1.3_1_250px]`}>
          <div className="flex items-center justify-between gap-2">
            <h3 id="notes" className="m-0 text-[16px] font-semibold">
              Your notes
            </h3>
            <Link href={`${base}/learners/${view.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-12 border-[1.5px] border-ink bg-card px-3 text-[14px] font-semibold text-ink no-underline">
              <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.2" {...svg}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add a note
            </Link>
          </div>
          {view.notes.length === 0 ? <span className="text-[15px] text-body">No notes yet.</span> : null}
          {view.notes.map((n, i) => (
            <div key={n.id} className={`flex flex-col gap-[3px] ${i > 0 ? 'border-t border-line pt-2.5' : ''}`}>
              <span className="text-[13px] text-body">{n.label}</span>
              <span className="text-[15px] leading-[1.45]">{n.text}</span>
            </div>
          ))}
          {view.linkedTo ? (
            <p className="m-0 text-[13px] text-body">
              {view.linkedTo} sees your notes on {view.name}&apos;s profile.
            </p>
          ) : null}
        </section>
        <section aria-labelledby="att" className={`${card} flex-[1_1_210px]`}>
          <div className="flex items-baseline justify-between">
            <h3 id="att" className="m-0 text-[16px] font-semibold">
              Attendance
            </h3>
            <span className="text-[14px] font-semibold">
              {view.present} of {view.recorded} days
            </span>
          </div>
          <ol aria-label={extras.daysLabel} className="m-0 grid list-none grid-cols-5 gap-[5px] p-0">
            {extras.days.map((d, i) =>
              d.status === 'away' ? (
                <li key={i} className="flex flex-col items-center gap-0.5 rounded-[10px] border border-[#FFC9BB] bg-[#FFEDE8] py-1.5">
                  <span className="text-[12px] text-body">{d.day}</span>
                  <span className="text-[11px] leading-[14px] font-bold text-coral-text">Away</span>
                </li>
              ) : (
                <li key={i} className="flex flex-col items-center gap-0.5 rounded-[10px] bg-soft-2 py-1.5">
                  <span className="text-[12px] text-body">{d.day}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.4" {...svg} stroke="#1F1D36">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  <span className="sr-only">{d.status === 'late' ? 'late' : 'here'}</span>
                </li>
              ),
            )}
          </ol>
          <p className="m-0 text-[13px] text-body">
            {view.awayLabel ? `Away on ${view.awayLabel}. ` : ''}Today&apos;s register is next.
          </p>
        </section>
        <section aria-labelledby="tonight" className={`${card} flex-[1_1_170px] gap-2`}>
          <h3 id="tonight" className="m-0 text-[16px] font-semibold">
            Tonight&apos;s lesson
          </h3>
          {tonight ? (
            <>
              <span className="text-[15px] leading-[1.4]">{tonight.title}</span>
              <span className="text-[13px] text-body">
                {tonight.format} · {tonight.minutes} minutes · planned {tonight.planned}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                <StageGlyph stage={tonight.stage} />
                Stage: {tonight.stage}
              </span>
            </>
          ) : (
            <span className="text-[15px] leading-[1.4] text-body">Nothing planned tonight.</span>
          )}
        </section>
      </div>
    </section>
  )
}

/** Board `laptop-teacher-learners`: the class list beside the selected learner's profile. */
export function LaptopLearners({
  v,
  classId,
  selected,
  detail,
}: {
  v: LearnersView
  classId: string
  selected: string
  detail: { view: LearnerView; profile: ChildProfileView; extras: LearnerDetailExtras } | null
}) {
  const base = `/t/${classId}`
  return (
    <div className="px-9 pt-8 pb-10 leading-[normal]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[780px] flex-col gap-2.5">
            <p className="m-0 text-[15px] text-body">Learners · {v.className}</p>
            <div className="flex items-start gap-3">
              {diamond(16, 'mt-3.5')}
              <h1 className="m-0 text-[36px] leading-[1.15] font-semibold tracking-[-0.02em] text-pretty">{v.headline}</h1>
            </div>
          </div>
          <Link href={`${base}/register`} className="flex h-[46px] flex-none items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-[18px] text-[15px] font-semibold text-ink no-underline">
            {v.registerTaken ? "Change today's register" : "Take today's register"}
          </Link>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <section aria-labelledby="list" className="flex min-w-0 flex-[0_1_340px] flex-col gap-1.5 rounded-20 border border-line bg-card px-3 py-4">
            <div className="flex items-baseline justify-between px-1.5 pb-1">
              <h2 id="list" className="m-0 text-[17px] font-semibold">
                {v.learners.length} learners
              </h2>
              <span className="text-[13px] text-body">Average · days here</span>
            </div>
            <ul className="m-0 list-none p-0">
              {v.learners.map((l, i) => {
                const on = l.id === selected
                return (
                  <li key={l.id} className={i > 0 ? 'border-t border-soft' : ''}>
                    <Link
                      href={`${base}/learners?child=${l.id}`}
                      scroll={false}
                      aria-current={on ? 'true' : undefined}
                      className={`my-0.5 flex min-h-16 items-center gap-3 rounded-14 px-2.5 py-2 text-ink no-underline ${on ? 'bg-soft-4' : ''}`}
                    >
                      <span aria-hidden="true" className={`flex size-9 flex-none items-center justify-center rounded-pill text-[14px] font-bold ${on ? 'bg-coral-soft' : 'bg-soft-3'}`}>
                        {l.name.charAt(0)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                        <span className={`text-[16px] ${on ? 'font-bold' : 'font-semibold'}`}>{l.name}</span>
                        <span className="text-[13px] text-body">{l.topGap ?? 'No open gaps'}</span>
                      </span>
                      <span className="flex flex-col items-end leading-[1.3]">
                        <span className="text-[16px] font-bold tabular-nums">{l.average === null ? '-' : `${l.average}%`}</span>
                        <span className="text-[12px] text-body">
                          {l.present} of {l.recorded} days
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
          {detail ? <Detail {...detail} base={base} /> : null}
        </div>
      </div>
    </div>
  )
}
