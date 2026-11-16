import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProgressLegend } from '../../../k/maths/ProgressDots'
import { TOUR_CLASS } from '../../data/class'
import { byTerm, findPart, hasLesson, TOUR_PARTS, TOUR_SUBJECT } from '../../data/topics'
import { TEACHER_WIDTH, TourHeader } from '../../TourHeader'
import { Back, ClassRow, list } from '../Bits'

export const metadata: Metadata = { title: 'Mathematics' }
export const dynamicParams = false
export const generateStaticParams = () => TOUR_PARTS.map((p) => ({ part: p.slug }))

/** One part of the class's Mathematics: its topics under their term, each with the class average and how many learners need help. */
export default async function TourTeacherPartPage({ params }: { params: Promise<{ part: string }> }) {
  const part = findPart((await params).part)
  if (!part) notFound()
  const stat = TOUR_CLASS.parts[part.slug] ?? { avg: null, help: 0 }
  return (
    <>
      <TourHeader view="teacher" className={TEACHER_WIDTH} />
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-8 ${TEACHER_WIDTH}`}>
        <Back href="/tour/teacher">{TOUR_SUBJECT}</Back>
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[14px] font-semibold text-coral-text">{TOUR_CLASS.name}</p>
          <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{part.label}</h1>
          <p className="m-0 text-[17px] text-body">{stat.avg === null ? 'Not taught yet.' : `Class average ${stat.avg}%.`}</p>
        </div>
        <div className="flex flex-col gap-5 lg:max-w-[720px]">
          <ProgressLegend />
          {byTerm(part).map((group) => (
            <section key={group.term} aria-labelledby={`term-${group.term}`} className="flex flex-col gap-2.5">
              <h2 id={`term-${group.term}`} className="m-0 text-[17px] font-bold">Term {group.term}</h2>
              <ul className={list}>
                {group.topics.map((topic) => (
                  <ClassRow
                    key={topic.slug}
                    label={topic.name}
                    stat={TOUR_CLASS.topics[topic.slug] ?? { avg: null, help: 0 }}
                    href={hasLesson(part.slug, topic.slug) ? `/tour/teacher/${part.slug}/${topic.slug}` : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </>
  )
}
