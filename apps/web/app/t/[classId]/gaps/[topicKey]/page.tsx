import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRightIcon, ClockIcon, GemIcon } from '@/components/ui/icons'
import { getGapDetail, joinNames, numberWord, type GapLearner } from '@/lib/data/p18'
import { markReteachDone } from '../actions'
import { PrintButton } from './PrintButton'

const avatar = 'flex size-[34px] flex-none items-center justify-center rounded-pill text-[13px] font-bold'

function wroteLine(l: GapLearner): string {
  const wrote = `Wrote ${joinNames(l.wrote)}`
  if (l.rightQs.length === 0) return wrote
  const qs = l.rightQs.length === 1 ? `question ${l.rightQs[0]}` : `questions ${joinNames(l.rightQs.map(String))}`
  return `${wrote}, got ${qs} right`
}

export default async function TeacherGap({ params }: { params: Promise<{ classId: string; topicKey: string }> }) {
  const { classId, topicKey } = await params
  const detail = await getGapDetail(classId, topicKey)
  if (!detail) notFound()
  const { gap, reteach } = detail
  const base = `/t/${classId}`
  const done = Boolean(reteach?.doneAt)

  return (
    <div className="leading-[normal]">
      {/* This board has its own back header; the class header above it steps aside. */}
      <style>{'header:has(+ main > [data-own-header]){display:none}'}</style>
      <div data-own-header className="flex items-center gap-1 pt-2.5 pr-4 pb-1.5 pl-2">
        <Link href={base} aria-label="Back to class" className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
          <span className="text-[13px] text-body">6B Mathematics</span>
          <span className="text-[17px] font-bold">
            Class gap {detail.index + 1} of {detail.of}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-[18px] px-5 pt-2.5 pb-5">
        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-[26px] leading-[1.18] font-bold tracking-[-0.015em]">{gap.topicName}</h1>
          <p className="m-0 flex gap-2.5 text-[17px] leading-[1.45]">
            <GemIcon size={12} className="mt-[7px] flex-none" />
            <span>{detail.why}</span>
          </p>
        </div>

        <section aria-labelledby="stuck" className="flex flex-col rounded-20 border border-line bg-card pt-3 pr-2 pb-1.5 pl-4">
          <h2 id="stuck" className="m-0 mb-1 text-[16px] font-semibold">
            Who&apos;s stuck
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {gap.learners.map((l, i) => (
              <li key={l.childId}>
                <Link
                  href={`${base}/learners/${l.childId}`}
                  className="flex min-h-[58px] items-center gap-3 border-t border-soft text-ink no-underline"
                >
                  <span aria-hidden="true" className={`${avatar} ${i === 0 ? 'bg-coral-soft' : 'bg-soft-3'}`}>
                    {l.name.slice(0, 1)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                    <span className="text-[16px] font-semibold">{l.name}</span>
                    <span className="text-[13px] text-body">{wroteLine(l)}</span>
                  </span>
                  <ChevronRightIcon className="mr-1.5 flex-none" />
                </Link>
              </li>
            ))}
            {gap.partners.map((p) => (
              <li key={p.childId} className="flex min-h-[52px] items-center gap-3 border-t border-soft pr-2">
                <span aria-hidden="true" className={`${avatar} bg-soft-2 text-body`}>
                  {p.name.slice(0, 1)}
                </span>
                <span className="flex-1 text-[15px] text-body">
                  {p.name} got all {numberWord(p.questions)} right. A good partner for this.
                </span>
              </li>
            ))}
          </ul>
        </section>

        {gap.mistake ? (
          <section aria-labelledby="mistake" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <h2 id="mistake" className="m-0 text-[16px] font-semibold">
                The mistake
              </h2>
              <p className="m-0 text-[15px] leading-[1.45] text-body">
                Seen {gap.mistake.seen} times on {detail.testTitle}
              </p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {gap.mistake.rows.map((r) => (
                <li key={r.n} className="flex items-center justify-between gap-2.5 rounded-12 bg-soft-2 px-3 py-2.5">
                  <span className="w-7 text-[13px] font-semibold text-body">Q{r.n}</span>
                  <span className="flex-1 text-[16px] font-semibold">{r.text}</span>
                  <span className="text-[13px] text-body">{r.learners} learners</span>
                </li>
              ))}
            </ul>
            {reteach?.explanation ? <p className="m-0 text-[15px] leading-normal text-pretty">{reteach.explanation}</p> : null}
            {reteach?.missingBasic ? (
              <span className="flex items-center gap-2 text-[14px]">
                <span className="text-body">Missing basic</span>
                <span className="rounded-pill bg-soft-4 px-2.5 py-[5px] font-semibold">{reteach.missingBasic}</span>
              </span>
            ) : null}
          </section>
        ) : null}

        {reteach ? (
          <section aria-labelledby="reteach" className="flex flex-col gap-3.5 rounded-20 border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex flex-col gap-0.5">
                <h2 id="reteach" className="m-0 text-[16px] font-semibold">
                  Reteach tomorrow
                </h2>
                <p className="m-0 text-[15px] text-body">
                  {reteach.content.title} · {reteach.content.minutes} minutes · {reteach.content.audience}
                </p>
              </div>
              <span className="inline-flex flex-none items-center gap-[5px] rounded-pill bg-soft-4 px-2.5 py-[5px] text-[13px] font-semibold">
                <ClockIcon size={14} strokeWidth={2} />
                {reteach.content.minutes} min
              </span>
            </div>
            <p className="m-0 text-[14px] leading-[1.4]">
              <strong className="font-semibold">You need:</strong> {reteach.content.youNeed}
            </p>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {reteach.content.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-[1.45]">
                  <span className="w-11 flex-none pt-0.5 text-[13px] font-semibold text-body">{s.minutes} min</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <form action={markReteachDone.bind(null, reteach.id)} className="contents">
                <button
                  type="submit"
                  disabled={done}
                  className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-14 border-none bg-ink text-[16px] font-semibold text-white disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  {done ? 'Reteach done' : 'Mark reteach done'}
                </button>
              </form>
              <PrintButton />
            </div>
            <p className="m-0 text-[13px] leading-[1.4] text-body">Jemma checks this gap again in each learner&apos;s next session.</p>
          </section>
        ) : null}
      </div>
    </div>
  )
}
