import type { ReactNode } from 'react'
import { BAND, Drawing, Title, Together, WRAP } from './Bits'
import { Gem, Phone, type ShotProps } from './Shot'

type Card = { id: string; title: string; lines: readonly string[]; tone: string; drawing: ReactNode; shot: Omit<ShotProps, 'priority' | 'className'> }

// Each line says what the product does today. The screenshots are real screens of the running app (never redrawn), with made-up people.
const CARDS: readonly Card[] = [
  {
    id: 'parents',
    title: 'For parents',
    lines: ['See where your child loses marks.', 'Snap homework. Jemma marks it.', 'Practise at home together.'],
    tone: 'bg-soft-4',
    // a house with a heart in it
    drawing: (
      <>
        <path d="M3.5 11 12 4l8.5 7" />
        <path d="M5.8 9.4V20h12.4V9.4" />
        <path d="M12 17.4s-3-1.8-3-3.7a1.55 1.55 0 0 1 3-.7 1.55 1.55 0 0 1 3 .7c0 1.9-3 3.7-3 3.7z" />
      </>
    ),
    shot: { src: '/landing/parent-marks.png', alt: "A parent's view of a child's tests and marks.", width: 390, height: 844 },
  },
  {
    id: 'schools',
    title: 'For schools',
    lines: ['Marks from a photo of a class test.', "See what the class doesn't get yet.", 'The teacher approves the answer key first.'],
    tone: 'bg-green-tint',
    // a board on its stand
    drawing: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8.5 20l2-4M15.5 20l-2-4M7 8.5h6M7 11.5h4" />
      </>
    ),
    shot: { src: '/landing/class-topics.png', alt: "A teacher's list of what the class doesn't get yet, topic by topic.", width: 390, height: 860 },
  },
]

/**
 * A learner can add a parent and join a class: two big cards, each with three short lines and the top of one real phone screen in a tray.
 * On a laptop the words and the tray sit side by side, and the second card is turned round.
 */
export function Audiences() {
  return (
    <section aria-labelledby="who-title">
      <div className={`${WRAP} ${BAND}`}>
        <Title id="who-title">
          Add a parent. <Together>Join your class.</Together>
        </Title>
        <div className="mt-7 flex flex-col gap-5 lg:mt-12 lg:gap-8">
          {CARDS.map((card, i) => (
            <article
              key={card.id}
              aria-labelledby={`who-${card.id}`}
              className={`flex flex-col overflow-hidden rounded-[28px] border border-line bg-card md:flex-row xl:rounded-[40px] ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
            >
              <div className="flex min-w-0 flex-col justify-center gap-[18px] p-7 md:w-1/2 md:flex-none lg:gap-6 lg:p-12 xl:p-16">
                <span aria-hidden="true" className={`flex size-14 flex-none items-center justify-center rounded-18 ${card.tone}`}>
                  <Drawing>{card.drawing}</Drawing>
                </span>
                <h3 id={`who-${card.id}`} className="m-0 text-[30px] leading-[1.08] font-bold tracking-[-0.02em] lg:text-[40px] xl:text-[48px]">
                  {card.title}
                </h3>
                <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                  {card.lines.map((line) => (
                    <li key={line} className="flex items-start gap-3.5 text-[18px] leading-[1.45] lg:text-[20px] xl:text-[22px]">
                      <Gem size={12} className="mt-[0.42em]" />
                      <span className="min-w-0 text-balance">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className={`flex h-[270px] min-w-0 items-start justify-center overflow-hidden pt-9 [--phone:250px] md:h-[420px] md:w-1/2 md:flex-none lg:h-[480px] lg:pt-12 lg:[--phone:290px] xl:h-[560px] xl:pt-14 xl:[--phone:316px] ${card.tone}`}
              >
                <Phone {...card.shot} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
