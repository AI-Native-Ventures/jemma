import type { Metadata } from 'next'
import Link from 'next/link'
import { getMyMaths } from '@/lib/data/p80'
import { PracticeRow } from '../Practise'
import { AppHeader } from '../session/_parts/AppHeader'
import { ChevronRight } from '../session/_parts/Chips'
import { Diamond } from '../session/_parts/Gems'
import { gapLine, lockOf, rowScore } from './format'

export const metadata: Metadata = { title: 'My maths' }
export const dynamic = 'force-dynamic'

const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'

/**
 * "My maths": the learner's own count in each part of Mathematics ("5 of 6 right", never a percent), what Jemma suggests, the learner's gaps
 * and a way into each part. The count is the learner's own, from class tests the teacher has shared and from their own practices.
 */
export default async function MyMathsPage() {
  const { firstName, maths, status } = await getMyMaths()
  const lock = lockOf(status)
  const locked = lock !== null
  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={firstName} />
      <main className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">
        <div className="flex items-start gap-2.5">
          <Diamond size={16} className="mt-3 flex-none" />
          <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">My maths</h1>
        </div>

        {lock ? (
          <p className="m-0 rounded-20 border border-[#FFC9BB] bg-coral-wash p-4 text-[16px] leading-[1.45]">
            {lock.text}{' '}
            <Link href={lock.href} className="font-semibold text-ink underline underline-offset-[3px]">{lock.link}</Link>
          </p>
        ) : null}

        {maths.suggestions.length > 0 ? (
          <section aria-labelledby="suggested" className="flex flex-col gap-2.5">
            <h2 id="suggested" className="m-0 text-[17px] font-bold">Suggested for you</h2>
            <ul className={list}>
              {maths.suggestions.map((s) => (
                <PracticeRow key={`${s.topicId ?? ''}|${s.topicName}`} choice={{ topicId: s.topicId, topicName: s.topicName }} name={s.topicName} lines={[s.reason, rowScore(s.score)]} locked={locked} />
              ))}
            </ul>
          </section>
        ) : null}

        {maths.gaps.length > 0 ? (
          <section aria-labelledby="gaps" className="flex flex-col gap-2.5">
            <h2 id="gaps" className="m-0 text-[17px] font-bold">Your gaps</h2>
            <ul className={list}>
              {maths.gaps.map((g) => (
                <PracticeRow key={`${g.topicId ?? ''}|${g.topicName}`} choice={{ topicId: g.topicId, topicName: g.topicName }} name={g.topicName} lines={[gapLine(g)]} locked={locked} />
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="all" className="flex flex-col gap-2.5">
          <h2 id="all" className="m-0 text-[17px] font-bold">All of {maths.subject}</h2>
          <ul className={list}>
            {maths.strands.map((s) => (
              <li key={s.family} className="border-t border-soft first:border-t-0">
                <Link href={`/k/maths/${s.family}`} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[17px] leading-[1.3] font-semibold">{s.label}</span>
                    <span className="text-[14px] text-body">{rowScore(s.score)}</span>
                  </span>
                  <ChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
