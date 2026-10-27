import Link from 'next/link'
import { CameraIcon, ChevronRightIcon } from '@/components/ui/icons'
import { getQuestionDetail, type Learner, type TestSummary } from '@/lib/data/p20'
import { getReteachCard, getSlips, laptopSummary } from '@/lib/data/p34'
import { Diamond } from '../snap/_parts'

const avatar = (name: string, coral: boolean, size: number) => (
  <span aria-hidden="true" style={{ width: size, height: size }} className={`flex flex-none items-center justify-center rounded-pill text-[13px] font-bold ${coral ? 'bg-coral-soft' : 'bg-soft-3'}`}>
    {name.slice(0, 1)}
  </span>
)

function LearnerLink({ href, learner, coral }: { href: string; learner: Learner; coral: boolean }) {
  return (
    <Link href={href} className="flex min-h-[52px] items-center gap-2.5 rounded-14 bg-ground px-2.5 py-1.5 text-ink no-underline">
      {avatar(learner.name, coral, 32)}
      <span className="flex-1 text-[15px] font-semibold">{learner.name}</span>
      <span className="font-hand text-[20px] leading-none text-navy">{learner.answer}</span>
      <ChevronRightIcon size={18} className="flex-none" />
    </Link>
  )
}

/** Board `laptop-teacher-tests`: tests list, each question and the selected question's detail side by side. Shown from 1024 wide. */
export async function LaptopTests({
  classId,
  className,
  groups,
  test,
  n,
}: {
  classId: string
  className: string
  groups: { term: number; tests: TestSummary[] }[]
  test: TestSummary | null
  n: number | null
}) {
  const base = `/t/${classId}`
  const hardest = test?.questions.length ? test.questions.reduce((a, b) => (b.right < a.right ? b : a)) : null
  const focus = test?.questions.find((q) => q.n === n)?.n ?? hardest?.n ?? null
  const [slips, detail] = await Promise.all([
    test ? getSlips(test.id) : Promise.resolve(new Map<number, string>()),
    test && focus ? getQuestionDetail(classId, test.id, focus) : Promise.resolve(null),
  ])
  const reteach = detail?.gap ? await getReteachCard(classId, detail.gap.topicId) : null
  const summary = detail ? laptopSummary(detail) : null
  const href = (t: string, q?: number) => `?t=${t}${q ? `&q=${q}` : ''}`

  return (
    <div className="hidden px-9 pt-8 pb-10 leading-[normal] lg:block">
    <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[780px] flex-col gap-2.5">
          <p className="m-0 text-[15px] text-body">Tests · {className}</p>
          <div className="flex items-start gap-3">
            <Diamond size={16} className="mt-3.5" />
            <h1 className="m-0 text-[36px] leading-[1.15] font-semibold tracking-[-0.02em] text-pretty">
              {test && hardest
                ? `${test.shortTitle} averaged ${test.average}%. Question ${hardest.n} was the hardest: ${hardest.right} of ${hardest.of} got it.`
                : 'No tests yet.'}
            </h1>
          </div>
        </div>
        <Link href={`${base}/snap`} className="flex h-[46px] flex-none items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-[18px] text-[15px] font-semibold text-ink no-underline">
          <CameraIcon size={18} />
          Snap the next test
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="tlist" className="flex min-w-0 flex-[0_1_250px] flex-col gap-2 rounded-20 border border-line bg-card px-3 py-4">
          {groups.map((g) => (
            <div key={g.term} className="flex flex-col gap-2">
              <h2 id={g.term === groups[0]?.term ? 'tlist' : undefined} className="mx-1.5 mt-0 mb-1 text-[15px] font-semibold text-body">Term {g.term}</h2>
              {g.tests.map((t) => {
                const on = t.id === test?.id
                return (
                  <Link
                    key={t.id}
                    href={href(t.id)}
                    scroll={false}
                    aria-current={on ? 'true' : undefined}
                    className={`flex flex-col gap-1 rounded-14 p-3 text-ink no-underline ${on ? 'border-2 border-ink bg-soft-4' : 'border border-line bg-card'}`}
                  >
                    <span className="text-[15px] leading-[1.3] font-bold">{t.title}</span>
                    <span className="text-[13px] text-body">{t.dayLabel} · {t.marked} of {t.papers} marked</span>
                    <span className="text-[22px] font-bold">
                      {t.average}% <span className="text-[13px] font-medium text-body">average</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          ))}
          {groups.length === 1 && groups[0]!.tests.length === 1 ? (
            <p className="mx-1.5 mt-1.5 mb-0 text-[13px] leading-[1.45] text-body">Your first test on Jemma. Earlier terms show up once you snap them.</p>
          ) : null}
        </section>

        <section aria-labelledby="perq" className="flex min-w-0 flex-[1.6_1_520px] flex-col gap-2.5 rounded-20 border border-line bg-card px-3.5 py-[18px]">
          <div className="flex items-baseline justify-between px-1.5">
            <h2 id="perq" className="m-0 text-[18px] font-semibold">Each question</h2>
            <span className="text-[13px] text-body">Coral bars: under half right</span>
          </div>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-body">
                <th scope="col" className="py-1.5 pr-2 pl-2.5 font-semibold">Q</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Question</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Topic</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Right</th>
                <th scope="col" className="py-1.5 pr-2.5 pl-2 font-semibold">Most common slip</th>
              </tr>
            </thead>
            <tbody>
              {(test?.questions ?? []).map((q) => {
                const slip = slips.get(q.n)
                const on = q.n === focus
                const share = q.of ? (q.right / q.of) * 100 : 0
                return (
                  <tr key={q.n} className={`border-t border-soft ${on ? 'bg-soft-4' : ''}`}>
                    <th scope="row" className="py-0 pr-2 pl-2.5 text-left font-semibold">
                      <Link href={href(test!.id, q.n)} scroll={false} aria-current={on ? 'true' : undefined} className="flex min-h-12 items-center text-ink no-underline">Q{q.n}</Link>
                    </th>
                    <td className="px-2 text-[14px]">{q.prompt}</td>
                    <td className="px-2 text-[13px] text-body">{q.topic}</td>
                    <td className="px-2">
                      <span className="flex items-center gap-2">
                        <span className="w-[30px] text-right text-[14px] font-semibold tabular-nums">{q.right}/{q.of}</span>
                        <span aria-hidden="true" className="block h-2 w-[70px] overflow-hidden rounded-pill bg-soft-4">
                          <span className={`block h-full rounded-pill ${share < 50 ? 'bg-coral' : 'bg-ink'}`} style={{ width: `${share}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="py-0 pr-2.5 pl-2 text-[14px]">{slip ? <span className="font-semibold">{slip}</span> : <span className="text-body">None</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {detail ? (
          <section aria-labelledby="q1" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-20 border border-line bg-card p-5">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-body">Question {detail.n} · {detail.topic}</span>
              <h2 id="q1" className="m-0 text-[24px] font-bold">{detail.prompt}</h2>
              <span className="text-[14px] text-body">Right answer {detail.rightAnswer} · {detail.marks} mark{detail.marks === 1 ? '' : 's'}</span>
            </div>
            {summary ? (
              <p className="m-0 flex gap-2.5 text-[16px] leading-[1.45] font-medium">
                <Diamond size={12} className="mt-1.5" />
                <span>{summary}</span>
              </p>
            ) : null}
            {detail.missed.length > 0 ? (
              <>
                <h3 className="m-0 text-[15px] font-semibold">Missed it</h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {detail.missed.map((l, i) => (
                    <li key={l.childId}><LearnerLink href={`${base}/learners/${l.childId}/profile`} learner={l} coral={i === 0} /></li>
                  ))}
                </ul>
              </>
            ) : null}
            {detail.right.length > 0 ? (
              <>
                <h3 className="m-0 text-[15px] font-semibold">Got it right</h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {detail.right.map((l) => (
                    <li key={l.childId}><LearnerLink href={`${base}/learners/${l.childId}/profile`} learner={l} coral={false} /></li>
                  ))}
                </ul>
              </>
            ) : null}
            {detail.gap ? (
              <Link href={`${base}/gaps/${detail.gap.topicId}`} className="flex min-h-14 items-center gap-3 rounded-14 border border-[#FFC9BB] bg-coral-wash px-3 py-2.5 text-ink no-underline">
                <span className="flex flex-1 flex-col leading-[1.3]">
                  <span className="text-[15px] font-semibold">Reteach plan ready</span>
                  <span className="text-[13px] text-body">{reteach ?? detail.gap.topicName}</span>
                </span>
                <ChevronRightIcon size={18} className="flex-none" />
              </Link>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
    </div>
  )
}
