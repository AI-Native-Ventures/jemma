import { notFound, redirect } from 'next/navigation'
import { earlierSameSlip, getReadAnswers, getSnapPaper, getUpcomingLessons, shortDate, shortPlanned } from '@/lib/data/p32'
import { FlowShell, GemLine, joinNumbers, lower } from '../../_parts'
import { KIND_LABEL } from '@/lib/data/p32'

/** parent-snap-saved: what was saved and what Jemma does with it. */
export default async function SnapSavedPage({ params }: { params: Promise<{ childId: string; paperId: string }> }) {
  const { childId, paperId } = await params
  const paper = await getSnapPaper(childId, paperId)
  if (!paper) notFound()
  if (paper.status !== 'marked') redirect(`/p/${childId}/snap/${paperId}`)

  const answers = await getReadAnswers(paperId)
  const topic = answers[0]?.topic_name ?? 'Homework'
  const wrong = answers.filter((a) => !a.correct)
  const slip = wrong.find((a) => a.misconception)
  const earlier = slip?.misconception ? await earlierSameSlip(childId, paperId, slip.misconception) : null
  const lessons = await getUpcomingLessons(childId)
  const lesson = lessons.find((l) => l.topicName === (slip?.topic_name ?? topic)) ?? lessons[0]
  const after = lesson ? lessons.find((l) => l.plannedFor > lesson.plannedFor) : undefined
  const confirmed = answers.filter((a) => a.changed_by)
  const nums = wrong.map((a) => a.n)

  return (
    <FlowShell href={`/p/${childId}`} icon="close" label={`${paper.childFirstName} · ${KIND_LABEL[paper.kind]}`} title="Saved">
    <main className="flex flex-col gap-[18px] px-5 pb-7 pt-4 leading-[normal] lg:mx-auto lg:max-w-[560px]">
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-18 bg-ink">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className="m-0 text-pretty text-[28px] font-semibold leading-[1.18] tracking-[-0.015em]">
          Saved to {paper.childFirstName}&apos;s profile.{lesson ? ` ${topic} is ${lesson.weekday}'s lesson.` : ''}
        </h1>
      </div>

      <section aria-labelledby="hw" className="flex flex-col gap-2.5 rounded-20 border border-line bg-card p-4">
        <h2 id="hw" className="m-0 text-[17px] font-semibold">Homework: {topic}</h2>
        <p className="m-0 text-[15px] text-body">
          Written {shortDate(paper.created_at)} · The teacher marked it {answers.filter((a) => a.correct).length} of {answers.length}
        </p>
        <ul className="m-0 flex list-none flex-col gap-[9px] p-0">
          {slip?.misconception ? (
            <GemLine>
              Question{nums.length === 1 ? '' : 's'} {joinNumbers(nums)}: she {lower(slip.misconception)}, like {slip.prompt} = {slip.answer_read}.
            </GemLine>
          ) : null}
          {earlier ? (
            <GemLine>Same slip as {earlier.title}, question {earlier.n}. Now seen twice, so it&apos;s a real gap.</GemLine>
          ) : null}
          {confirmed.map((a) => (
            <GemLine key={a.n}>You confirmed question {a.n} says {a.answer_read}. Thank you.</GemLine>
          ))}
        </ul>
      </section>

      {lesson ? (
        <div className="flex items-center gap-3 rounded-18 border border-line bg-card p-3.5">
          <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-12 bg-[#FFE3DA]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </svg>
          </span>
          <span className="flex flex-1 flex-col gap-0.5 leading-[1.3]">
            <span className="text-[13px] font-bold text-[#B8381F]">Next lesson · {shortPlanned(lesson.plannedFor)}</span>
            <span className="text-[16px] font-semibold">{lesson.topicName}</span>
            <span className="text-[14px] text-body">
              {lesson.minutes ? `About ${lesson.minutes} minutes.` : ''}
              {after ? ` ${after.weekday} is still ${lower(after.topicName)}.` : ''}
            </span>
          </span>
        </div>
      ) : null}

      <div className="mt-1 flex flex-col gap-2">
        <a href={`/p/${childId}`} className="flex min-h-14 items-center justify-center gap-2 rounded-14 bg-ink px-5 py-3 text-center text-[17px] font-semibold text-balance text-white no-underline">
          Back to {paper.childFirstName}&apos;s profile
        </a>
        <a href={`/p/${childId}/snap`} className="flex min-h-14 items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink no-underline">
          Snap another page
        </a>
      </div>
    </main>
    </FlowShell>
  )
}
