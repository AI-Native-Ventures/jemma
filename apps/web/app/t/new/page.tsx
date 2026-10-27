import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getOnboarding, newJoinCode } from '@/lib/data/p21'
import { BackHeader, Column, Title } from '../_p21'
import { NewClassForm } from './NewClassForm'

export const dynamic = 'force-dynamic'

export default async function TeacherNewClassPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  await requireRole('teacher')
  const { school } = await getOnboarding()
  if (!school) redirect('/t/onboarding')
  const grade = Number((await searchParams).grade)
  return (
    <div className="min-h-dvh bg-ground">
      <Column>
        <BackHeader href="/t" label="Back to your classes" sub="Your classes" title="New class" />
        <main className="flex flex-1 flex-col gap-[18px] px-5 pt-3 pb-7">
          <div className="flex flex-col gap-2">
            <Title>Set up a class. Only the name is needed now.</Title>
            <p className="m-0 ml-6 text-[15px] leading-[1.45] text-pretty text-body">Add learners now or later. Jemma starts marking once you snap a test.</p>
          </div>
          <NewClassForm code={newJoinCode()} initialGrade={[4, 5, 6, 7].includes(grade) ? grade : 6} />
        </main>
      </Column>
    </div>
  )
}
