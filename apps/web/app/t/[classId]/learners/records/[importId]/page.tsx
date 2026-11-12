import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getReview } from '@/lib/data/p66'
import { BackHeader } from '../../../tests/back-header'
import { ReviewClient } from './ReviewClient'

/**
 * The check screen of one file of past records: what Jemma understood, the rows with a problem first, a sample of the good rows,
 * and the gate. "Add to records" is the teacher saying yes to this file. Until then nothing is added to any learner.
 */
export default async function CheckPastRecordsPage({ params }: { params: Promise<{ classId: string; importId: string }> }) {
  const { classId, importId } = await params
  await requireRole('teacher')
  const view = await getReview(classId, importId)
  if (!view) notFound()
  return (
    <div className="leading-[normal] lg:max-w-[1100px]">
      <BackHeader href={`/t/${classId}/learners/records`} backLabel="Back to Add past records" eyebrow={view.className} title="Check past records" />
      <div className="flex flex-col gap-[18px] px-5 pt-2 pb-6 lg:px-8">
        <h1 className="sr-only">{`Check the past records in ${view.fileName}`}</h1>
        <ReviewClient view={view} />
      </div>
    </div>
  )
}
