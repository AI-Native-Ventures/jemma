import { getRegisterView } from '@/lib/data/p19'
import { BackHeader, Page } from '../learners/_parts'
import { RegisterForm } from './RegisterForm'

export default async function RegisterPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const v = await getRegisterView(classId)
  return (
    <Page>
      <BackHeader href={`/t/${classId}/learners`} kicker={`${v.className} · ${v.dateLabel}`} title="Today's register" />
      <RegisterForm classId={classId} day={v.day} rows={v.learners} />
    </Page>
  )
}
