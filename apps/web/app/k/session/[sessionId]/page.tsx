import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionPage } from '@/lib/data/p27'
import { SessionFlow } from './SessionFlow'

export const metadata: Metadata = { title: "Tonight's lesson" }
export const dynamic = 'force-dynamic'

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const page = await getSessionPage(sessionId)
  if (page.status === 'done') redirect('/k')
  return <SessionFlow sessionId={sessionId} firstName={page.firstName} warmup={page.warmup} tryCount={page.tryCount} topic={page.topic} />
}
