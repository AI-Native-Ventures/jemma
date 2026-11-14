import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getGradeSheet } from '@/lib/data/own-screens'
import { AppHeader } from '../../session/_parts/AppHeader'
import { Diamond } from '../../session/_parts/Gems'
import { GradePicker } from './GradePicker'

export const metadata: Metadata = { title: 'Add a grade' }
export const dynamic = 'force-dynamic'

/**
 * "+ Another grade" of My own: the 12 grades as large chips. A grade ahead of the learner's own is fine to add. Tapping one loads that grade's map
 * and opens My maths at it. Only My own has grades to add: a learner who is in My school is sent back to My maths.
 */
export default async function AddGradePage() {
  const sheet = await getGradeSheet()
  if (!sheet) redirect('/k/maths')
  return (
    <div className="flex min-h-[calc(100dvh-84px)] flex-col font-sans leading-[normal] lg:min-h-dvh">
      <AppHeader firstName={sheet.firstName} />
      <main className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] lg:max-w-[560px]">
        <Link href="/k/maths" className="flex min-h-11 items-center text-[16px] font-semibold text-ink no-underline">
          <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>My maths
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <Diamond size={16} className="mt-3 flex-none" />
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">Add a grade</h1>
          </div>
          <p className="m-0 text-[17px] leading-[1.45] text-body">Pick a grade to practise. You can go ahead of your own grade.</p>
        </div>
        <GradePicker schoolGrade={sheet.schoolGrade} added={sheet.added} />
      </main>
    </div>
  )
}
