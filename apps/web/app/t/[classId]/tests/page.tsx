import Link from 'next/link'
import { CameraIcon, ChevronRightIcon, GemIcon } from '@/components/ui/icons'
import { getTestsList, type TestSummary } from '@/lib/data/p20'
import { LaptopTests } from './LaptopTests'

/** Dot tops (px) for 1 to 3 learners on the same mark; more are spread over the track. */
function dotTops(count: number): number[] {
  if (count === 1) return [20]
  if (count === 2) return [12, 28]
  if (count === 3) return [4, 20, 36]
  return Array.from({ length: count }, (_, i) => 4 + (32 * i) / (count - 1))
}

function DotChart({ marks, average }: { marks: number[]; average: number }) {
  const groups = new Map<number, number>()
  for (const m of marks) groups.set(m, (groups.get(m) ?? 0) + 1)
  return (
    <span className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-body">Each dot is a learner</span>
      <span aria-hidden="true" className="relative block h-[46px]">
        <span className="absolute inset-x-0 top-[27px] h-0.5 bg-[#E3E1EE]" />
        <span className="absolute top-1.5 bottom-1 w-0.5 bg-coral" style={{ left: `${average}%` }} />
        <span className="absolute top-0 text-[11px] font-semibold text-coral-text" style={{ left: `calc(${average}% + 6px)` }}>
          avg
        </span>
        {[...groups.entries()].flatMap(([mark, count]) =>
          dotTops(count).map((top, i) => (
            <span
              key={`${mark}-${i}`}
              className="absolute size-3.5 rounded-pill border-2 border-card bg-ink"
              style={{ left: `calc(${mark}% - 7px)`, top }}
            />
          )),
        )}
      </span>
      <span className="flex justify-between text-[12px] text-body">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </span>
      <span className="sr-only">
        Marks: {marks.length > 1 ? `${marks.slice(0, -1).map((m) => `${m}%`).join(', ')} and ${marks[marks.length - 1]}%` : `${marks[0] ?? 0}%`}.
      </span>
    </span>
  )
}

function TestCard({ href, test }: { href: string; test: TestSummary }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-4 rounded-20 border border-line bg-card pt-[18px] pr-3.5 pb-[18px] pl-[18px] text-ink no-underline"
    >
      <span className="flex items-start gap-2.5">
        <span className="flex flex-1 flex-col gap-[3px]">
          <span className="text-[18px] leading-[1.3] font-semibold">{test.title}</span>
          <span className="text-[14px] text-body">
            {test.dayLabel} · {test.marked} of {test.papers} papers marked
          </span>
        </span>
        <span className="flex flex-col items-end leading-[1.1]">
          <span className="text-[28px] font-bold tabular-nums">{test.average}%</span>
          <span className="text-[12px] text-body">average</span>
        </span>
      </span>

      <DotChart marks={test.marks} average={test.average} />

      <span className="flex flex-col gap-2 border-t border-soft pt-3.5">
        <span className="text-[13px] font-semibold text-body">Lowest topics</span>
        {test.lowestTopics.map((t) => (
          <span key={t.name} className="flex items-center gap-2.5 text-[14px]">
            <span className="flex-1">{t.name}</span>
            <span aria-hidden="true" className="flex h-2 w-24 overflow-hidden rounded-pill bg-soft-4">
              <span className="bg-ink" style={{ width: `${t.pct}%` }} />
            </span>
            <span className="w-[38px] text-right font-semibold tabular-nums">{t.pct}%</span>
          </span>
        ))}
      </span>
      <span className="flex items-center justify-between text-[15px] font-semibold">
        See each question <ChevronRightIcon />
      </span>
    </Link>
  )
}

export default async function TeacherTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ t?: string; q?: string }>
}) {
  const { classId } = await params
  const { t, q } = await searchParams
  const { cls, headline, groups } = await getTestsList(classId)
  const all = groups.flatMap((g) => g.tests)
  const selected = all.find((x) => x.id === t) ?? all.find((x) => x.marked > 0) ?? all[0] ?? null
  const base = `/t/${classId}`

  return (
    <>
    <LaptopTests classId={classId} className={cls.name} groups={groups} test={selected} n={q ? Number(q) : null} />
    <div className="flex flex-col gap-[18px] px-5 pt-3.5 pb-5 leading-[normal] lg:hidden">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[14px] font-semibold text-body">Tests</p>
        {headline ? (
          <div className="flex items-start gap-2.5">
            <GemIcon size={14} className="mt-2.5 flex-none" />
            <h1 className="m-0 text-[26px] leading-[1.2] font-semibold tracking-[-0.01em] text-pretty">{headline}</h1>
          </div>
        ) : (
          <h1 className="m-0 text-[26px] leading-[1.2] font-semibold tracking-[-0.01em] text-pretty">No tests yet.</h1>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.term} className="flex flex-col gap-[18px]">
          <h2 className="mt-1 -mb-1.5 text-[15px] font-semibold text-body">Term {g.term}</h2>
          {g.tests.map((t) => (
            <TestCard key={t.id} href={`${base}/tests/${t.id}`} test={t} />
          ))}
        </section>
      ))}

      <Link
        href={`${base}/snap`}
        className="flex h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[16px] font-semibold text-ink no-underline"
      >
        <CameraIcon size={20} />
        Snap the next test
      </Link>
    </div>
    </>
  )
}
