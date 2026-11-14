import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionPage } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { newestSnap } from './paper'
import { SessionFlow } from './SessionFlow'

export const metadata: Metadata = { title: "Tonight's lesson" }
export const dynamic = 'force-dynamic'

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const page = await getSessionPage(sessionId)
  // A finished session goes home, except one whose answers came from a photo: the child may be waiting on this very screen for its results.
  if (page.status === 'done' && !(await newestSnap(createSupabaseAdmin(), sessionId))) redirect('/k')
  return <SessionFlow sessionId={sessionId} firstName={page.firstName} warmup={page.warmup} tryCount={page.tryCount} topic={page.topic} />
}
