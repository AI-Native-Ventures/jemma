import type { JemmaDb } from '@jemma/profiling/db'
import { describeJob, type PaperCounts } from './status'

const PAPER_EVENTS = new Set(['paper.snapped', 'paper.checked'])

export type RunningJob = {
  eventId: string
  label: string
  done?: number
  total?: number
  className?: string
  snappedAt: string
}

const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

type PaperInfo = { counts: PaperCounts | null; className?: string; childName?: string }

/** The paper an event is about: how many papers of its test are read, the class, and the learner. */
async function paperInfo(db: JemmaDb, payload: unknown): Promise<PaperInfo> {
  const paperId = (payload as { paperId?: unknown } | null)?.paperId
  if (typeof paperId !== 'string') return { counts: null }
  const { data: paper } = await db.from('papers').select('test_id, child_id').eq('id', paperId).maybeSingle()
  if (!paper) return { counts: null }
  const childName = paper.child_id ? (await db.from('children').select('first_name').eq('id', paper.child_id).maybeSingle()).data?.first_name : undefined
  if (!paper.test_id) return { counts: null, childName }
  const [{ data: papers }, { data: test }] = await Promise.all([
    db.from('papers').select('status').eq('test_id', paper.test_id),
    db.from('tests').select('class_id').eq('id', paper.test_id).maybeSingle(),
  ])
  const className = test ? (await db.from('classes').select('name').eq('id', test.class_id).maybeSingle()).data?.name : undefined
  const done = (papers ?? []).filter((p) => p.status === 'marked' || p.status === 'needs_you' || p.status === 'failed').length
  return { counts: papers?.length ? { done, total: papers.length } : null, className, childName }
}

/** The event this user's runner has claimed and is working on. Reads under the user's own access. */
export async function runningJob(db: JemmaDb, userId: string): Promise<RunningJob | null> {
  const { data } = await db
    .from('events')
    .select('id, type, payload, created_at')
    .eq('status', 'running')
    .eq('claimed_by', userId)
    .order('created_at', { ascending: false })
    .limit(1)
  const event = data?.[0]
  if (!event) return null
  const info = PAPER_EVENTS.has(event.type) ? await paperInfo(db, event.payload) : { counts: null }
  return {
    eventId: event.id,
    label: describeJob(event.type, info.counts),
    done: info.counts?.done,
    total: info.counts && info.counts.total > 1 ? info.counts.total : undefined,
    className: info.className,
    snappedAt: clock(event.created_at),
  }
}

export type StoppedJob = {
  eventId: string
  /** "reading Sipho's paper" */
  what: string
  /** "Sipho's paper" */
  waits: string
  cloudFor: string
  reason: string
  why: string
  /** Epoch ms the limit lifts, when the agent said. */
  retryAt: number | null
}

const LIMIT = /usage limit|limit reached|rate limit|out of (credits|usage)/i

/** When a usage limit lifts: a unix time after "limit reached|", or a clock time such as "5pm" or "17:00". */
export function parseRetryAt(note: string, now = new Date()): number | null {
  const epoch = /limit reached\|(\d{10})/i.exec(note)
  if (epoch) return Number(epoch[1]) * 1000
  const clockTime = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(note) ?? /\b([01]?\d|2[0-3]):([0-5]\d)\b()/.exec(note)
  if (!clockTime) return null
  let hour = Number(clockTime[1])
  const minute = Number(clockTime[2] ?? 0)
  const meridiem = clockTime[3]?.toLowerCase()
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  const at = new Date(now)
  at.setHours(hour, minute, 0, 0)
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
  return at.getTime()
}

/** The newest failed event of this user from the last day, if the agent stopped on a usage limit. */
export async function stoppedJob(db: JemmaDb, userId: string, agentName: string, now = new Date()): Promise<StoppedJob | null> {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data } = await db
    .from('events')
    .select('id, type, payload, error, finished_at')
    .eq('status', 'failed')
    .eq('claimed_by', userId)
    .eq('runner', 'desktop')
    .gte('finished_at', since)
    .order('finished_at', { ascending: false })
    .limit(1)
  const event = data?.[0]
  if (!event?.error || !LIMIT.test(event.error)) return null
  const info = PAPER_EVENTS.has(event.type) || event.type === 'homework.snapped' ? await paperInfo(db, event.payload) : { counts: null }
  const paper = info.childName ? `${info.childName}'s paper` : 'the paper'
  const isPaper = event.type.includes('paper') || event.type === 'homework.snapped'
  return {
    eventId: event.id,
    what: isPaper ? `reading ${paper}` : 'the job',
    waits: isPaper ? paper.charAt(0).toUpperCase() + paper.slice(1) : 'The job',
    cloudFor: isPaper ? 'this paper only' : 'this job only',
    reason: `${agentName} hit its usage limit`,
    why: 'usage limit reached',
    retryAt: parseRetryAt(event.error, now),
  }
}

/** The last few things Jemma did today for this user's school, newest first: the "Earlier today" lines. */
export async function todayHistory(db: JemmaDb, now = new Date()): Promise<{ time: string; text: string }[]> {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const { data } = await db.from('activity_log').select('at, text').gte('at', start.toISOString()).order('at', { ascending: false }).limit(3)
  return (data ?? []).map((r) => ({ time: clock(r.at), text: r.text }))
}
