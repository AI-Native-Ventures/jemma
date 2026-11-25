import Link from 'next/link'

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(22,22,22,0.06)]'
const big = 'flex min-h-[68px] w-full items-center justify-center gap-3 rounded-20 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink no-underline'

/**
 * P163: the first card a learner new to Jemma sees in their own space: the level check. 12 questions find where to start, so the first lessons are
 * about the right things. `started` is how many questions are already answered: the card then says so and goes on where the learner stopped.
 */
export function LevelCard({ started = 0, of = 12 }: { started?: number; of?: number }) {
  return (
    <section aria-labelledby="level-card" className={`${card} gap-3`}>
      <span className="text-[14px] font-semibold text-red-text">{started > 0 ? `${started} of ${of} done` : 'New here?'}</span>
      <h2 id="level-card" className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">
        Find your level
      </h2>
      <p className="m-0 text-[16px] leading-[1.45] text-body">{of} questions, about 10 minutes. No marks. Jemma finds where to start.</p>
      <Link href="/k/level" className={big}>
        {started > 0 ? 'Carry on' : 'Find my level'}
      </Link>
    </section>
  )
}
