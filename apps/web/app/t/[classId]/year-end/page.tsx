import { getClassInfo, shortName } from '@/lib/data/p21'
import { BackHeader, Column, Title } from '../../_p21'
import { YearEnd } from './YearEnd'

export const dynamic = 'force-dynamic'

export default async function TeacherYearEndPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const cls = await getClassInfo(classId)
  const short = shortName(cls.name)
  return (
    <Column bare>
      <BackHeader href={`/t/${classId}/settings`} label="Back to class settings" sub={cls.name} title="End of the year" />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-7">
        <Title>The year ends after Term 4. What should happen to {short}?</Title>
        <YearEnd short={short} grade={cls.grade} nextGrade={cls.grade + 1} csvHref={`/t/${classId}/year-end/marks.csv`} />
        <div className="flex-1" />
      </main>
    </Column>
  )
}
