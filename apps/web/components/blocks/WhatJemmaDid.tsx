import Link from 'next/link'

export type JemmaLogEntry = {
  /** `14:12` for today, `Sun 18:40` for older. */
  at: string
  text: string
}

export type WhatJemmaDidProps = {
  entries: JemmaLogEntry[]
  limit?: number
  seeAllHref?: string
  /** Teacher card is 18 px round with a 16 px heading; parent is 20 px with 17 px. */
  variant?: 'teacher' | 'parent'
}

/** The agent's recent actions, newest first, in plain words. */
export function WhatJemmaDid({ entries, limit, seeAllHref, variant = 'teacher' }: WhatJemmaDidProps) {
  const shown = limit === undefined ? entries : entries.slice(0, limit)
  const parent = variant === 'parent'
  // Times are 40 px wide until one carries a weekday ("Sun 18:40"), then 66 px.
  const timeWidth = shown.some((e) => e.at.length > 5) ? 'w-[66px]' : 'w-10'
  return (
    <section
      aria-labelledby="did"
      className={`flex flex-col leading-[normal] gap-2.5 border border-line bg-card p-4 ${parent ? 'rounded-20' : 'rounded-18'}`}
    >
      <div className={`flex justify-between ${parent ? 'items-center' : 'items-baseline'}`}>
        <h2 id="did" className={`m-0 font-semibold ${parent ? 'text-[17px]' : 'text-[16px]'}`}>
          What Jemma did
        </h2>
        {seeAllHref ? (
          <Link
            href={seeAllHref}
            className="flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-[3px]"
          >
            See all
          </Link>
        ) : null}
      </div>
      <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
        {shown.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-3 text-[14px] leading-[1.4]">
            <span className={`${timeWidth} flex-none text-body tabular-nums`}>{e.at}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
