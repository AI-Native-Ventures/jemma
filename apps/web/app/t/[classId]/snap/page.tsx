import { getClassTests, getClassTopics, longDate } from '@/lib/data/p31'
import { SnapTestForm } from './SnapTestForm'

/** Board `teacher-snap-test`: which test are we marking? */
export default async function SnapPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const [topics, tests] = await Promise.all([getClassTopics(classId), getClassTests(classId)])
  const defaultTitle = tests.length === 0 ? 'Class Test 1: Fractions and decimals' : ''
  return (
    <SnapTestForm
      classId={classId}
      topics={topics}
      tests={tests}
      defaultTitle={defaultTitle}
      defaultDate={longDate(new Date())}
    />
  )
}
