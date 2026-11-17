import { libraryKey } from '@jemma/profiling/schemas'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { myChild } from '@/lib/data/p27'
import { libraryFor, resolveTopic } from '@/lib/data/teaching'
import { entryButton, isUuid, nextEntry } from '@/lib/teaching'
import { AppHeader } from '../../session/_parts/AppHeader'
import { LessonInline, typesetFor } from '../_parts/LessonText'
import { Diamond } from '../../session/_parts/Gems'

export const metadata: Metadata = { title: 'Lessons' }
export const dynamic = 'force-dynamic'

const bigLink =
  'flex min-h-[60px] w-full items-center justify-center rounded-18 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white no-underline'

/**
 * The lessons of one topic: the topic's name, one button to start (or go on with) the first lesson that is not finished, and every lesson in teaching
 * order with its length and a tick when it is done. A topic with no lessons is not a page (the Learn button is only shown where there are some).
 * `?session=<id>` is the practice the learner came from: the way back to it is shown.
 */
export default async function LessonListPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams?: Promise<{ session?: string | string[] }> }) {
  const { topicId } = await params
  const raw = (await searchParams)?.session
  const session = isUuid(Array.isArray(raw) ? raw[0] : raw) ? (Array.isArray(raw) ? raw[0]! : raw!) : null
  const topic = await resolveTopic(topicId)
  if (!topic) notFound()
  const entries = await libraryFor(topic.grade, topic.name)
  const go = nextEntry(entries)
  if (!go) notFound()
  const { child } = await myChild()
  const query = session ? `?session=${session}` : ''
  const href = (position: number) => `/k/learn/${topicId}/${position}${query}`
  const doneCount = entries.filter((e) => e.done).length
  const back = session ? { href: `/k/session/${session}`, label: 'Your practice' } : { href: '/k/maths', label: 'My maths' }
  const label = entryButton(go)

  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={child.first_name} />
      <main className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">
        <Link href={back.href} className="flex min-h-11 items-center text-[16px] font-semibold text-ink no-underline">
          <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>{back.label}
        </Link>
        <div className="flex items-start gap-2.5">
          <Diamond size={16} className="mt-3 flex-none" />
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">{libraryKey(topic.name)}</h1>
            <p className="m-0 text-[17px] text-body">
              Grade {topic.grade} · {entries.length === 1 ? '1 lesson' : `${entries.length} lessons`}
              {doneCount > 0 ? ` · ${doneCount} done` : ''}
            </p>
          </div>
        </div>

        <Link href={href(go.position)} className={bigLink}>{label}</Link>

        <section aria-labelledby="lessons" className="flex flex-col gap-2.5">
          <h2 id="lessons" className="m-0 text-[17px] font-bold">Lessons</h2>
          <ol className="m-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0">
            {entries.map((e) => (
              <li key={e.id} className="border-t border-soft first:border-t-0">
                <Link href={href(e.position)} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
                  <span
                    aria-hidden="true"
                    className={`flex size-9 flex-none items-center justify-center rounded-pill text-[16px] font-bold ${e.done ? 'bg-ink text-white' : 'border-2 border-edge text-ink'}`}
                  >
                    {e.done ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    ) : (
                      e.position
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[17px] leading-[1.3] font-semibold text-pretty">
                      <LessonInline text={e.title} typeset={typesetFor(topic.grade)} size={20} />
                    </span>
                    <span className="text-[14px] leading-[1.35] text-body">
                      {e.minutes} min{e.done ? ' · Done' : e.started ? ' · Started' : ''}
                    </span>
                  </span>
                  <span aria-hidden="true" className="flex-none text-[22px] text-muted">&rsaquo;</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}
