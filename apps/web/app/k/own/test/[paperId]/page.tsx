import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getOwnTestView } from '@/lib/data/own-uploads'
import { myChild } from '@/lib/data/p27'
import { TestScreen } from '../../Screens'

export const metadata: Metadata = { title: 'Your marked test' }
export const dynamic = 'force-dynamic'

/**
 * One marked test of the learner's own: Jemma reading it, the result with each question, what to practise from it, or the retry. Only the twin's
 * own paper is shown (another learner's paper, or a class test, is "not found"), and only in My own.
 */
export default async function OwnTestPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params
  const { child } = await myChild()
  if (!child.private_of) redirect('/k/own')
  const view = await getOwnTestView(child.id, paperId)
  if (!view) notFound()
  return <TestScreen view={view} firstName={child.first_name} />
}
