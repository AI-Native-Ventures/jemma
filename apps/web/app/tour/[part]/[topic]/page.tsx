import type { Metadata } from 'next'
import { TourSession } from '../../TourSession'
import { LESSON_PART, LESSON_TOPIC } from '../../data/topics'

export const metadata: Metadata = { title: "Tonight's lesson" }
// The one topic with a lesson. Any other address is not a page.
export const dynamicParams = false
export const generateStaticParams = () => [{ part: LESSON_PART, topic: LESSON_TOPIC }]

/** The lesson of Equations and inequalities and the five questions after it. */
export default function TourLessonPage() {
  return <TourSession />
}
