import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { canonicalSubject } from '@jemma/profiling/logic'
import { capsLine, groupByTerm, withoutTermSuffix } from '@/lib/map-source'
import { loadTopicsClass } from '../data'
import { partsOf, percentOf, topicLines, tally, sessionsByTopic } from '../logic'
import { Heading, Shell, Stat, TopicCard } from '../parts'

export const metadata: Metadata = { title: 'Topics' }
export const dynamic = 'force-dynamic'

/**
 * Screen 2 of the teacher's Topics (P139): the topics of one part, each with the class average and how many learners practised. A class on the CAPS
 * map sees them under "Term 1", "Term 2" and so on, as the learners' My maths shows them. A topic opens each learner's result.
 */
export default async function TopicsPartPage({ params }: { params: Promise<{ classId: string; family: string }> }) {
  const { classId, family } = await params
  const c = await loadTopicsClass(classId)
  if (!c) notFound()
  const part = partsOf(c.subject, c.topics).find((p) => p.family === family)
  if (!part) notFound()
  const base = `/t/${classId}`
  const lines = topicLines(part, c.topics, c.sessions)
  const byTopic = sessionsByTopic(c.topics, c.sessions)
  const all = tally(part.topics.flatMap((t) => byTopic.get(t.id) ?? []))
  const average = percentOf(all)
  const terms = groupByTerm(lines.map((l) => ({ ...l, term: l.topic.term })), c.source)
  const card = (l: (typeof lines)[number]) => (
    <li key={l.topic.id}>
      <TopicCard
        href={`${base}/topics/${part.family}/${l.topic.id}`}
        line={l}
        name={c.source.caps ? withoutTermSuffix(l.topic.name) : l.topic.name}
        learnersInClass={c.learners.length}
      />
    </li>
  )

  return (
    <Shell href={`${base}/topics`} backLabel="Back to the parts" eyebrow={`${c.name} · ${canonicalSubject(c.subject)}`} title={part.label}>
      <Heading title={part.label} line={capsLine(c.source)} />
      <div className="grid grid-cols-2 gap-2.5">
        <Stat value={average === null ? '-' : `${average}%`} label="Class average" />
        <Stat value={`${all.learners} of ${c.learners.length}`} label="Learners practised" />
      </div>
      {terms ? (
        terms.map((g) => (
          <section key={g.term} aria-labelledby={`term-${g.term}`} className="flex flex-col gap-2.5">
            <h2 id={`term-${g.term}`} className="m-0 text-[17px] font-bold">
              Term {g.term}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">{g.topics.map(card)}</ul>
          </section>
        ))
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">{lines.map(card)}</ul>
      )}
    </Shell>
  )
}
