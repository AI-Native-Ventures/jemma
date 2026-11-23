'use client'

import { useState, type ReactNode } from 'react'
import { BLOCK_LABEL, LessonBlock } from '../k/learn/_parts/Block'
import { DeliverySwitch } from '../k/learn/_parts/DeliverySwitch'
import type { Delivery } from '../k/learn/_parts/delivery'
import { LessonInline, LessonText, typesetFor } from '../k/learn/_parts/LessonText'
import { wordsOf } from '../k/learn/_parts/listen'
import { ListenMini, ListenPlayer, usePlayerOutOfSight } from '../k/learn/_parts/ListenPlayer'
import { useListen } from '../k/learn/_parts/useListen'
import { TOUR_GRADE } from './data/topics'
import { markTourBlock, tourLessonForReader } from './data/library'

const card = 'flex flex-col gap-2 rounded-[22px] border border-line bg-card p-4 lg:p-5'

/** A diamond bullet, as the lesson of the app has it. */
const Bullet = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-[7px] flex-none">
    <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
  </svg>
)

export type TourLessonReaderProps = {
  /** The lesson of the library, 1 to 8. */
  position: number
  /** The delivery the lesson opens in. The switch at the top changes it from there. */
  delivery: Delivery
  onDelivery: (delivery: Delivery) => void
  /** The button at the top left that goes back (to the lesson list), when there is a place to go back to. */
  back?: { label: string; onClick: () => void }
  /** The buttons at the bottom: where the learner goes after the lesson. */
  children: ReactNode
}

/**
 * One lesson of the library for the saved tour: the same blocks as the lesson screen of the app (the app's own `LessonBlock`, `DeliverySwitch` and voice), in
 * Read, Pictures or Listen. The lesson reaches it through `forChild`, so no answer is in what it draws; a "Your turn" question is marked in the browser,
 * from the saved copy. Nothing is sent anywhere, no link leaves the tour, and the choice of delivery is not kept on the device: the tour decides which
 * one a lesson opens in.
 */
export function TourLessonReader({ position, delivery, onDelivery, back, children }: TourLessonReaderProps) {
  const found = tourLessonForReader(position)
  // The voice of the lesson: until the browser has been asked, one is taken to be there (most phones have one), so the page does not say "cannot read
  // aloud" for a moment first.
  const listen = useListen(found?.lesson.blocks ?? [])
  const [readAlong, setReadAlong] = useState(true)
  const [activeTry, setActiveTry] = useState<number | null>(null)
  // Listen has the player in place of the title. Once the voice has moved down the lesson and the player is out of sight, a slim one stays at the top.
  const player = delivery === 'listen' && listen.ok
  const [playerRef, playerOut] = usePlayerOutOfSight(player)
  if (!found) return null
  const { entry, lesson, source, count } = found
  const typeset = typesetFor(TOUR_GRADE)

  const choose = (d: Delivery) => {
    listen.stop()
    onDelivery(d)
  }

  const mark = (block: number, value: string) => {
    const res = markTourBlock(position, block, value)
    if (!res) throw new Error('not a question')
    return res
  }

  return (
    <div data-lesson={position} className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-line bg-ground">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-1 px-5 pt-1 pb-3">
          {back ? (
            <button type="button" onClick={() => { listen.stop(); back.onClick() }} className="flex min-h-11 cursor-pointer items-center self-start border-0 bg-transparent p-0 text-[16px] font-semibold text-ink">
              <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>
              {back.label}
            </button>
          ) : null}
          <DeliverySwitch value={delivery} onChange={choose} />
        </div>
        {/* The slim player floats under the bar, so the page does not move when it comes and goes. */}
        {player && playerOut && listen.part !== null ? (
          <div className="absolute inset-x-0 top-full pt-2">
            <div className="mx-auto w-full max-w-[560px] px-5">
              <ListenMini listen={listen} total={lesson.blocks.length} label={BLOCK_LABEL[lesson.blocks[listen.part]!.kind]} />
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-5 pt-5 pb-8">
        <div className={`flex flex-col ${player ? 'gap-2.5' : 'gap-1'}`}>
          <p className="m-0 text-[15px] font-semibold text-body">
            Lesson {entry.position} of {count} · {entry.minutes} min
          </p>
          {player ? (
            <div ref={playerRef}>
              <ListenPlayer
                title={<LessonInline text={lesson.title} typeset={typeset} size={24} color="#FFFFFF" />}
                words={lesson.blocks.map(wordsOf)}
                listen={listen}
                readAlong={readAlong}
                onReadAlong={() => setReadAlong(!readAlong)}
              />
            </div>
          ) : (
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">
              <LessonInline text={lesson.title} typeset={typeset} size={34} />
            </h1>
          )}
        </div>

        <section aria-labelledby="goals" className={card}>
          <h2 id="goals" className="m-0 text-[17px] font-bold">In this lesson</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lesson.objectives.map((o, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Bullet />
                <LessonText text={o} typeset={typeset} size={20} className="text-[17px]" />
              </li>
            ))}
          </ul>
        </section>

        {lesson.keyWords.length > 0 ? (
          <section aria-labelledby="words" className={card}>
            <h2 id="words" className="m-0 text-[17px] font-bold">Key words</h2>
            <dl className="m-0 flex flex-col gap-2.5">
              {lesson.keyWords.map((k) => (
                <div key={k.word} className="flex flex-col gap-0.5">
                  <dt className="text-[17px] font-semibold">{k.word}</dt>
                  <dd className="m-0 text-[16px] text-body">
                    <LessonText text={k.meaning} typeset={typeset} size={20} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {delivery === 'listen' && !listen.ok ? (
          <p className="m-0 rounded-14 bg-soft-2 p-3 text-[15px] leading-[1.45] text-body">This phone cannot read aloud here, so the words are shown.</p>
        ) : null}

        {lesson.blocks.map((block, i) => (
          <LessonBlock
            key={i}
            index={i}
            block={block}
            delivery={delivery}
            typeset={typeset}
            voice={{ ok: listen.ok, playing: listen.playing && listen.part === i, onToggle: () => listen.playPart(i), words: readAlong && listen.heard.has(i) }}
            topicLessonId=""
            topic={entry.title}
            activeTry={activeTry}
            onOpenTry={setActiveTry}
            markTry={mark}
          />
        ))}

        <section aria-labelledby="remember" className={card}>
          <h2 id="remember" className="m-0 text-[17px] font-bold">Remember</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lesson.summary.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Bullet />
                <LessonText text={s} typeset={typeset} size={20} className="text-[17px]" />
              </li>
            ))}
          </ul>
        </section>

        {source.credit ? (
          <p data-credit="true" className="m-0 text-[13px] leading-[1.45] text-muted">
            {source.credit}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">{children}</div>
      </main>
    </div>
  )
}
