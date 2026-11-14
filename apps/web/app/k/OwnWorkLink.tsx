import Link from 'next/link'
import { ChevronRight } from './session/_parts/Chips'

/**
 * The way from the learner's own workspace to the pages where the learner adds their own work: "Add a marked test" and "Use your own curriculum"
 * (the pages are at /k/own). Shown in My own only: on the home and on My maths under the grade chips. A row with room all round and no fixed
 * height, so the line may take a second line on a small phone.
 */
export function OwnWorkLink() {
  return (
    <Link href="/k/own" className="flex min-h-[64px] items-center gap-3.5 rounded-20 border border-line bg-card py-3.5 pr-3.5 pl-[18px] text-ink no-underline">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] leading-[1.3] font-semibold">Add your own work</span>
        <span className="text-[14px] leading-[1.35] text-body">A marked test or your own curriculum.</span>
      </span>
      <ChevronRight />
    </Link>
  )
}
