import type { MyMathsTopic } from '@jemma/profiling/logic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getScreenShape } from '@/lib/data/own-screens'
import { getMyMaths } from '@/lib/data/p80'
import { capsLine, groupByTerm, withoutTermSuffix } from '@/lib/map-source'
import { noTopicsLine } from '@/lib/own-grades'
import { PracticeRow, PractiseButton } from '../../Practise'
import { AppHeader } from '../../session/_parts/AppHeader'
import { Diamond } from '../../session/_parts/Gems'
import { levelOfScore, lockOf, rowScore, strandScreen, topicLine } from '../format'
import { ProgressLegend, TopicDot } from '../ProgressDots'

export const metadata: Metadata = { title: 'My maths' }
export const dynamic = 'force-dynamic'

const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'

/**
 * One part of Mathematics: its label and the learner's count, then this year's topics of that part with their counts, the stage of a gap on
 * a topic, and a Practise button for each. When the class has no approved map, or the map has no topic of this part, one line and one button
 * to practise the part itself. In My own the address carries the class (`?class=<id>`), and the way back goes to that class.
 * A class on the CAPS map (P115) lists its topics under "Term 1", "Term 2" and so on, with the names as CAPS has them (a topic CAPS teaches twice
 * in a year is the same name under two terms), and says under the heading where the topics come from. Any other map keeps its flat list.
 * Each topic row starts with its progress circle (P122), filled by the topic's score as on My maths, with the same one-line key above the list.
 */
export default async function MyMathsPartPage({ params, searchParams }: { params: Promise<{ family: string }>; searchParams?: Promise<{ class?: string | string[]; grade?: string | string[] }> }) {
  const { family } = await params
  const shape = await getScreenShape((await searchParams) ?? {})
  const own = shape.workspace === 'own' ? shape : null
  const { firstName, maths, status, source } = await getMyMaths(own?.picked?.classId)
  const strand = maths.strands.find((s) => s.family === family)
  if (!strand) notFound()
  const grade = own?.picked?.grade ?? null
  // In My own there is no teacher to wait for: a part with no topic says the grade has none yet.
  const screen = strandScreen(strand, own && grade !== null ? noTopicsLine(grade) : undefined)
  const back = own?.picked ? `/k/maths?class=${own.picked.classId}` : '/k/maths'
  const lock = lockOf(status)
  const byTerm = screen.kind === 'topics' ? groupByTerm(screen.topics, source) : null
  const from = screen.kind === 'topics' ? capsLine(source) : null
  const row = (t: MyMathsTopic, name: string) => (
    <PracticeRow
      key={t.id}
      choice={{ topicId: t.id, topicName: t.name }}
      name={name}
      lines={[topicLine(t), rowScore(t.score)].filter((l): l is string => l !== null)}
      locked={lock !== null}
      lead={<TopicDot level={levelOfScore(t.score)} />}
    />
  )
  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={firstName} />
      <main className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">
        <Link href={back} className="flex min-h-11 items-center text-[16px] font-semibold text-ink no-underline">
          <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>My maths
        </Link>
        <div className="flex items-start gap-2.5">
          <Diamond size={16} className="mt-3 flex-none" />
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{screen.title}</h1>
            <p className="m-0 text-[17px] text-body">{screen.score}</p>
            {from ? <p className="m-0 text-[14px] leading-[1.35] text-body">{from}</p> : null}
          </div>
        </div>

        {lock ? (
          <p className="m-0 rounded-20 border border-[#FFC9BB] bg-coral-wash p-4 text-[16px] leading-[1.45]">
            {lock.text}{' '}
            <Link href={lock.href} className="font-semibold text-ink underline underline-offset-[3px]">{lock.link}</Link>
          </p>
        ) : null}

        {screen.kind === 'topics' ? <ProgressLegend /> : null}

        {screen.kind === 'topics' ? (
          byTerm ? (
            byTerm.map((g) => (
              <section key={g.term} aria-labelledby={`term-${g.term}`} className="flex flex-col gap-2.5">
                <h2 id={`term-${g.term}`} className="m-0 text-[17px] font-bold">Term {g.term}</h2>
                <ul className={list}>{g.topics.map((t) => row(t, withoutTermSuffix(t.name)))}</ul>
              </section>
            ))
          ) : (
            <ul className={list}>{screen.topics.map((t) => row(t, t.name))}</ul>
          )
        ) : (
          <section className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4">
            <p className="m-0 text-[16px] leading-[1.45] text-body">{screen.line}</p>
            {lock ? null : <PractiseButton choice={screen.choice} label={screen.button} size="big" />}
          </section>
        )}
      </main>
    </div>
  )
}
