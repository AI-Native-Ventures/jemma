import { libraryKey } from '@jemma/profiling/schemas'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { libraryFor, resolveTopic, topicLesson, trialsFor } from '@/lib/data/teaching'
import { isUuid } from '@/lib/teaching'
import { LessonReader } from '../../_parts/LessonReader'
import { defaultDelivery } from '../../_parts/delivery'

export const metadata: Metadata = { title: 'Lesson' }
export const dynamic = 'force-dynamic'

/**
 * One lesson of a topic. The lesson reaches the browser without the answers of the questions the learner is asked (`topicLesson`); each answer is marked on
 * the server when it is sent. The delivery it opens in comes from the learner's best format; a choice kept on the device wins in the browser.
 */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ topicId: string; position: string }>; searchParams?: Promise<{ session?: string | string[] }> }) {
  const { topicId, position } = await params
  const raw = (await searchParams)?.session
  const session = isUuid(Array.isArray(raw) ? raw[0] : raw) ? (Array.isArray(raw) ? raw[0]! : raw!) : null
  const at = Number(position)
  if (!Number.isInteger(at)) notFound()
  const topic = await resolveTopic(topicId)
  if (!topic) notFound()
  const entries = await libraryFor(topic.grade, topic.name)
  const entry = entries.find((e) => e.position === at)
  if (!entry) notFound()
  const [found, trials] = await Promise.all([topicLesson(entry.id), trialsFor(topic.family)])
  if (!found) notFound()
  const after = entries[entries.indexOf(entry) + 1]
  return (
    <LessonReader
      key={entry.id}
      topicId={topic.id}
      topicName={libraryKey(topic.name)}
      grade={topic.grade}
      entry={found.entry}
      count={Math.max(...entries.map((e) => e.position))}
      lesson={found.lesson}
      source={found.source}
      next={after ? { position: after.position, title: after.title } : null}
      session={session}
      initialDelivery={defaultDelivery(trials)}
    />
  )
}
