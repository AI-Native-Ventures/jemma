import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isIndependent, isOwnRecord } from '@jemma/profiling/own-names'
import { myChild } from '@/lib/data/p27'
import { Back, Shell, Title } from '../Screens'
import { GRADE_CHOICES } from '../format'
import { CurriculumUpload } from './CurriculumUpload'

export const metadata: Metadata = { title: 'Your own curriculum' }
export const dynamic = 'force-dynamic'

/** The upload screen of an own curriculum. Only in My own: a learner in My school is sent to "Add your own work", which says to switch. */
export default async function OwnCurriculumPage() {
  const { child } = await myChild()
  if (!isOwnRecord(child)) redirect('/k/own')
  // The school grade is chosen first (a learner in Grade R has no map of their own to start from: Grade 1 is).
  const grade = GRADE_CHOICES.includes(child.grade) ? child.grade : 1
  return (
    <Shell firstName={child.first_name}>
      <Back href="/k/own">Add your own work</Back>
      <Title>Your own curriculum</Title>
      <p className="m-0 text-[17px] leading-[1.45] text-body">Add a PDF, or take photos of the pages. Jemma turns it into topics you check.</p>
      <CurriculumUpload defaultGrade={grade} alone={isIndependent(child)} />
    </Shell>
  )
}
