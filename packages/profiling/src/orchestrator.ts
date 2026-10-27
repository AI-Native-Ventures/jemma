import type { AiEnv } from './ai'
import type { JemmaDb } from './db'
import { notify, notifyLessonReady } from './notify'
import { jobPlan, postconditions, type JobName, type JobStep } from './plans'
import { EventSchema, type JemmaEvent } from './schemas/events'
import { maybe, ok, type ToolContext } from './tools/context'
import { planNextSession } from './tools/save/plan-next-session'
import { updateLearnerProfile } from './tools/save/update-learner-profile'

/** A cloud job: calls the read tools, asks the model, saves through the save tool. */
export type CloudJob = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => Promise<void>
export type CloudJobs = Partial<Record<JobName, CloudJob>>

export type RunDeps = {
  db: JemmaDb
  env: AiEnv
  /** The registered cloud job functions. The plain-code steps (plan_next_session, update_learner_profile) are built in. */
  jobs: CloudJobs
  /** False while the queue will still redeliver: a rate limit that outlasts the retries then re-queues instead of failing. Default true. */
  final?: boolean
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
}

export type RunResult = { status: 'done' | 'failed' | 'cancelled' }

/** Thrown when the queue should deliver the event again; the event has been put back to queued. */
export class RetryLater extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryLater'
  }
}

class Stopped extends Error {}

/** Waits before retries 1, 2 and 3 of a job that hit a rate limit or a timeout. */
export const BACKOFF_MS = [1000, 4000, 10_000]
/** Steps that make up a test's tail (after its papers are read). One run at a time does them. */
const TAIL_JOBS = new Set<JobName>(['diagnose', 'class_report', 'plan_next_session', 'write_lesson', 'guidance'])
const MAX_STEPS = 60
/** Polls (2 s apart) a run waits for sibling events of its school before it plans again. */
const MAX_SIBLING_WAITS = 300
export const DESKTOP_TIMEOUT_MS = 10 * 60 * 1000

const text = (err: unknown) => (err instanceof Error ? err.message : String(err))

function isTransient(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; name?: string; message?: string } | null
  const code = e?.statusCode ?? e?.status
  if (code === 429 || code === 408 || code === 504) return true
  return /\b429\b|rate.?limit|too many requests|timed? ?out|timeout|ETIMEDOUT/i.test(`${e?.name ?? ''} ${e?.message ?? ''}`)
}

function isBadOutput(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  return /NoObjectGenerated|TypeValidation|ZodError|JSONParse/i.test(e?.name ?? '') || /did not match schema|No object generated/i.test(e?.message ?? '')
}

const codeJobs: Partial<Record<JobName, CloudJob>> = {
  async plan_next_session(ctx, _eventId, ids) {
    await planNextSession.run(ctx, { childId: ids.childId! })
  },
  async update_learner_profile(ctx, _eventId, ids) {
    await updateLearnerProfile.run(ctx, { childId: ids.childId!, sessionId: ids.sessionId })
  },
}

/** True when the child's planned session has a written lesson (the placeholder from planning has no questions). */
async function lessonSaved(db: JemmaDb, childId: string): Promise<boolean> {
  const sessions = await ok(db.from('sessions').select('lesson_id').eq('child_id', childId).eq('status', 'planned').order('planned_for').limit(1))
  const lessonId = sessions[0]?.lesson_id
  if (!lessonId) return false
  const lesson = await ok(db.from('lessons').select('content').eq('id', lessonId).single())
  const questions = (lesson.content as { questions?: unknown } | null)?.questions
  return Array.isArray(questions) && questions.length > 0
}

/** Where a Needs you item or a notification for this school's owner should lead. */
async function ownerOf(db: JemmaDb, schoolId: string): Promise<{ userId: string; href: string } | null> {
  const classes = await ok(db.from('classes').select('id, teacher_id').eq('school_id', schoolId).order('created_at').limit(1))
  if (classes[0]) return { userId: classes[0].teacher_id, href: `/t/${classes[0].id}` }
  const teacher = await ok(db.from('profiles').select('user_id').eq('school_id', schoolId).eq('role', 'teacher').limit(1))
  if (teacher[0]) return { userId: teacher[0].user_id, href: '/' }
  const parent = await ok(db.from('profiles').select('user_id').eq('school_id', schoolId).eq('role', 'parent').limit(1))
  return parent[0] ? { userId: parent[0].user_id, href: '/' } : null
}

/**
 * Runs one event in the cloud: walks `jobPlan` with the registered jobs, re-planning after every job,
 * checks `postconditions`, records progress in `events.payload.progress` and `events.attempts`.
 * Before each job (and each retry) it re-reads `events.status`; cancelled or a missing school stops it before any write.
 * A rate limit or timeout retries 3 times (1 s, 4 s, 10 s); output that fails zod retries once.
 */
export async function runEvent(eventId: string, deps: RunDeps): Promise<RunResult> {
  const { db } = deps
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => new Date())
  const startedAt = now().toISOString()

  const row = await maybe(db.from('events').select('id, school_id, type, payload, status').eq('id', eventId).maybeSingle())
  if (!row) return { status: 'cancelled' }
  if (row.status === 'done' || row.status === 'failed' || row.status === 'cancelled') return { status: row.status }
  if (row.status === 'queued') {
    const claim = await ok(db.from('events').update({ status: 'running' }).eq('id', eventId).eq('status', 'queued').select('id'))
    if (claim.length === 0) return { status: 'cancelled' } // someone else has it, or it was cancelled
  }

  const ctx: ToolContext = { db, schoolId: row.school_id, eventId, env: deps.env, now }
  const payload = (row.payload ?? {}) as Record<string, unknown>
  let attempts = 0
  const told = new Set<string>()
  let tailLock: string | null = null

  const guard = async () => {
    const [ev, school] = await Promise.all([
      maybe(db.from('events').select('status').eq('id', eventId).maybeSingle()),
      maybe(db.from('schools').select('id').eq('id', row.school_id).maybeSingle()),
    ])
    if (!ev || ev.status === 'cancelled' || !school) throw new Stopped()
  }
  const fail = async (error: string): Promise<RunResult> => {
    await db.from('events').update({ status: 'failed', error, attempts, finished_at: now().toISOString() }).eq('id', eventId).neq('status', 'cancelled')
    return { status: 'failed' }
  }
  // Tell the owner about Needs you items the job just created.
  const announce = async () => {
    const items = await ok(
      db.from('needs_you_items').select('id, owner_id, title, detail').eq('school_id', row.school_id).eq('status', 'open').gte('created_at', startedAt),
    )
    for (const item of items.filter((i) => !told.has(i.id))) {
      told.add(item.id)
      await notify(db, [item.owner_id], { title: item.title, body: item.detail || 'Jemma needs you.', href: (await ownerOf(db, row.school_id))?.href ?? '/' })
    }
  }

  /**
   * The papers of a test are read at the same time, and the last two can both find the test ready for its tail.
   * One run takes a lock (an atomic insert, the table's key is its primary key) and does the tail; the other leaves it to that run.
   */
  const takeTail = async (parsed: JemmaEvent): Promise<boolean> => {
    if (tailLock) return true
    if (parsed.type !== 'paper.snapped' && parsed.type !== 'paper.checked') return true
    const paper = await maybe(db.from('papers').select('test_id').eq('id', parsed.paperId).maybeSingle())
    if (!paper?.test_id) return true
    const key = `lock:tail:${paper.test_id}`
    for (let tries = 0; tries < 2; tries++) {
      const ins = await db.from('ai_replays').insert({ key, model: 'lock', response: { eventId } as never })
      if (!ins.error) {
        tailLock = key
        return true
      }
      // A lock left by a run that is no longer running is taken over.
      const held = await maybe(db.from('ai_replays').select('response').eq('key', key).maybeSingle())
      const owner = (held?.response as { eventId?: string } | null)?.eventId
      const ownerRow = owner ? await maybe(db.from('events').select('status').eq('id', owner).maybeSingle()) : null
      if (ownerRow?.status === 'running' && owner !== eventId) return false
      await db.from('ai_replays').delete().eq('key', key)
    }
    return false
  }
  const releaseTail = async () => {
    if (tailLock) await db.from('ai_replays').delete().eq('key', tailLock)
    tailLock = null
  }

  const runStep = async (step: JobStep) => {
    const run = deps.jobs[step.job] ?? codeJobs[step.job]
    if (!run) throw new Error(`job not available: ${step.job}`)
    let transient = 0
    let badOutput = 0
    for (let attempt = 1; ; attempt++) {
      await guard()
      attempts = Math.max(attempts, attempt)
      try {
        await run(ctx, eventId, step.ids)
        return
      } catch (err) {
        if (isTransient(err) && transient < BACKOFF_MS.length) await sleep(BACKOFF_MS[transient++]!)
        else if (isBadOutput(err) && badOutput < 1) badOutput++
        else throw err
      }
    }
  }

  try {
    const parsed = EventSchema.parse({ ...payload, type: row.type })
    const done = new Set<string>()
    const walk = async () => {
      for (let i = 0; i < MAX_STEPS; i++) {
        await guard()
        const plan = await jobPlan(parsed, db)
        const step = plan.find((s) => !done.has(`${s.job}:${JSON.stringify(s.ids)}`))
        if (!step) break
        await db.from('events').update({ attempts, payload: { ...payload, progress: { job: step.job, step: i + 1, done: [...done].length } } as never }).eq('id', eventId)
        if (TAIL_JOBS.has(step.job) && !(await takeTail(parsed))) break // another run does this test's tail
        await runStep(step)
        await guard() // cancelled during the job: stop before recording anything more
        done.add(`${step.job}:${JSON.stringify(step.ids)}`)
        if (step.job === 'write_lesson' && step.ids.childId && (await lessonSaved(db, step.ids.childId))) await notifyLessonReady(db, step.ids.childId)
        await announce()
      }
    }
    await walk()
    let unmet = await postconditions(parsed, db)
    // The papers of a test are read at the same time. This event can finish before a sibling marks its paper, so the
    // sibling's run owns the tail: wait for it while it runs, and plan again if nothing is left running and something is unmet.
    for (let waited = 0; unmet.length && waited < MAX_SIBLING_WAITS; waited++) {
      const others = await ok(db.from('events').select('id').eq('school_id', row.school_id).eq('status', 'running').neq('id', eventId))
      if (others.length === 0) break
      await sleep(2000)
      await guard()
      unmet = await postconditions(parsed, db)
    }
    if (unmet.length) {
      await walk()
      unmet = await postconditions(parsed, db)
    }
    if (unmet.length) return await fail(`Jemma did not finish: ${unmet.join('; ')}`)
    await db
      .from('events')
      .update({ status: 'done', error: null, attempts, payload: { ...payload, progress: { job: null, step: done.size, done: done.size } } as never, finished_at: now().toISOString() })
      .eq('id', eventId)
      .neq('status', 'cancelled')
    return { status: 'done' }
  } catch (err) {
    if (err instanceof Stopped) return { status: 'cancelled' }
    if (deps.final === false && isTransient(err)) {
      await db.from('events').update({ status: 'queued', attempts }).eq('id', eventId).eq('status', 'running')
      throw new RetryLater(text(err))
    }
    return await fail(text(err))
  } finally {
    await releaseTail()
  }
}

/**
 * Desktop timeout. A queued `runner = 'desktop'` event older than 10 minutes, whose owner sent no runner heartbeat
 * in the last 10 minutes, gets one open "Jemma Desktop is off" Needs you item per school and a notification for the owner.
 * The item reuses kind `confirm_scan` (the enum has no desktop value) with `ref_id` = the oldest waiting event.
 */
export async function checkDesktopTimeouts(db: JemmaDb, now: Date = new Date(), ttlMs = DESKTOP_TIMEOUT_MS): Promise<number> {
  const cutoff = new Date(now.getTime() - ttlMs).toISOString()
  const waiting = await ok(
    db.from('events').select('id, school_id, created_at').eq('status', 'queued').eq('runner', 'desktop').lte('created_at', cutoff).order('created_at'),
  )
  const bySchool = new Map<string, typeof waiting>()
  for (const e of waiting) bySchool.set(e.school_id, [...(bySchool.get(e.school_id) ?? []), e])
  let created = 0
  for (const [schoolId, events] of bySchool) {
    const owner = await ownerOf(db, schoolId)
    if (!owner) continue
    const beat = await ok(db.from('runner_presence').select('runner_id').eq('user_id', owner.userId).gte('last_seen', cutoff).limit(1))
    if (beat.length) continue
    const open = await ok(
      db.from('needs_you_items').select('id').eq('owner_id', owner.userId).eq('school_id', schoolId).eq('status', 'open').eq('kind', 'desktop_off').limit(1),
    )
    if (open.length) continue
    const n = events.length
    await ok(
      db
        .from('needs_you_items')
        .insert({
          owner_id: owner.userId,
          school_id: schoolId,
          kind: 'desktop_off',
          ref_id: events[0]!.id,
          status: 'open',
          title: DESKTOP_OFF_TITLE,
          detail: `${n} ${n === 1 ? 'job is' : 'jobs are'} waiting. Open Jemma Desktop, or run in the cloud this time.`,
        })
        .select('id'),
    )
    await notify(db, [owner.userId], { title: DESKTOP_OFF_TITLE, body: `${n} ${n === 1 ? 'job is' : 'jobs are'} waiting.`, href: owner.href })
    created++
  }
  return created
}

export const DESKTOP_OFF_TITLE = 'Jemma Desktop is off'

/**
 * "Run in the cloud this time": a server function for the web app. Moves a waiting desktop event to the cloud runner,
 * queues it through `enqueue` and closes the "Jemma Desktop is off" item. Only touches events of `schoolId`.
 */
export async function runInCloud(
  db: JemmaDb,
  schoolId: string,
  enqueue: (eventId: string) => Promise<void>,
): Promise<{ queued: number }> {
  const moved = await ok(
    db.from('events').update({ runner: 'cloud', claimed_by: null }).eq('school_id', schoolId).eq('runner', 'desktop').eq('status', 'queued').select('id'),
  )
  await ok(db.from('needs_you_items').update({ status: 'done' }).eq('school_id', schoolId).eq('kind', 'desktop_off').eq('status', 'open').select('id'))
  for (const e of moved) await enqueue(e.id)
  return { queued: moved.length }
}
