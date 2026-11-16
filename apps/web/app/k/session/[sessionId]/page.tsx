import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionPage } from '@/lib/data/p27'
import { sessionLibrary } from '@/lib/data/teaching'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { newestSnap } from './paper'
import { SessionFlow } from './SessionFlow'

export const metadata: Metadata = { title: "Tonight's lesson" }
export const dynamic = 'force-dynamic'

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  // P144: a topic that has lessons in the teaching library opens its Learn step as "Learn it first" (asked beside the page's own read, so the page is not slower).
  const [page, library] = await Promise.all([getSessionPage(sessionId), sessionLibrary(sessionId)])
  // A finished session goes home, except one whose answers came from a photo: the child may be waiting on this very screen for its results.
  if (page.status === 'done' && !(await newestSnap(createSupabaseAdmin(), sessionId))) redirect('/k')
  // No lessons, or a read that fails: the Learn step as it always was.
  return (
    <SessionFlow
      sessionId={sessionId}
      firstName={page.firstName}
      warmup={page.warmup}
      tryCount={page.tryCount}
      topic={page.topic}
      {...(library.topicId ? { library: library.entries, libraryTopicId: library.topicId } : {})}
    />
  )
}
