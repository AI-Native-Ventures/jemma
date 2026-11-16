import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProgressLegend } from '../../k/maths/ProgressDots'
import { ChevronRight } from '../../k/session/_parts/Chips'
import { Diamond } from '../../k/session/_parts/Gems'
import { byTerm, findPart, hasLesson, TOUR_PARTS } from '../data/topics'
import { PartScore, TopicBody } from '../Progress'
import { LEARNER_WIDTH, TourHeader } from '../TourHeader'

export const metadata: Metadata = { title: 'My maths' }
// Only the parts of the list exist: /tour/teacher is its own folder, and nothing else is a part.
export const dynamicParams = false
export const generateStaticParams = () => TOUR_PARTS.map((p) => ({ part: p.slug }))

const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'

/**
 * One part of Mathematics, as the learner's part page draws it: the topics of the part under their term, each with its circle and its score (the score of
 * the lesson, once it has been done in this tab). The topic that has a lesson is a link to it; the others are listed and not tapped.
 */
export default async function TourPartPage({ params }: { params: Promise<{ part: string }> }) {
  const part = findPart((await params).part)
  if (!part) notFound()
  return (
    <>
      <TourHeader view="learner" className={LEARNER_WIDTH} />
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] ${LEARNER_WIDTH}`}>
        <Link href="/tour" className="flex min-h-11 items-center text-[16px] font-semibold text-ink no-underline">
          <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>My maths
        </Link>
        <div className="flex items-start gap-2.5">
          <Diamond size={16} className="mt-3 flex-none" />
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{part.label}</h1>
            <PartScore part={part} />
          </div>
        </div>

        <ProgressLegend />

        {byTerm(part).map((group) => (
          <section key={group.term} aria-labelledby={`term-${group.term}`} className="flex flex-col gap-2.5">
            <h2 id={`term-${group.term}`} className="m-0 text-[17px] font-bold">Term {group.term}</h2>
            <ul className={list}>
              {group.topics.map((topic) => {
                const body = <TopicBody part={part.slug} topic={topic} />
                return (
                  <li key={topic.slug} className="border-t border-soft first:border-t-0">
                    {hasLesson(part.slug, topic.slug) ? (
                      <Link href={`/tour/${part.slug}/${topic.slug}`} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
                        {body}
                        <ChevronRight />
                      </Link>
                    ) : (
                      <div className="flex min-h-[64px] items-center gap-3 py-3 text-ink">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  )
}
