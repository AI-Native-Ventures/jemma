import type { JemmaDb } from '@jemma/profiling/db'

/**
 * Where a practice answered on paper stands, as the learner's screen needs it. `none`: no photo was sent. `reading`: a photo was sent and Jemma
 * is reading it. `failed`: Jemma could not read it, and the learner chooses what to do. `done`: it was read and the session is closed.
 */
export type PaperProgress = 'none' | 'reading' | 'failed' | 'done'

export type SnapEvent = { id: string; status: string }

/**
 * The newest `practice.snapped` event of one session, or null. Read with the service client by this session's id only (a learner's own session
 * cannot read `events`), and only after the session was proven the learner's. A read that fails answers null, so the screen never waits on it.
 */
export async function newestSnap(admin: JemmaDb, sessionId: string): Promise<SnapEvent | null> {
  try {
    const { data } = await admin
      .from('events')
      .select('id, status')
      .eq('type', 'practice.snapped')
      .eq('payload->>sessionId', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
    return data?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * The progress of a paper answer from two facts and nothing else (so it is tested without a database): the session's status and the status of
 * its newest `practice.snapped` event. A session closed after a photo was sent is `done` whatever the event says (the plan after the read may
 * still be running, or may have failed: the answers are in). An event that ended without closing the session is `failed`.
 */
export function progressOf(session: { status: string }, snap: SnapEvent | null): PaperProgress {
  if (!snap) return 'none'
  if (session.status === 'done') return 'done'
  if (snap.status === 'queued' || snap.status === 'running') return 'reading'
  return 'failed'
}
