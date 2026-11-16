import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { withoutTermSuffix } from '@/lib/map-source'
import { loadTopicItems, loadTopicsClass } from '../../data'
import { learnerResults, mostMissed, needHelpFirst, partsOf, percentOf, sessionsByTopic, tally } from '../../logic'
import { AnalysisCard, EmptyCard, Heading, LearnerList, Shell, Stat } from '../../parts'

export const metadata: Metadata = { title: 'Topics' }
export const dynamic = 'force-dynamic'

/**
 * Screen 3 of the teacher's Topics (P139): one topic. Every learner of the class with the last result on it (score, day, tries, a small bar; "not tried"
 * for a learner with none) and an AI analysis made from what the AI already wrote with the practice questions: the questions the class missed most
 * with the AI's own notes, and the learners who need help first. No new AI call.
 */
export default async function TopicDetailPage({ params }: { params: Promise<{ classId: string; family: string; topicId: string }> }) {
  const { classId, family, topicId } = await params
  const c = await loadTopicsClass(classId)
  if (!c) notFound()
  const part = partsOf(c.subject, c.topics).find((p) => p.family === family)
  const topic = part?.topics.find((t) => t.id === topicId)
  if (!part || !topic) notFound()
  const base = `/t/${classId}`
  const sessions = sessionsByTopic(c.topics, c.sessions).get(topic.id) ?? []
  const all = tally(sessions)
  const average = percentOf(all)
  const results = learnerResults(c.learners, sessions)
  const items = await loadTopicItems(sessions)
  const name = c.source.caps ? withoutTermSuffix(topic.name) : topic.name

  return (
    <Shell href={`${base}/topics/${part.family}`} backLabel={`Back to ${part.label}`} eyebrow={`${c.name} · ${part.label}`} title={name}>
      {/* P137 token card */}
      <Heading title={name} line={all.sessions === 0 ? 'No one has practised this topic yet.' : null} />
      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={average === null ? '-' : `${average}%`} label="Class average" />
        <Stat value={`${all.learners} of ${c.learners.length}`} label="Practised" />
        <Stat value={String(all.sessions)} label="Practices done" />
      </div>
      {c.learners.length === 0 ? (
        <EmptyCard>There are no learners in this class yet.</EmptyCard>
      ) : (
        <>
          <LearnerList results={results} base={base} />
          <AnalysisCard missed={mostMissed(items)} needHelp={needHelpFirst(results)} anyone={all.sessions > 0} grade={c.grade} base={base} />
        </>
      )}
    </Shell>
  )
}
