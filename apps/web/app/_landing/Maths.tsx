import { BAND, LEAD, Title, Together, WRAP } from './Bits'
import { Shot, type ShotProps } from './Shot'

type Tile = { label: string; shot: Omit<ShotProps, 'priority' | 'className'> }

// Four real screens of the app, cut to the drawing: a question and three lessons.
const TILES: readonly Tile[] = [
  { label: 'Fractions', shot: { src: '/landing/maths-fractions.png', alt: 'A fractions question: what is one half plus one quarter?', width: 374, height: 406 } },
  { label: 'Graphs', shot: { src: '/landing/maths-graphs.png', alt: 'A lesson on straight-line graphs, with the graph drawn.', width: 374, height: 406 } },
  { label: 'Trigonometry', shot: { src: '/landing/maths-trigonometry.png', alt: 'A lesson on trigonometry in right triangles, with the triangle drawn.', width: 374, height: 406 } },
  { label: 'Algebra', shot: { src: '/landing/maths-algebra.png', alt: 'A lesson on algebraic expressions, drawn as a rectangle.', width: 374, height: 406 } },
]

const TOPICS = ['Numbers', 'Fractions', 'Algebra', 'Functions and graphs', 'Geometry', 'Trigonometry', 'Data handling', 'Financial maths'] as const

/** What Jemma teaches: every grade, the curriculum built in, four small pictures of drawn maths and eight topics. */
export function Maths() {
  return (
    <section aria-labelledby="maths-title" className="bg-card">
      <div className={`${WRAP} ${BAND}`}>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
          <Title id="maths-title" className="min-w-0 flex-[1_1_420px]">
            Maths for <Together>Grade 1</Together> to <Together>Grade 12.</Together>
          </Title>
          <p className={`${LEAD} min-w-0 flex-[0_1_25em]`}>CAPS is built in. Lessons draw the diagrams, graphs and shapes.</p>
        </div>
        <ul className="m-0 mt-7 grid list-none grid-cols-2 gap-3.5 p-0 sm:grid-cols-4 lg:mt-12 lg:gap-5 xl:gap-6">
          {TILES.map((tile) => (
            <li key={tile.label} className="flex min-w-0 flex-col overflow-hidden rounded-18 border border-line bg-ground xl:rounded-[26px]">
              <span className="px-3 pt-3 text-[15px] leading-[1.3] font-bold lg:px-4 lg:pt-4 xl:px-5 xl:pt-[18px] xl:text-[17px]">{tile.label}</span>
              <Shot {...tile.shot} className="mt-1.5 h-auto" />
            </li>
          ))}
        </ul>
        <ul aria-label="Some of the topics" className="m-0 mt-[22px] flex list-none flex-wrap gap-2.5 p-0 lg:mt-8">
          {TOPICS.map((topic) => (
            <li key={topic} className="flex min-h-9 items-center rounded-pill border border-line bg-ground px-3.5 text-[14px] leading-[normal] font-semibold xl:text-[15px]">
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
