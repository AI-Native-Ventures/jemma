import { Gem, Shot, type ShotProps } from './Shot'

type Card = { id: string; title: string; lines: readonly string[]; shot: Omit<ShotProps, 'priority' | 'className'> }

// Each line says what the product does today. The screenshots are real screens of the running app (cropped, never redrawn), with made-up people.
const CARDS: readonly Card[] = [
  {
    id: 'learners',
    title: 'For learners',
    lines: [
      'Switch between My school and My own, and practise any grade from 1 to 12.',
      'Answer on the screen, or on paper with one photo.',
      'Add a marked test of your own. Jemma reads it from a photo.',
    ],
    shot: {
      src: '/landing/learner-marked-test.png',
      alt: 'A marked test Amina added from a photo, on a phone: 4 of 6 right, each question with what she wrote and a tick or a cross.',
      width: 390,
      height: 628,
    },
  },
  {
    id: 'parents',
    title: 'For parents',
    lines: [
      "See your child's results once the teacher shares them.",
      'Practise at home with your child.',
      'You see nothing about a child until the teacher says yes to your link.',
    ],
    shot: {
      src: '/landing/parent-profile.png',
      alt: "A parent's view of Amina on a phone: how she is doing this week, a note to check her homework, and her marks by topic.",
      width: 390,
      height: 856,
    },
  },
  {
    id: 'teachers',
    title: 'For teachers',
    lines: [
      'Snap a class test. Code marks it and shows the gaps of the whole class.',
      'The Long view shows what held for three terms or more, so you can raise it with the family.',
      'You approve the topic map, the answer key and every Long view pattern.',
    ],
    shot: {
      src: '/landing/teacher-long-view.png',
      alt: "A teacher's Long view of Amina on a phone: her marks in six parts of Mathematics, term by term from Grade 4 to Grade 6.",
      width: 390,
      height: 504,
    },
  },
]

/** Three cards, one for each person Jemma is for, each with two or three short lines and one real screenshot. */
export function Audiences() {
  return (
    <section aria-labelledby="who-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-10 lg:px-10 lg:py-14">
        <h2 id="who-title" className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.01em] lg:text-[36px]">
          Who it is for
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          {CARDS.map((card) => (
            <article key={card.id} aria-labelledby={`who-${card.id}`} className="flex min-w-0 flex-col gap-5 rounded-20 border border-line bg-card p-5">
              <h3 id={`who-${card.id}`} className="m-0 text-[22px] leading-[1.2] font-semibold">
                {card.title}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {card.lines.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[16px] leading-[1.45] text-pretty">
                    <Gem size={12} className="mt-[7px]" />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-1">
                <Shot {...card.shot} className="mx-auto max-w-[320px]" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
