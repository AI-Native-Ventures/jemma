import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getCopyOptions, getOnboarding, newJoinCode } from '@/lib/data/p21'
import { BackHeader, Column, Title } from '../../t/_p21'
import { NewClassForm } from '../../t/new/NewClassForm'

export const metadata: Metadata = { title: 'Create your first class' }
export const dynamic = 'force-dynamic'

/**
 * Where "Start from an empty school" lands. The class form is the one every teacher uses (any grade, any subject, learners now or
 * later), with a plainer heading because the school has no class yet. The made-up learners come from the class's own learners screen.
 */
export default async function FirstClassPage() {
  await requireRole('teacher')
  const { school, schoolId } = await getOnboarding()
  if (!school || !schoolId) redirect('/t/onboarding')
  const copyOptions = await getCopyOptions(schoolId)
  // A school that already has a class goes to its classes. This page is only for the first one.
  if (copyOptions.length > 0) redirect('/t')
  return (
    <div className="min-h-dvh bg-ground">
      <Column>
        <BackHeader href="/demo" label="Back to the demo page" sub="Your empty school" title="First class" />
        <main className="flex flex-1 flex-col gap-[18px] px-5 pt-3 pb-7">
          <div className="flex flex-col gap-2">
            <Title>Create your first class</Title>
            <p className="m-0 ml-6 text-[15px] leading-[1.45] text-pretty text-body">
              Pick any grade and subject. Then open the learners screen and tap Add made-up learners to fill it with a few years of history.
            </p>
          </div>
          <NewClassForm code={newJoinCode()} initialGrade={9} initialSubject="Natural Sciences" initialOther="" copyOptions={copyOptions} />
        </main>
      </Column>
    </div>
  )
}
