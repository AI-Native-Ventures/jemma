import Link from 'next/link'
import { myMathsHref, type OwnCurriculumView } from './format'
import { Review } from './curriculum/Review'
import { Back, Ring, Shell, Title } from './Screens'
import { Poll } from './TestPieces'

// The screen of one own curriculum of a learner in My own (P97), drawn from its props alone (the server page reads the data, see
// lib/data/own-uploads.ts), in each of its states: Jemma reading it, a draft to check, done, or not readable.

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(22,22,22,0.06)]'
const linkButton = 'flex min-h-11 items-center justify-center text-[16px] font-semibold text-ink underline underline-offset-[3px]'
const bigLink = 'flex min-h-[68px] w-full items-center justify-center rounded-20 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink no-underline sm:text-[22px]'

export function CurriculumScreen({ view, firstName }: { view: OwnCurriculumView; firstName?: string }) {
  if (view.state === 'reading') {
    return (
      <Shell firstName={firstName}>
        <Poll active />
        <section role="status" aria-live="polite" aria-labelledby="own-curriculum-reading" className={`${card} items-center gap-3.5 text-center`}>
          <Ring />
          <h1 id="own-curriculum-reading" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma is reading your curriculum.</h1>
          <p className="m-0 text-[17px] leading-[1.45] text-body">A minute or two. You can wait here.</p>
        </section>
      </Shell>
    )
  }
  if (view.state === 'failed') {
    return (
      <Shell firstName={firstName}>
        <Poll active={false} />
        <section role="alert" aria-labelledby="own-curriculum-failed" className={`${card} gap-4`}>
          <h1 id="own-curriculum-failed" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma could not read this file.</h1>
          <Link href="/k/own/curriculum" className={bigLink}>Try another file</Link>
        </section>
        <Link href="/k/own" className={linkButton}>Back</Link>
      </Shell>
    )
  }
  if (view.state === 'approved') {
    return (
      <Shell firstName={firstName}>
        <Poll active={false} />
        <Title>Done. Find it in My maths.</Title>
        <p className="m-0 text-[17px] leading-[1.45] text-body">{`${view.name} · Grade ${view.grade}`}</p>
        <Link href={myMathsHref(view.classId)} className={bigLink}>Open My maths</Link>
        <Link href="/k/own" className={linkButton}>Back</Link>
      </Shell>
    )
  }
  return (
    <Shell firstName={firstName}>
      <Poll active={false} />
      <Back href="/k/own">Add your own work</Back>
      <Review review={view.review} />
    </Shell>
  )
}
