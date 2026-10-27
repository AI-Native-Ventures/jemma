import Link from 'next/link'
import { ChevronRightIcon } from '@/components/ui/icons'
import { getTestDetail } from '@/lib/data/p20'
import { BackHeader, Lead } from '../back-header'

const Stat = ({ value, label }: { value: string; label: string }) => (
  <span className="flex flex-col gap-0.5 rounded-14 border border-line bg-card p-3">
    <span className="text-[22px] font-bold">{value}</span>
    <span className="text-[13px] text-body">{label}</span>
  </span>
)

const Squares = ({ dots }: { dots: boolean[] }) => (
  <span aria-hidden="true" className="flex gap-[3px]">
    {dots.map((right, i) => (
      <span
        key={i}
        className={right ? 'size-3 rounded-[3px] bg-ink' : 'size-3 rounded-[3px] border border-[#E8553A] bg-coral-soft'}
      />
    ))}
  </span>
)

export default async function TeacherTestPage({ params }: { params: Promise<{ classId: string; testId: string }> }) {
  const { classId, testId } = await params
  const { cls, test, hardestLine } = await getTestDetail(classId, testId)
  const base = `/t/${classId}`

  return (
    <div className="leading-[normal] lg:max-w-[720px]">
      <BackHeader href={`${base}/tests`} backLabel="Back to tests" eyebrow={cls.name} title="Tests" />
      <div className="flex flex-col gap-4 px-5 pt-2 pb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.015em]">{test.title}</h1>
          <p className="m-0 text-[14px] text-body">
            {test.dayLabel} · out of {test.outOf} · {test.papers} papers
          </p>
        </div>
        {hardestLine ? <Lead>{hardestLine}</Lead> : null}

        <div className="grid grid-cols-3 gap-2">
          <Stat value={`${test.average}%`} label="Average" />
          <Stat value={`${test.highest}%`} label="Highest" />
          <Stat value={`${test.lowest}%`} label="Lowest" />
        </div>

        <section aria-labelledby="perq" className="flex flex-col rounded-20 border border-line bg-card pt-3 pr-1.5 pb-1.5 pl-3.5">
          <div className="mb-1 flex items-baseline justify-between pr-2.5">
            <h2 id="perq" className="m-0 text-[16px] font-semibold">
              Each question
            </h2>
            <span className="flex items-center gap-2.5 text-[12px] text-body">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-ink" />
                right
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="size-2.5 rounded-[3px] border border-[#E8553A] bg-coral-soft" />
                missed
              </span>
            </span>
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {test.questions.map((q) => (
              <li key={q.n}>
                <Link
                  href={`${base}/tests/${testId}/q/${q.n}`}
                  className="flex min-h-[60px] items-center gap-2.5 border-t border-soft text-ink no-underline"
                >
                  <span className="w-[30px] flex-none text-[13px] font-semibold text-body">Q{q.n}</span>
                  <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                    <span className="text-[15px] font-medium">{q.prompt}</span>
                    <span className="text-[12px] text-body">{q.topic}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Squares dots={q.dots} />
                    <span className="text-[13px] font-semibold">
                      {q.right} of {q.of} right
                    </span>
                  </span>
                  <ChevronRightIcon size={18} className="mr-1.5 flex-none" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
