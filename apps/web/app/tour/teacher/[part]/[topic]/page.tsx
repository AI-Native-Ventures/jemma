import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { levelWords } from '../../../../k/maths/format'
import { ProgressDot } from '../../../../k/maths/ProgressDots'
import { FractionText } from '../../../../k/session/_parts/Frac'
import { TOUR_CLASS } from '../../../data/class'
import { TOUR_QUESTIONS } from '../../../data/lesson'
import { findPart, findTopic, LESSON_PART, LESSON_TOPIC, TOUR_LEARNER } from '../../../data/topics'
import { TEACHER_WIDTH, TourHeader } from '../../../TourHeader'
import { AverageBar, Back, classLevel, helpLine } from '../../Bits'
import { AnalysisCard, TokensCard } from '../../Cards'
import { LearnerRow } from '../../LearnerRow'
import { YouRow } from '../../YouRow'

export const metadata: Metadata = { title: 'Equations and inequalities' }
export const dynamicParams = false
export const generateStaticParams = () => [{ part: LESSON_PART, topic: LESSON_TOPIC }]

const card = 'flex flex-col gap-3 rounded-[22px] border border-line bg-card p-5'

/**
 * The teacher's page of one topic of the class: how each learner did on the five questions, what Jemma makes of the class's answers, and the tokens
 * spent. The tour learner's row is the first of the list.
 */
export default async function TourTeacherTopicPage({ params }: { params: Promise<{ part: string; topic: string }> }) {
  const { part: partSlug, topic: topicSlug } = await params
  const part = findPart(partSlug)
  const topic = findTopic(partSlug, topicSlug)
  if (!part || !topic) notFound()
  const stat = TOUR_CLASS.topics[topic.slug] ?? { avg: null, help: 0 }
  const learners = TOUR_CLASS.learners
  const total = TOUR_QUESTIONS.length
  const help = helpLine(stat.help)
  return (
    <>
      <TourHeader view="teacher" className={TEACHER_WIDTH} />
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-8 ${TEACHER_WIDTH}`}>
        <Back href={`/tour/teacher/${part.slug}`}>{part.label}</Back>
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14px] font-semibold text-coral-text">{TOUR_CLASS.name} · {part.label}</p>
          <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{topic.name}</h1>
          {stat.avg !== null ? (
            <div className="flex max-w-[420px] flex-col gap-1.5">
              <span className="flex items-center gap-2.5 text-[17px] text-body">
                <ProgressDot level={classLevel(stat.avg)} label={levelWords(classLevel(stat.avg))} />
                Class average {stat.avg}%
                {help ? <span className="font-semibold text-coral-text">{help}</span> : null}
              </span>
              <AverageBar avg={stat.avg} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <section aria-labelledby="learners" className={card}>
              <h2 id="learners" className="m-0 text-[20px] leading-[1.2] font-bold">How each learner did</h2>
              <p className="m-0 text-[15px] leading-[1.45] text-body">Five questions on this topic, marked by Jemma.</p>
              <div>
                <div className="flex items-center gap-3 pb-2 text-[12px] font-semibold text-body">
                  <span className="min-w-0 flex-1">Learner</span>
                  <span aria-hidden="true" className="flex flex-none gap-1.5">
                    {TOUR_QUESTIONS.map((_, i) => (
                      <span key={i} className="w-6 text-center">Q{i + 1}</span>
                    ))}
                  </span>
                  <span className="w-14 flex-none text-right">Score</span>
                </div>
                <ul className="m-0 flex list-none flex-col p-0">
                  <YouRow name={TOUR_LEARNER} />
                  {learners.map((l) => (
                    <LearnerRow key={l.id} name={l.name} results={l.results} />
                  ))}
                </ul>
                <div className="flex items-center gap-3 border-t-2 border-ink pt-2.5 text-[13px] font-semibold">
                  <span className="min-w-0 flex-1">Learners right</span>
                  <span className="flex flex-none gap-1.5">
                    {TOUR_QUESTIONS.map((_, i) => (
                      <span key={i} data-column={i + 1} className="w-6 text-center tabular-nums">{learners.filter((l) => l.results[i]).length}</span>
                    ))}
                  </span>
                  <span className="w-14 flex-none" />
                </div>
              </div>
            </section>

            <section aria-labelledby="questions" className={card}>
              <h2 id="questions" className="m-0 text-[20px] leading-[1.2] font-bold">The five questions</h2>
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {TOUR_QUESTIONS.map((q, i) => (
                  <li key={q.prompt} className="flex items-start gap-3 text-[16px] leading-[1.5]">
                    <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-pill bg-soft-4 text-[12px] font-bold">Q{i + 1}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]"><FractionText text={q.prompt} size={19} rule={2} gap={3} side={4} typeset="algebra" /></span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="flex flex-col gap-5">
            <AnalysisCard analysis={TOUR_CLASS.analysis} />
            <TokensCard tokens={TOUR_CLASS.tokens} />
          </div>
        </div>
      </main>
    </>
  )
}
