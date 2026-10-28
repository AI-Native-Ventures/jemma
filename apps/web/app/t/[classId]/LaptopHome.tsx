import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { NeedsYouList } from '@/components/blocks'
import { Headline } from '@/components/blocks'
import { markReteachDone } from './gaps/actions'
import { PrintButton } from './gaps/LaptopPrintButton'
import { numberWord, type ClassGapView, type ClassHome, type GapDetail } from '@/lib/data/p18'

const diamond = (size: number, mt: string) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`flex-none ${mt}`}>
    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
  </svg>
)

const camera = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
)

const chevron = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

function GapCard({ gap, index, on, base }: { gap: ClassGapView; index: number; on: boolean; base: string }) {
  return (
    <Link
      href={`${base}?gap=${gap.key}`}
      scroll={false}
      aria-current={on ? 'true' : undefined}
      className={`flex flex-col gap-2.5 rounded-18 bg-card p-4 text-ink no-underline ${on ? 'border-2 border-ink' : 'border border-line'}`}
    >
      <span className="flex items-start gap-3">
        <span className={`flex size-7 flex-none items-center justify-center rounded-pill text-[14px] font-bold ${on ? 'bg-ink text-white' : 'bg-soft-4'}`}>{index + 1}</span>
        <span className="flex flex-1 flex-col gap-[3px]">
          <span className="text-[17px] leading-[1.3] font-semibold">{gap.topicName}</span>
          <span className="text-[14px] text-body">
            {gap.count} of {gap.total} learners
          </span>
        </span>
      </span>
      {gap.mistake ? (
        <span className="ml-10 rounded-12 bg-soft-2 px-3 py-[9px] text-[14px]">
          {gap.mistake.label}:{' '}
          <strong className="font-bold">{gap.mistake.example.strong}</strong>
        </span>
      ) : null}
    </Link>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col gap-0.5 rounded-12 bg-soft-2 px-3 py-2.5">
      <span className="text-[22px] font-bold">{value}</span>
      <span className="text-[13px] text-body">{label}</span>
    </span>
  )
}

function Detail({ detail, base }: { detail: GapDetail; base: string }) {
  const { gap, reteach } = detail
  const done = Boolean(reteach?.doneAt)
  const strips = reteach?.content.youNeed.split(',')[0]
  // The headline already says how many; the panel goes on with why it matters, then who is a good partner.
  const why = [
    ...detail.why.split(/(?<=\.)\s+/).filter((sentence) => !/^\d+ of \d+ /.test(sentence)),
    ...gap.partners.map((p) => `${p.name} got all ${numberWord(p.questions)} right.`),
  ].join(' ') || detail.why
  return (
    <section aria-labelledby="detail" className="flex min-w-0 flex-[1.5_1_460px] flex-col gap-[18px] rounded-[22px] border border-line bg-card p-[22px]">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-body">
          Gap {detail.index + 1} of {detail.of}
        </span>
        <h2 id="detail" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em]">
          {gap.topicName}
        </h2>
        <p className="m-0 flex gap-2.5 text-[16px] leading-[1.45]">
          {diamond(12, 'mt-1.5')}
          <span>{why}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className="m-0 text-[15px] font-semibold">Who&apos;s stuck</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2">
          {gap.learners.map((l, i) => (
            <Link key={l.childId} href={`${base}/learners/${l.childId}`} className="flex items-center gap-2.5 rounded-14 bg-ground px-3 py-2.5 text-ink no-underline">
              <span aria-hidden="true" className={`flex size-8 flex-none items-center justify-center rounded-pill text-[13px] font-bold ${i === 0 ? 'bg-coral-soft' : 'bg-soft-3'}`}>
                {l.name.slice(0, 1)}
              </span>
              <span className="flex flex-col leading-[1.3]">
                <span className="text-[15px] font-semibold">{l.name}</span>
                <span className="text-[13px] text-body">{l.wrote.join(', ')}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {gap.mistake ? (
        <div className="flex flex-col gap-2.5">
          <h3 className="m-0 text-[15px] font-semibold">The mistake, seen {gap.mistake.seen} times</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-2">
            {gap.mistake.rows.map((r) => (
              <span key={r.n} className="flex flex-col gap-0.5 rounded-12 bg-soft-2 px-3 py-2.5">
                <span className="text-[12px] font-semibold text-body">
                  Q{r.n} · {r.learners} learners
                </span>
                <span className="text-[17px] font-bold">{r.text}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {reteach ? (
        <div className="flex flex-col gap-3 rounded-18 bg-ground p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-[15px] font-semibold">
              Reteach tomorrow · {reteach.content.title.toLowerCase()} · {reteach.content.minutes} min
            </h3>
            {strips ? <span className="text-[13px] text-body">{strips}</span> : null}
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5 p-0">
            {reteach.content.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-[1.45]">
                <span className="w-10 flex-none pt-0.5 text-[12px] font-semibold text-body">{s.minutes} min</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <form action={markReteachDone.bind(null, reteach.id)} className="contents">
              <PendingButton
                type="submit"
                disabled={done}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-12 border-none bg-ink px-4 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {done ? 'Reteach done' : 'Mark reteach done'}
              </PendingButton>
            </form>
            <PrintButton />
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Board `laptop-teacher-class`: needs-you strip, gaps beside the selected gap, then what Jemma did. */
export function LaptopHome({ home, detail, base }: { home: ClassHome; detail: GapDetail | null; base: string }) {
  const selected = detail?.gap.key
  const test = home.latestTest
  return (
    <div className="px-9 pt-8 pb-10 leading-[normal]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[760px] flex-col gap-2.5">
            <p className="m-0 text-[15px] text-body">Class · {home.dateLabel}</p>
            <Headline size="laptop">{home.headline}</Headline>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href={`${base}/report`} className="flex h-[46px] items-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-[18px] text-[15px] font-semibold text-ink no-underline">
              Class report
            </Link>
            <Link href={`${base}/snap`} className="flex h-[46px] items-center gap-2 rounded-14 bg-ink px-[18px] text-[15px] font-semibold text-white no-underline">
              {camera}
              Snap a test
            </Link>
          </div>
        </div>

        <NeedsYouList items={home.needsYou} wide />

        <div className="flex flex-wrap items-start gap-5">
          <section aria-labelledby="gaps" className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
            <h2 id="gaps" className="m-0 mb-0.5 text-[18px] font-semibold">
              What the class doesn&apos;t get yet
            </h2>
            {home.gaps.map((g, i) => (
              <GapCard key={g.key} gap={g} index={i} on={g.key === selected} base={base} />
            ))}
            {test ? (
              <Link href={`${base}/tests/${test.id}`} className="mt-2.5 flex flex-col gap-3 rounded-18 border border-line bg-card p-4 text-ink no-underline">
                <span className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-body">Latest test</span>
                  {chevron}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[17px] font-semibold">{test.title}</span>
                  <span className="text-[14px] text-body">
                    Written {test.writtenOn} · {test.papers} papers
                    {test.toCheck > 0 ? ` · ${test.toCheck} answer${test.toCheck === 1 ? '' : 's'} to check` : ''}
                  </span>
                </span>
                <span className="grid grid-cols-3 gap-2">
                  <Stat value={test.average === null ? '-' : `${test.average}%`} label="Average" />
                  <Stat value={test.range ? `${test.range[0]} to ${test.range[1]}` : '-'} label="Range, %" />
                  <Stat value={test.hardest === null ? '-' : `Q${test.hardest}`} label="Hardest" />
                </span>
              </Link>
            ) : null}
          </section>
          {detail ? <Detail detail={detail} base={base} /> : null}
        </div>

        <section aria-labelledby="did" className="flex flex-col gap-3 rounded-20 border border-line bg-card px-5 py-[18px]">
          <div className="flex items-baseline justify-between">
            <h2 id="did" className="m-0 text-[16px] font-semibold">
              What Jemma did today
            </h2>
            <Link href={`${base}/notifications`} className="flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-[3px]">
              See all
            </Link>
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-x-6 gap-y-2.5 p-0">
            {home.activity.map((e, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-[1.4]">
                <span className="w-10 flex-none text-body tabular-nums">{e.at}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
