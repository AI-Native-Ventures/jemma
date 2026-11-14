import { type GradeChip } from '@/lib/own-grades'
import Link from 'next/link'

// One chip for each grade the learner added, the chosen one filled, and "+ Another grade" last. Plain links (the address carries the grade), in a
// row that wraps so nothing scrolls sideways at 360 px. Each chip is at least 44 px high with room at the sides (the P90 rule).
const chip = 'flex min-h-11 items-center justify-center rounded-pill border-[1.5px] border-ink px-5 py-2 text-center text-[16px] leading-[1.25] font-semibold no-underline'
const on = `${chip} bg-ink text-white`
const off = `${chip} bg-card text-ink`

export function GradeChips({ grades, current }: { grades: GradeChip[]; current: number | null }) {
  return (
    <nav aria-label="Grades">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {grades.map((g) => (
          <li key={g.classId}>
            <Link href={`/k/maths?grade=${g.grade}`} aria-current={g.grade === current ? 'page' : undefined} className={g.grade === current ? on : off}>
              Grade {g.grade}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/k/maths/grades" className={`${off} border-dashed`}>
            + Another grade
          </Link>
        </li>
      </ul>
    </nav>
  )
}
