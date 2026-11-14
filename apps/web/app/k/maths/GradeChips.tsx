import { chipAria, chipLabel, type GradeChip } from '@/lib/own-grades'
import Link from 'next/link'

// One chip for each class of the learner's private workspace ("Grade 6" for the CAPS class, "Grade 6 \u00b7 {name}" for a curriculum of their own), the
// chosen one filled, and "+ Another grade" last. Plain links (the address carries the class), in a row that wraps so nothing scrolls sideways at
// 360 px. Each chip is at least 44 px high with room at the sides (the P90 rule).
const chip = 'flex min-h-11 items-center justify-center rounded-pill border-[1.5px] border-ink px-5 py-2 text-center text-[16px] leading-[1.25] font-semibold no-underline'
const on = `${chip} bg-ink text-white`
const off = `${chip} bg-card text-ink`

export function GradeChips({ grades, current }: { grades: GradeChip[]; current: string | null }) {
  return (
    <nav aria-label="Grades">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {grades.map((g) => (
          <li key={g.classId} className="min-w-0 max-w-full">
            <Link
              href={`/k/maths?class=${g.classId}`}
              aria-current={g.classId === current ? 'page' : undefined}
              aria-label={g.caps ? undefined : chipAria(g)}
              className={g.classId === current ? on : off}
            >
              {chipLabel(g)}
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
