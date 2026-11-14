import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMyMaths } from '@/lib/data/p80'
import { PracticeRow, PractiseButton } from '../../Practise'
import { AppHeader } from '../../session/_parts/AppHeader'
import { Diamond } from '../../session/_parts/Gems'
import { lockOf, rowScore, strandScreen, topicLine } from '../format'

export const metadata: Metadata = { title: 'My maths' }
export const dynamic = 'force-dynamic'

/**
 * One part of Mathematics: its label and the learner's count, then this year's topics of that part with their counts, the stage of a gap on
 * a topic, and a Practise button for each. When the class has no approved map, or the map has no topic of this part, one line and one button
 * to practise the part itself.
 */
export default async function MyMathsPartPage({ params }: { params: Promise<{ family: string }> }) {
  const { family } = await params
  const { firstName, maths, status } = await getMyMaths()
  const strand = maths.strands.find((s) => s.family === family)
  if (!strand) notFound()
  const screen = strandScreen(strand)
  const lock = lockOf(status)
  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={firstName} />
      <main className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">
        <Link href="/k/maths" className="flex min-h-11 items-center text-[16px] font-semibold text-ink no-underline">
          <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>My maths
        </Link>
        <div className="flex items-start gap-2.5">
          <Diamond size={16} className="mt-3 flex-none" />
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{screen.title}</h1>
            <p className="m-0 text-[17px] text-body">{screen.score}</p>
          </div>
        </div>

        {lock ? (
          <p className="m-0 rounded-20 border border-[#FFC9BB] bg-coral-wash p-4 text-[16px] leading-[1.45]">
            {lock.text}{' '}
            <Link href={lock.href} className="font-semibold text-ink underline underline-offset-[3px]">{lock.link}</Link>
          </p>
        ) : null}

        {screen.kind === 'topics' ? (
          <ul className="m-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0">
            {screen.topics.map((t) => (
              <PracticeRow key={t.id} choice={{ topicId: t.id, topicName: t.name }} name={t.name} lines={[topicLine(t), rowScore(t.score)].filter((l): l is string => l !== null)} locked={lock !== null} />
            ))}
          </ul>
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
