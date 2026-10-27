import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GemIcon } from '@/components/ui/icons'
import {
  dayNumber,
  decimalComma,
  FORMAT_LABEL,
  loadLearn,
  weekdayShort,
  type PlannedSession,
} from '@/lib/data/p25'

const sectionTitle = 'm-0 text-[17px] font-semibold'

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-soft-2 px-2.5 py-1.5 text-[14px] font-medium">{children}</span>
  )
}

function WeekRow({ s, tonight }: { s: PlannedSession; tonight: boolean }) {
  const title = s.quickCheck ? `${s.shortName}, quick check` : s.shortName
  const sub = s.quickCheck ? `${s.questions} questions · ${s.minutes} min` : `${FORMAT_LABEL[s.format]} · ${s.minutes} min`
  return (
    <li className="flex min-h-[54px] items-center gap-3 border-t border-soft">
      <span className="flex w-12 flex-none flex-col leading-[1.15]">
        <span className="text-[13px] text-body">{weekdayShort(s.plannedFor)}</span>
        <span className="text-[16px] font-bold">{dayNumber(s.plannedFor)}</span>
      </span>
      <span className="flex flex-1 flex-col leading-[1.3]">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] text-body">{sub}</span>
      </span>
      {tonight ? <span className="rounded-pill bg-coral px-[9px] py-1 text-[12px] font-bold text-ink">Tonight</span> : null}
    </li>
  )
}

export default async function ParentLearnPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const { childFirstName: name, tonight, week, helps } = await loadLearn(childId)
  if (!name) notFound()

  if (!tonight) {
    return (
      <div className="flex flex-col gap-5 px-5 pt-3.5 pb-5 leading-[normal] lg:max-w-3xl lg:px-10 lg:pt-8">
        <p className="m-0 text-[14px] font-semibold text-body">Learn</p>
        <p className="m-0 text-[17px] text-body">Nothing is planned yet. Jemma plans the next lesson after the next marked test.</p>
      </div>
    )
  }

  const topic = tonight.shortName
  const stepLabel = tonight.questions ? `${tonight.questions} questions` : 'Questions'

  return (
    <div className="flex flex-col gap-5 px-5 pt-3.5 pb-5 leading-[normal] lg:max-w-3xl lg:px-10 lg:pt-8">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[14px] font-semibold text-body">Learn</p>
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-pretty text-[27px] leading-[1.18] font-semibold tracking-[-0.015em]">
            Tonight: {tonight.minutes} minutes on {topic.charAt(0).toLowerCase() + topic.slice(1)}, with {tonight.withPhrase}.
          </h1>
        </div>
      </div>

      <section aria-labelledby="tonight" className="flex flex-col gap-4 rounded-[22px] border-2 border-ink bg-card p-[18px]">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-coral-text">Tonight</span>
          <h2 id="tonight" className="m-0 text-[21px] leading-[1.25] font-semibold">
            {tonight.topicName}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>
            {tonight.format === 'diagram' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="5" rx="1" /><rect x="3.5" y="14" width="17" height="5" rx="1" /><path d="M12 5v5M8 14v5M12 14v5M16 14v5" /></svg>
            ) : null}
            {FORMAT_LABEL[tonight.format]}
          </Chip>
          <Chip>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            {tonight.minutes} minutes
          </Chip>
          {tonight.questions ? <Chip>{tonight.questions} questions</Chip> : null}
        </div>
        {tonight.whyTonight ? (
          <Link href={tonight.whyTonight.href} className="flex items-center gap-2 text-[14px] text-ink no-underline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
            <span>
              <span className="text-body">Why tonight:</span>{' '}
              <span className="font-semibold underline underline-offset-[3px]">{tonight.whyTonight.label}</span>
            </span>
          </Link>
        ) : null}
        <ol aria-label="Session steps" className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
          {['Warm-up', 'Learn', stepLabel, 'Results'].map((label) => (
            <li key={label} className="flex flex-col gap-1.5 text-[12px] font-semibold text-body">
              <span aria-hidden="true" className="h-1 rounded-pill bg-ink" />
              {label}
            </li>
          ))}
        </ol>
        <Link
          href={`/p/${childId}/learn/handover`}
          className="flex h-14 items-center justify-center gap-2.5 rounded-[16px] bg-coral text-[17px] font-bold text-ink no-underline"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          Start, then hand {name} the phone
        </Link>
        <p className="m-0 text-center text-[13px] leading-[1.4] text-body">
          {name} sees how she did at the end, never a score. You see everything.
        </p>
      </section>

      <section aria-labelledby="week" className="flex flex-col rounded-20 border border-line bg-card px-4 pt-3.5 pb-2">
        <h2 id="week" className={`${sectionTitle} mb-1.5`}>
          This week
        </h2>
        <ol className="m-0 flex list-none flex-col p-0">
          {week.map((s) => (
            <WeekRow key={s.id} s={s} tonight={s.id === tonight.id} />
          ))}
        </ol>
        <p className="mt-1 mb-1.5 text-[13px] text-body">Rest days in between. Jemma moves things if a new test comes in.</p>
      </section>

      <section aria-labelledby="helps" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="helps" className={sectionTitle}>
            What helps {name}
          </h2>
          <p className="m-0 text-[14px] text-body">On {helps.family.replace(/s$/, '')} topics so far, average out of 5</p>
        </div>
        {helps.rows.map((r) => (
          <div key={r.format} className="flex flex-col gap-1.5">
            <span className="flex justify-between text-[15px]">
              <span className="font-semibold">{FORMAT_LABEL[r.format]}</span>
              {r.status === 'measured' ? (
                <span>
                  <strong className="font-bold">{decimalComma(r.average)}</strong>{' '}
                  <span className="text-body">· {r.sessions} sessions</span>
                </span>
              ) : (
                <span className="text-body">
                  <strong className="font-semibold text-ink">Too early to tell</strong> · {r.sessions} {r.sessions === 1 ? 'session' : 'sessions'}
                </span>
              )}
            </span>
            {r.status === 'measured' ? (
              <span aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-pill bg-soft-4">
                <span className="rounded-pill bg-ink" style={{ width: `${(r.average / 5) * 100}%` }} />
              </span>
            ) : (
              <span aria-hidden="true" className="h-2.5 rounded-pill border-[1.5px] border-dashed border-muted-2" />
            )}
          </div>
        ))}
        <p className="m-0 text-[13px] leading-[1.45] text-body">Measured per topic, never a label. Jemma keeps trying all three, so this can change.</p>
      </section>
    </div>
  )
}
