import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRightIcon } from '@/components/ui/icons'
import { getQuestionDetail, type Learner } from '@/lib/data/p20'
import { BackHeader, Lead } from '../../../back-header'

const NUMBER = /\d+\s+\d+\/\d+(?=$|[\s.,?!])|\d+\/\d+(?=$|[\s.,?!])|\S+/g

const Stack = ({ top, bottom }: { top: string; bottom: string }) => (
  <span className="inline-flex flex-col items-center leading-none">
    <span className="px-1 pb-1">{top}</span>
    <span className="border-t-[3px] border-ink px-1 pt-1">{bottom}</span>
  </span>
)

/** A stacked fraction (with an optional whole number) or plain text. */
function Term({ text }: { text: string }) {
  const m = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(text)
  if (!m) return <span>{text}</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      {m[1] ? <span>{m[1]}</span> : null}
      <Stack top={m[2]!} bottom={m[3]!} />
    </span>
  )
}

/** The board's handwriting chip: tilt and ink vary a little from learner to learner. */
const HAND = [
  { rotate: -3, color: '#2F3A56', size: 21, bold: false },
  { rotate: 2, color: '#3B3B3B', size: 21, bold: false },
  { rotate: -1, color: '#2F3A56', size: 21, bold: false },
  { rotate: -5, color: '#3B3B3B', size: 22, bold: true },
]

function AnswerChip({ answer, i, tilt }: { answer: string; i: number; tilt: boolean }) {
  const h = tilt ? HAND[i % HAND.length]! : { rotate: 0, color: '#2F3A56', size: 21, bold: false }
  return (
    <span className="flex h-12 w-[92px] items-center justify-center gap-[5px] rounded-lg border border-[#D9D5CC] bg-[#FBFAF5] font-[Arial,Helvetica,sans-serif] text-[11px] text-[#555555]">
      <span>=</span>
      <span
        className="inline-block font-hand"
        style={{ fontSize: h.size, color: h.color, transform: h.rotate ? `rotate(${h.rotate}deg)` : undefined, fontWeight: h.bold ? 700 : undefined }}
      >
        {answer}
      </span>
      <span className="sr-only">Photo of the answer</span>
    </span>
  )
}

function LearnerRow({ href, learner, i, coral, tilt }: { href: string; learner: Learner; i: number; coral: boolean; tilt: boolean }) {
  return (
    <Link href={href} className="flex min-h-[68px] items-center gap-3 border-t border-soft text-ink no-underline">
      <span
        aria-hidden="true"
        className={`flex size-[34px] flex-none items-center justify-center rounded-pill text-[13px] font-bold ${coral ? 'bg-coral-soft' : 'bg-soft-3'}`}
      >
        {learner.name.slice(0, 1)}
      </span>
      <span className="flex-1 text-[16px] font-semibold">{learner.name}</span>
      <AnswerChip answer={learner.answer} i={i} tilt={tilt} />
      <ChevronRightIcon size={18} className="mr-1.5 flex-none" />
    </Link>
  )
}

export default async function TeacherQuestionPage({
  params,
}: {
  params: Promise<{ classId: string; testId: string; n: string }>
}) {
  const { classId, testId, n } = await params
  const num = Number(n)
  if (!Number.isInteger(num) || num < 1) notFound()
  const q = await getQuestionDetail(classId, testId, num)
  const base = `/t/${classId}`
  const profile = (id: string) => `${base}/learners/${id}/profile`
  const terms = q.prompt.match(NUMBER) ?? [q.prompt]

  return (
    <div className="leading-[normal] lg:max-w-[720px]">
      <BackHeader href={`${base}/tests/${testId}`} backLabel={`Back to ${q.test.shortTitle}`} eyebrow={q.cls.name} title={q.test.shortTitle} />
      <div className="flex flex-col gap-4 px-5 pt-2 pb-5">
        <section aria-labelledby="q1" className="flex flex-col gap-3.5 rounded-20 border border-line bg-card p-[18px]">
          <div className="flex items-center justify-between">
            <h1 id="q1" className="m-0 text-[15px] font-semibold text-body">
              Question {q.n}
            </h1>
            <span className="rounded-pill bg-soft-4 px-2.5 py-1 text-[12px] font-semibold">{q.topic}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-[30px] font-semibold">
            {terms.map((t, i) => (
              <Term key={i} text={t} />
            ))}
            <span>=</span>
            <span className="inline-flex items-center gap-2.5 rounded-14 bg-soft-2 px-3.5 py-2">
              <Term text={q.rightAnswer} />
            </span>
          </div>
          <p className="m-0 text-[14px] text-body">
            Right answer {q.rightAnswer} · {q.marks} mark{q.marks === 1 ? '' : 's'}
          </p>
        </section>

        {q.summary ? <Lead>{q.summary}</Lead> : null}

        {q.missed.length > 0 ? (
          <section aria-labelledby="missed" className="flex flex-col rounded-20 border border-line bg-card pt-3 pr-2 pb-1.5 pl-4">
            <h2 id="missed" className="m-0 mb-1 text-[16px] font-semibold">
              Missed it
            </h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {q.missed.map((l, i) => (
                <li key={l.childId}>
                  <LearnerRow href={profile(l.childId)} learner={l} i={i} coral={i === 0} tilt />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {q.right.length > 0 ? (
          <section aria-labelledby="got" className="flex flex-col rounded-20 border border-line bg-card pt-3 pr-2 pb-1.5 pl-4">
            <h2 id="got" className="m-0 mb-1 text-[16px] font-semibold">
              Got it right
            </h2>
            {q.right.map((l, i) => (
              <LearnerRow key={l.childId} href={profile(l.childId)} learner={l} i={i} coral={false} tilt={false} />
            ))}
          </section>
        ) : null}

        {q.gap ? (
          <Link
            href={`${base}/gaps/${q.gap.topicId}`}
            className="flex items-center gap-3 rounded-18 border border-[#FFC9BB] bg-coral-wash py-3.5 pr-3 pl-4 text-ink no-underline"
          >
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] text-body">Class gap</span>
              <span className="text-[16px] font-semibold">{q.gap.topicName}: reteach plan ready</span>
            </span>
            <ChevronRightIcon className="flex-none" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
