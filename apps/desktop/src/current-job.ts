import type { JemmaDb } from '@jemma/profiling/db'
import { describeJob, type PaperCounts } from './status'

const PAPER_EVENTS = new Set(['paper.snapped', 'paper.checked'])

/** The event this user's runner has claimed and is working on, as plain words. Reads under the user's own access. */
export async function currentJobLabel(db: JemmaDb, userId: string): Promise<string | null> {
  const { data: events } = await db
    .from('events')
    .select('type, payload')
    .eq('status', 'running')
    .eq('claimed_by', userId)
    .order('created_at', { ascending: false })
    .limit(1)
  const event = events?.[0]
  if (!event) return null
  return describeJob(event.type, PAPER_EVENTS.has(event.type) ? await paperCounts(db, event.payload) : null)
}

/** How many papers of the same test are read (marked, waiting on a check, or failed) out of all of them. */
async function paperCounts(db: JemmaDb, payload: unknown): Promise<PaperCounts | null> {
  const paperId = (payload as { paperId?: unknown } | null)?.paperId
  if (typeof paperId !== 'string') return null
  const { data: paper } = await db.from('papers').select('test_id').eq('id', paperId).maybeSingle()
  if (!paper?.test_id) return null
  const { data: papers } = await db.from('papers').select('status').eq('test_id', paper.test_id)
  if (!papers?.length) return null
  const done = papers.filter((p) => p.status === 'marked' || p.status === 'needs_you' || p.status === 'failed').length
  return { done, total: papers.length }
}
