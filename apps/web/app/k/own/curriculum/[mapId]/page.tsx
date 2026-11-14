import { isOwnRecord } from '@jemma/profiling/own-names'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getOwnCurriculumView } from '@/lib/data/own-uploads'
import { myChild } from '@/lib/data/p27'
import { CurriculumScreen } from '../../CurriculumScreens'

export const metadata: Metadata = { title: 'Your own curriculum' }
export const dynamic = 'force-dynamic'

/**
 * One own curriculum of the learner: Jemma reading it, the draft to check, "Done", or the retry. Only a map of the twin's own is shown (another
 * learner's map, or a class test's, is "not found"), and only in My own.
 */
export default async function OwnCurriculumMapPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params
  const { child } = await myChild()
  if (!isOwnRecord(child)) redirect('/k/own')
  const view = await getOwnCurriculumView(child.id, mapId)
  if (!view) notFound()
  return <CurriculumScreen view={view} firstName={child.first_name} />
}
