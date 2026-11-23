import type { Metadata } from 'next'
import { ProgressLegend } from '../../k/maths/ProgressDots'
import { TOUR_CLASS } from '../data/class'
import { TOUR_PARTS, TOUR_SUBJECT } from '../data/topics'
import { TEACHER_WIDTH, TourHeader } from '../TourHeader'
import { ClassRow, list } from './Bits'

export const metadata: Metadata = { title: 'Mathematics' }

/** The teacher's first page: the class and every part of its Mathematics, each with the class average and how many learners need help. */
export default function TourTeacherHome() {
  return (
    <>
      <TourHeader view="teacher" className={TEACHER_WIDTH} />
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-8 ${TEACHER_WIDTH}`}>
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[14px] font-semibold text-red-text">{TOUR_CLASS.name}</p>
          <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{TOUR_SUBJECT}</h1>
          <p className="m-0 text-[17px] leading-[1.4] text-body">How the class is doing in each part. Pick a part to see its topics.</p>
        </div>
        <section aria-labelledby="parts" className="flex flex-col gap-2.5 lg:max-w-[720px]">
          <h2 id="parts" className="m-0 text-[17px] font-bold">All of {TOUR_SUBJECT}</h2>
          <ProgressLegend />
          <ul className={list}>
            {TOUR_PARTS.map((part) => (
              <ClassRow key={part.slug} label={part.label} stat={TOUR_CLASS.parts[part.slug] ?? { avg: null, help: 0 }} href={`/tour/teacher/${part.slug}`} />
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
