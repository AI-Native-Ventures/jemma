import { requireRole } from '@/lib/auth'
import { getOnboarding } from '@/lib/data/p21'
import { BackHeader, Column, Title } from '../_p21'
import { OnboardingForm } from './OnboardingForm'

export const dynamic = 'force-dynamic'

export default async function TeacherOnboardingPage() {
  await requireRole('teacher')
  const { name, school } = await getOnboarding()
  return (
    <div className="min-h-dvh bg-ground">
      <Column>
        <BackHeader href="/role" label="Back to roles" sub="Step 1 of 2" title="About you" />
        <main className="flex flex-1 flex-col gap-[18px] px-5 pt-3 pb-7">
          <div className="flex flex-col gap-2">
            <Title>Welcome, {name}. Where and what do you teach?</Title>
          </div>
          <OnboardingForm initial={school} />
        </main>
      </Column>
    </div>
  )
}
