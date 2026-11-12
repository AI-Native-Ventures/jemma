import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getCopyOptions, getOnboarding, newJoinCode } from '@/lib/data/p21'
import { validateGrade } from '@/lib/subjects'
import { BackHeader, Column, Title } from '../_p21'
import { NewClassForm } from './NewClassForm'

export const dynamic = 'force-dynamic'

export default async function TeacherNewClassPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  await requireRole('teacher')
  const { school, schoolId } = await getOnboarding()
  if (!school || !schoolId) redirect('/t/onboarding')
  const query = await searchParams
  const grade = validateGrade(Number(query.grade))
  const copyOptions = await getCopyOptions(schoolId)
  return (
    <div className="min-h-dvh bg-ground">
      <Column>
        <BackHeader href="/t" label="Back to your classes" sub="Your classes" title="New class" />
        <main className="flex flex-1 flex-col gap-[18px] px-5 pt-3 pb-7">
          <div className="flex flex-col gap-2">
            <Title>Set up a class. Only the name is needed now.</Title>
            <p className="m-0 ml-6 text-[15px] leading-[1.45] text-pretty text-body">Add learners now or later. Jemma starts marking once you snap a test.</p>
          </div>
          <NewClassForm code={newJoinCode()} initialGrade={grade.ok ? grade.grade : 6} copyOptions={copyOptions} />
        </main>
      </Column>
    </div>
  )
}
