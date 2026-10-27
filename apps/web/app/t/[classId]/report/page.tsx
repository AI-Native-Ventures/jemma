import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClassReport, type ReportLearner } from '@/lib/data/p33'
import { ReportActions } from './ReportActions'

const stat =
  'flex min-w-[220px] flex-[1_1_220px] flex-col gap-1 rounded-20 border border-line bg-card p-[18px] text-ink no-underline'

const th = 'px-2 py-1.5 text-left font-semibold'

function Glyph({ stage }: { stage: ReportLearner['stage'] }) {
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

const stageLabel = (s: ReportLearner['stage']) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

/** Board `laptop-teacher-report`: the class report, from the class test, the register and the teacher's notes. */
export default async function ClassReportPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const r = await getClassReport(classId)
  if (!r) notFound()
  const base = `/t/${classId}`
  const testShort = r.testTitle?.split(':')[0] ?? 'the class test'
  const rows = [
    ['Name', 'Average', 'Days here', 'Top gap', 'Stage', 'Notes'],
    ...r.learners.map((l) => [l.name, l.average === null ? '' : `${l.average}%`, `${l.present} of ${l.recorded}`, l.topGap ?? '', stageLabel(l.stage), String(l.notes)]),
  ]
  return (
    <div className="px-9 pt-8 pb-10 leading-[normal]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[780px] flex-col gap-2.5">
            <p className="m-0 text-[15px] text-body">
              Term {r.term} report · {r.className}
              {r.updated ? ` · updated ${r.updated}` : ''}
            </p>
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-3.5 flex-none">
                <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
              </svg>
              <h1 className="m-0 text-[36px] leading-[1.15] font-semibold tracking-[-0.02em] text-pretty">{r.headline}</h1>
            </div>
          </div>
          <ReportActions rows={rows} file={`${r.className.replaceAll(' ', '-').toLowerCase()}-marks.csv`} />
        </div>

        <div className="flex flex-wrap gap-3.5">
          <Link href={`${base}/tests`} className={stat}>
            <span className="text-[32px] font-bold tracking-[-0.01em]">{r.average.value === null ? '-' : `${r.average.value}%`}</span>
            <span className="text-[15px] font-semibold">Class average</span>
            <span className="text-[13px] text-body">{r.average.sub}</span>
          </Link>
          <Link href={`${base}/learners`} className={stat}>
            <span className="text-[32px] font-bold tracking-[-0.01em]">
              {r.days.present} of {r.days.recorded}
            </span>
            <span className="text-[15px] font-semibold">Days at school</span>
            <span className="text-[13px] text-body">
              Term {r.term} so far · {r.days.learners} learners
            </span>
          </Link>
          <Link href={base} className={stat}>
            <span className="text-[32px] font-bold tracking-[-0.01em]">
              {r.lessons.count === 0 ? 'None yet' : `${r.lessons.count} learner${r.lessons.count === 1 ? '' : 's'}`}
            </span>
            <span className="text-[15px] font-semibold">Lessons done at home</span>
            <span className="text-[13px] text-body">{r.lessons.sub}</span>
          </Link>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <section aria-labelledby="topics" className="flex min-w-0 flex-[1_1_480px] flex-col gap-2 rounded-20 border border-line bg-card px-2 pt-[18px] pb-2">
            <div className="flex items-baseline justify-between px-3">
              <h2 id="topics" className="m-0 text-[18px] font-semibold">
                Topics on your map
              </h2>
              <Link href={`${base}/curriculum`} className="flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-[3px]">
                Open the map
              </Link>
            </div>
            <div className="overflow-x-auto"><table className="w-full border-collapse">
              <thead>
                <tr className="text-[12px] text-body">
                  <th scope="col" className={`${th} pl-3`}>
                    Topic
                  </th>
                  <th scope="col" className={th}>
                    Taught
                  </th>
                  <th scope="col" className={th} colSpan={2}>
                    Class right, {testShort}
                  </th>
                  <th scope="col" className={`${th} pr-3`}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.topics.map((t) => (
                  <tr key={t.name} className="h-12 border-t border-soft">
                    <th scope="row" className="py-0 pr-2 pl-3 text-left text-[14px] font-medium">
                      {t.name}
                    </th>
                    <td className="px-2 text-[13px] whitespace-nowrap text-body">Term {t.term}</td>
                    {t.pct === null ? (
                      <>
                        <td className="px-2 text-[14px] text-body" colSpan={2}>
                          Not tested yet
                        </td>
                        <td className="pr-3 pl-2" />
                      </>
                    ) : (
                      <>
                        <td className="w-[140px] px-2">
                          <span aria-hidden="true" className="block h-2 w-[120px] overflow-hidden rounded-pill bg-soft-4">
                            <span className={`block h-full rounded-pill ${t.status === 'reteach' ? 'bg-coral' : 'bg-ink'}`} style={{ width: `${t.pct}%` }} />
                          </span>
                        </td>
                        <td className="px-2 text-[15px] font-semibold tabular-nums">{t.pct}%</td>
                        <td className="pr-3 pl-2">
                          {t.status === 'reteach' ? (
                            <span className="inline-flex items-center rounded-pill bg-coral-tint px-2.5 py-0.5 text-[13px] font-semibold">Reteach</span>
                          ) : (
                            <span className="text-[13px] text-body">On track</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>

          <section aria-labelledby="ltable" className="flex min-w-0 flex-[1_1_480px] flex-col gap-2 rounded-20 border border-line bg-card px-2 pt-[18px] pb-2">
            <h2 id="ltable" className="m-0 mx-3 text-[18px] font-semibold">
              Learners
            </h2>
            <div className="overflow-x-auto"><table className="w-full border-collapse">
              <thead>
                <tr className="text-[12px] text-body">
                  <th scope="col" className={`${th} pl-3`}>
                    Name
                  </th>
                  <th scope="col" className={th}>
                    Average
                  </th>
                  <th scope="col" className={th}>
                    Days here
                  </th>
                  <th scope="col" className={th}>
                    Top gap
                  </th>
                  <th scope="col" className={th}>
                    Stage
                  </th>
                  <th scope="col" className={`${th} pr-3`}>
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.learners.map((l, i) => (
                  <tr key={l.id} className="border-t border-soft">
                    <th scope="row" className="py-0 pr-2 pl-3 text-left">
                      <Link href={`${base}/learners?child=${l.id}`} className="flex min-h-[52px] items-center gap-2.5 text-[15px] font-semibold text-ink no-underline">
                        <span aria-hidden="true" className={`flex size-[30px] flex-none items-center justify-center rounded-pill text-[12px] font-bold ${i === 0 ? 'bg-coral-soft' : 'bg-soft-3'}`}>
                          {l.name.charAt(0)}
                        </span>
                        {l.name}
                      </Link>
                    </th>
                    <td className="px-2 text-[15px] font-semibold tabular-nums">{l.average === null ? '-' : `${l.average}%`}</td>
                    <td className="px-2 text-[14px]">
                      {l.present} of {l.recorded}
                    </td>
                    <td className="px-2 text-[14px]">{l.topGap ?? ''}</td>
                    <td className="px-2 text-[14px]">
                      {l.stage ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Glyph stage={l.stage} />
                          {stageLabel(l.stage)}
                        </span>
                      ) : null}
                    </td>
                    <td className="pr-3 pl-2 text-[14px] tabular-nums">{l.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p className="mx-3 mt-1.5 mb-2 text-[13px] leading-[1.45] text-body">Stage is for each learner&apos;s top gap. Notes are the ones you wrote this term.</p>
          </section>
        </div>

        <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-1 flex-none">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          Made by Jemma from {testShort}, the register and your notes. Every number links to its source.
        </p>
      </div>
    </div>
  )
}
