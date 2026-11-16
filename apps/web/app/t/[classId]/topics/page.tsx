import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { canonicalSubject } from '@jemma/profiling/logic'
import { AiTokens } from '@/components/AiTokens'
import { loadTopicsClass } from './data'
import { partLines, percentOf, sessionsByTopic, tally } from './logic'
import { EmptyCard, Heading, PartCard, Shell, Stat } from './parts'

export const metadata: Metadata = { title: 'Topics' }
export const dynamic = 'force-dynamic'

/**
 * Screen 1 of the teacher's Topics (P139): the parts of the class's Mathematics, each with the class average of the learners' practice and how many
 * learners practised. A part opens its topics. The numbers are practice only: finished practice sessions, the Try answers.
 */
export default async function TopicsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const c = await loadTopicsClass(classId)
  if (!c) notFound()
  const base = `/t/${classId}`
  const subject = canonicalSubject(c.subject)
  const lines = partLines(c.subject, c.topics, c.sessions)
  const all = tally([...sessionsByTopic(c.topics, c.sessions).values()].flat())
  const average = percentOf(all)

  return (
    <Shell href={base} backLabel="Back to the class" eyebrow={c.name} title="Topics">
      <AiTokens classId={classId} />
      <Heading title={subject} line="How the class is doing in practice, part by part. Tap a part to see its topics." />
      {lines.length === 0 ? (
        <EmptyCard>
          This class has no topics yet. <Link href={`${base}/curriculum`} className="font-semibold text-ink underline underline-offset-[3px]">Set up the curriculum</Link> and its parts show here.
        </EmptyCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat value={average === null ? '-' : `${average}%`} label="Class average" />
            <Stat value={`${all.learners} of ${c.learners.length}`} label="Learners practised" />
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {lines.map((line) => (
              <li key={line.family}>
                <PartCard href={`${base}/topics/${line.family}`} line={line} learnersInClass={c.learners.length} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  )
}
