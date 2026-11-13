import type { AiEnv } from './ai'
import { classIdFor, classIdOfRef } from './ai/subject-profile'
import { MemoryStore } from './ai/stores'
import type { JemmaDb } from './db'
import { notify, notifyLessonReady } from './notify'
import { jobPlan, postconditions, type JobName, type JobStep } from './plans'
import { EventSchema, type JemmaEvent } from './schemas/events'
import { maybe, ok, type ToolContext } from './tools/context'
import { endUnreadablePaper } from './tools/save/mark-paper'
import { planNextSession } from './tools/save/plan-next-session'
import { updateLearnerProfile } from './tools/save/update-learner-profile'

// Re-exported so a plain Node process (the operator runner) gets them without the tools barrel, which imports job prompts (.md files).
export { jobPlan, postconditions } from './plans'
export type { JobStep } from './plans'

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
  /**
   * Where model work goes. `cloud` (default): the worker's own AI_MODE, as always. `operator`: every job step first
   * runs with recorded answers only; on a miss the event goes to the owner's laptop when an operator is online
   * (`handed_off`), else the step runs with the worker's own AI_MODE.
   */
  route?: 'cloud' | 'operator'
  /** Routing tag of this stack (agent variable AI_ROUTE_TAG, default `default`). A hand-off carries it, and only an operator with the same tag sees the event. */
  routeTag?: string
}

export type RunResult = { status: 'done' | 'failed' | 'cancelled' | 'handed_off' }

/** Thrown when the queue should deliver the event again; the event has been put back to queued. */
export class RetryLater extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryLater'
  }
}

class Stopped extends Error {}
/** Thrown inside a job step when the event must go to an operator runner. */
class HandOff extends Error {}

/** Waits before retries 1, 2 and 3 of a job that hit a rate limit or a timeout. */
export const BACKOFF_MS = [1000, 4000, 10_000]
/** Steps that make up a test's tail (after its papers are read). One run at a time does them. */
const TAIL_JOBS = new Set<JobName>(['diagnose', 'class_report', 'plan_next_session', 'write_lesson', 'guidance'])
const MAX_STEPS = 60
/** Polls (2 s apart) a run waits for sibling events of its school before it plans again. */
const MAX_SIBLING_WAITS = 300
export const DESKTOP_TIMEOUT_MS = 10 * 60 * 1000
/** An operator runner counts as online when it was seen within this long (it beats every 30 s). */
export const OPERATOR_ONLINE_MS = 90_000
/** Jobs that are never handed to an operator: on a replay miss they go straight to the cloud model, even with an operator online. A curriculum PDF cannot be read through MCP. */
export const NO_HANDOFF_JOBS: ReadonlySet<string> = new Set(['draft_map'])
export const DEFAULT_ROUTE_TAG = 'default'

/**
 * A cloud invocation (a queue consumer) lives 15 minutes at most, so a job that has shown no sign of life for 16 minutes is dead.
 * The every-minute check (`checkStuckEvents`) then brings it back.
 */
export const STUCK_EVENT_MS = 16 * 60 * 1000
/** What the teacher reads on a job that died three times (its first run and two revivals). */
export const STUCK_EVENT_ERROR = 'Jemma stopped answering. Try again.'
/** A stuck event is put back on the queue this many times (`payload.revived`). After that it ends failed. */
export const MAX_REVIVALS = 2
/** Events one run of the check moves. */
const STUCK_PER_RUN = 20
/** Running events one run of the check reads. It reads more than it moves: the ones that show a sign of life are dropped. */
const STUCK_SCAN = 100

const text = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** A rate limit, a timeout (a model call that never answered ends as one) or an upstream hiccup: worth another try. */
export function isTransient(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; name?: string; message?: string } | null
  const code = e?.statusCode ?? e?.status
  if (code === 429 || code === 408 || code === 504) return true
  return /\b429\b|rate.?limit|too many requests|timed? ?out|timeout|ETIMEDOUT/i.test(`${e?.name ?? ''} ${e?.message ?? ''}`)
}

const REPLAY_MISS_TEXT = /Replay miss: [0-9a-f]{64}\b/

/**
 * True when `err` is a replay miss (`ReplayMissError`: a recorded answer is missing), however the AI SDK wrapped it:
 * by name, down the `cause` chain, in `errors` and `lastError` lists, or when only the message text survived.
 */
export function isReplayMiss(err: unknown): boolean {
  const seen = new Set<unknown>()
  const walk = (e: unknown, depth: number): boolean => {
    if (!e || typeof e !== 'object' || seen.has(e) || depth > 8) return false
    seen.add(e)
    const x = e as { name?: unknown; message?: unknown; cause?: unknown; errors?: unknown; lastError?: unknown }
    if (x.name === 'ReplayMissError') return true
    if (typeof x.message === 'string' && REPLAY_MISS_TEXT.test(x.message)) return true
    return walk(x.cause, depth + 1) || walk(x.lastError, depth + 1) || (Array.isArray(x.errors) && x.errors.some((c) => walk(c, depth + 1)))
  }
  return walk(err, 0)
}

/** True when an operator runner with this routing tag (the owner's laptop) has been seen in the last 90 seconds. */
export async function operatorOnline(db: JemmaDb, now: Date = new Date(), tag: string = DEFAULT_ROUTE_TAG): Promise<boolean> {
  const since = new Date(now.getTime() - OPERATOR_ONLINE_MS).toISOString()
  const rows = await ok(db.from('operator_presence').select('runner_id').eq('tag', tag).gte('last_seen', since).limit(1))
  return rows.length > 0
}

function isBadOutput(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  return /NoObjectGenerated|TypeValidation|ZodError|JSONParse/i.test(e?.name ?? '') || /did not match schema|No object generated/i.test(e?.message ?? '')
}

/** The plain-code steps. They need no model, so a service (the cloud, or an operator runner) runs them in process. */
export const codeJobs: Partial<Record<JobName, CloudJob>> = {
  async plan_next_session(ctx, _eventId, ids) {
    await planNextSession.run(ctx, { childId: ids.childId! })
  },
  async update_learner_profile(ctx, _eventId, ids) {
    await updateLearnerProfile.run(ctx, { childId: ids.childId!, sessionId: ids.sessionId })
  },
}

/** True when the child's planned session has a written lesson (the placeholder from planning has no questions). */
export async function lessonSaved(db: JemmaDb, childId: string): Promise<boolean> {
  const sessions = await ok(db.from('sessions').select('lesson_id').eq('child_id', childId).eq('status', 'planned').order('planned_for').limit(1))
  const lessonId = sessions[0]?.lesson_id
  if (!lessonId) return false
  const lesson = await ok(db.from('lessons').select('content').eq('id', lessonId).single())
  const questions = (lesson.content as { questions?: unknown } | null)?.questions
  return Array.isArray(questions) && questions.length > 0
}

/**
 * Tells the owner about Needs you items created since `since` that were not told yet (`told` remembers them).
 * Shared by the cloud run and the operator runner.
 */
export async function announceNeedsYou(db: JemmaDb, schoolId: string, since: string, told: Set<string>): Promise<void> {
  const items = await ok(db.from('needs_you_items').select('id, owner_id, title, detail, ref_id').eq('school_id', schoolId).eq('status', 'open').gte('created_at', since))
  for (const item of items.filter((i) => !told.has(i.id))) {
    told.add(item.id)
    await notify(db, [item.owner_id], { title: item.title, body: item.detail || 'Jemma needs you.', href: (await ownerOf(db, schoolId, await classIdOfRef(db, item.ref_id)))?.href ?? '/' })
  }
}

/**
 * What follows a finished job step: the parent hears when a lesson was saved, the owner hears about new Needs you items.
 * Shared by the cloud run and the operator runner, so both tell people the same things.
 */
export async function afterJob(db: JemmaDb, schoolId: string, step: JobStep, since: string, told: Set<string>): Promise<void> {
  if (step.job === 'write_lesson' && step.ids.childId && (await lessonSaved(db, step.ids.childId))) await notifyLessonReady(db, step.ids.childId)
  await announceNeedsYou(db, schoolId, since, told)
}

/**
 * Where a Needs you item or a notification for this school's owner should lead. With the class of the event (a class of this
 * school) it is that class and its teacher; without one, the oldest class of the school.
 */
export async function ownerOf(db: JemmaDb, schoolId: string, classId?: string | null): Promise<{ userId: string; href: string } | null> {
  if (classId) {
    const own = await ok(db.from('classes').select('id, teacher_id').eq('id', classId).eq('school_id', schoolId))
    if (own[0]) return { userId: own[0].teacher_id, href: `/t/${own[0].id}` }
  }
  const classes = await ok(db.from('classes').select('id, teacher_id').eq('school_id', schoolId).order('created_at').limit(1))
  if (classes[0]) return { userId: classes[0].teacher_id, href: `/t/${classes[0].id}` }
  const teacher = await ok(db.from('profiles').select('user_id').eq('school_id', schoolId).eq('role', 'teacher').limit(1))
  if (teacher[0]) return { userId: teacher[0].user_id, href: '/' }
  const parent = await ok(db.from('profiles').select('user_id').eq('school_id', schoolId).eq('role', 'parent').limit(1))
  return parent[0] ? { userId: parent[0].user_id, href: '/' } : null
}

/**
 * Writes an event as failed. This is the one place that does it: `runEvent` calls it when a job fails for good, and the
 * stuck-jobs check when a job died three times, so both ends look the same to every screen. A cancelled event stays cancelled.
 * With `only` the write also needs the event to still have that status (the check passes `running`, so it never overwrites a run
 * that finished). Answers the query, so a caller can look at the error and at the event it ended (no row: it was not ended), and
 * then call `afterEventFailed` with it.
 */
export function endEventFailed(db: JemmaDb, eventId: string, error: string, attempts: number, finishedAt: string, only?: 'running') {
  const write = db.from('events').update({ status: 'failed', error, attempts, finished_at: finishedAt }).eq('id', eventId)
  return (only ? write.eq('status', only) : write.neq('status', 'cancelled')).select('id, school_id, type, payload')
}

/** The event types whose job reads a photo of one paper. */
const PAPER_PHOTO_EVENTS = new Set(['paper.snapped', 'homework.snapped'])

/**
 * An event ended failed for good: when it is the read of a paper's photo (`paper.snapped`, `homework.snapped`) and the paper is
 * still `queued` or `reading`, the paper ends the way `mark_paper` ends a page that is not usable (`endUnreadablePaper`): a teacher's
 * paper becomes `needs_you` with a Needs you item that asks for a retake or a check by hand, a parent's paper becomes `failed`.
 * A paper that is already `marked`, `needs_you` or `failed` is never touched, and no other event type does anything. Every place that
 * ends an event failed for good calls it after `endEventFailed` changed a row: `runEvent`, `checkStuckEvents` and the agent's `failEvent`.
 * Never throws: a failure is logged as one line and the event's own end stays as written.
 */
export async function afterEventFailed(
  db: JemmaDb,
  event: { id: string; school_id: string; type: string; payload: unknown },
  now: () => Date = () => new Date(),
): Promise<void> {
  if (!PAPER_PHOTO_EVENTS.has(event.type)) return
  try {
    const paperId = (event.payload as { paperId?: unknown } | null)?.paperId
    if (typeof paperId !== 'string') return
    const paper = await maybe(db.from('papers').select('id, test_id, child_id, status').eq('id', paperId).maybeSingle())
    if (!paper || (paper.status !== 'queued' && paper.status !== 'reading')) return
    await endUnreadablePaper({ db, schoolId: event.school_id, eventId: event.id, env: { replayStore: new MemoryStore() }, now }, paper)
  } catch (err) {
    console.error(`paper after a failed event: ${text(err)}`)
  }
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
    const ended = await endEventFailed(db, eventId, error, attempts, now().toISOString())
    if (ended.data?.[0]) await afterEventFailed(db, ended.data[0], now) // a cancelled event (no row) leaves its paper alone
    return { status: 'failed' }
  }

  /**
   * The papers of a test are read at the same time, and the last two can both find the test ready for its tail.
   * One run takes a lock (an atomic insert, the table's key is its primary key) and does the tail; the other leaves it to that run.
   */
  const takeTail = async (parsed: JemmaEvent): Promise<boolean> => {
    if (tailLock) return true
    // `test.shared` holds the test id itself. A paper event finds it through its paper.
    let testId: string | null | undefined
    if (parsed.type === 'test.shared') testId = parsed.testId
    else if (parsed.type === 'paper.snapped' || parsed.type === 'paper.checked') testId = (await maybe(db.from('papers').select('test_id').eq('id', parsed.paperId).maybeSingle()))?.test_id
    if (!testId) return true
    const key = `lock:tail:${testId}`
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

  // AI_ROUTE=operator: recorded answers first, then an operator's laptop, then the worker's own model. Only for
  // events of a cloud school that were not already sent back to the cloud (`cloud_live`).
  const routeTag = deps.routeTag || DEFAULT_ROUTE_TAG
  let ownMode = true // true: the job sees `deps.env` as it is. Set below for a routed event.
  const replayCtx: ToolContext = { ...ctx, env: { ...deps.env, AI_MODE: 'replay' } }

  const runStep = async (step: JobStep) => {
    const run = deps.jobs[step.job] ?? codeJobs[step.job]
    if (!run) throw new Error(`job not available: ${step.job}`)
    let transient = 0
    let badOutput = 0
    let ownThisStep = false // a job that is never handed off runs once with the worker's own AI_MODE after its miss
    for (let attempt = 1; ; attempt++) {
      await guard()
      attempts = Math.max(attempts, attempt)
      try {
        await run(ownMode || ownThisStep ? ctx : replayCtx, eventId, step.ids)
        return
      } catch (err) {
        // A missing recorded answer is not a transient or bad-output failure, whatever its text says: never retried.
        if (isReplayMiss(err)) {
          if (ownMode || ownThisStep) throw err
          if (NO_HANDOFF_JOBS.has(step.job)) ownThisStep = true
          else if (await operatorOnline(db, now(), routeTag)) throw new HandOff()
          else ownMode = true // no operator: the rest of this run uses the worker's own AI_MODE
        } else if (isTransient(err) && transient < BACKOFF_MS.length) await sleep(BACKOFF_MS[transient++]!)
        else if (isBadOutput(err) && badOutput < 1) badOutput++
        else throw err
      }
    }
  }

  try {
    if (deps.route === 'operator' && payload.route !== 'cloud_live') {
      const school = await maybe(db.from('schools').select('ai_runner').eq('id', row.school_id).maybeSingle())
      ownMode = school?.ai_runner !== 'cloud'
    }
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
        await afterJob(db, row.school_id, step, startedAt, told)
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
    if (err instanceof HandOff) {
      // The owner's laptop does this event. Nothing failed: queue it for an operator and let go of the test's tail.
      await releaseTail()
      const moved = await ok(
        db.from('events').update({ runner: 'desktop', status: 'queued', claimed_by: null, attempts, payload: { ...payload, route: 'operator', route_tag: routeTag } as never }).eq('id', eventId).eq('status', 'running').select('id'),
      )
      return { status: moved.length ? 'handed_off' : 'cancelled' }
    }
    if (deps.final === false && isTransient(err) && !isReplayMiss(err)) {
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
    const owner = await ownerOf(db, schoolId, await classIdFor(db, { eventId: events[0]!.id }))
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

/**
 * Automatic rescue when the owner's laptop goes away. When no operator runner has been seen for 90 seconds, every event
 * handed to an operator (`payload.route = 'operator'`) that is queued, or running on the desktop side (the laptop died
 * mid-job), goes back to the cloud: `runner = 'cloud'`, queued, `payload.route = 'cloud_live'` (never handed off again),
 * and `enqueue` puts it on the queue. Returns how many were moved. Looks only at presence rows and events of its routing `tag`.
 * `schoolIds` limits the check (tests on a shared database).
 */
export async function checkOperatorTimeouts(
  db: JemmaDb,
  enqueue: (eventId: string) => Promise<void>,
  now: Date = new Date(),
  schoolIds?: string[],
  tag: string = DEFAULT_ROUTE_TAG,
): Promise<number> {
  if (await operatorOnline(db, now, tag)) return 0
  let query = db
    .from('events')
    .select('id, status, payload')
    .eq('payload->>route', 'operator')
    .or('status.eq.queued,and(status.eq.running,runner.eq.desktop)')
  if (schoolIds) query = query.in('school_id', schoolIds)
  // Only events handed off by this stack (its tag); an event without a tag counts as `default`.
  const waiting = (await ok(query.order('created_at'))).filter((e) => ((e.payload as { route_tag?: unknown }).route_tag ?? DEFAULT_ROUTE_TAG) === tag)
  let moved = 0
  for (const e of waiting) {
    const payload = { ...(e.payload as Record<string, unknown>), route: 'cloud_live' }
    const taken = await ok(
      db
        .from('events')
        .update({ runner: 'cloud', status: 'queued', claimed_by: null, payload: payload as never })
        .eq('id', e.id)
        .eq('status', e.status)
        .eq('payload->>route', 'operator')
        .select('id'),
    )
    if (taken.length === 0) continue // an operator or a person got there first
    try {
      await enqueue(e.id)
      moved++
    } catch {
      // The queue refused it: put the event back as it was, so the next run (a minute later) tries again.
      await db.from('events').update({ runner: 'desktop', status: e.status, payload: e.payload as never }).eq('id', e.id).eq('payload->>route', 'cloud_live')
    }
  }
  return moved
}

/**
 * Jobs that stopped half way. A cloud event that is `running` has a run behind it that lives 15 minutes at most. When the event is
 * older than `staleMs` and its job has logged no tool call in that time (a tool call is the sign of life of a job), the run is dead:
 * the database was down when it tried to write its end, or Cloudflare ended the invocation. Nothing else would ever move the event,
 * because the queue consumer only runs an event that is `queued`.
 *
 * - First and second time: one guarded update puts it back to `queued` with `payload.revived` one higher (the rest of the payload stays),
 *   then `requeue` puts it on the queue. The job plan starts again from the top, as a transient retry does. There is no resume.
 * - A job that was brought back twice and died again (`revived` is 2 or more) ends the way a failed job ends: `endEventFailed`,
 *   with `STUCK_EVENT_ERROR`, so every screen sees what it sees for a job that failed for good.
 *
 * Events a laptop holds (`runner = desktop`, an operator runner or a user's Desktop) are left alone: they have their own checks.
 * At most 20 events a run, oldest first. Never throws: a failure is logged as one line and the next minute tries again.
 * Answers how many events it moved (put back on the queue, or ended failed).
 */
export async function checkStuckEvents(
  db: JemmaDb,
  requeue: (eventId: string) => Promise<void>,
  now: Date = new Date(),
  staleMs: number = STUCK_EVENT_MS,
): Promise<number> {
  let revivedCount = 0
  let failedCount = 0
  try {
    const cutoff = new Date(now.getTime() - staleMs).toISOString()
    const running = await ok(
      db
        .from('events')
        .select('id, payload, attempts')
        .eq('status', 'running')
        .eq('runner', 'cloud')
        .is('claimed_by', null)
        .lte('created_at', cutoff)
        .order('created_at')
        .limit(STUCK_SCAN),
    )
    if (running.length === 0) return 0
    const lively = await ok(db.from('tool_calls').select('event_id').in('event_id', running.map((e) => e.id)).gte('created_at', cutoff))
    const alive = new Set(lively.map((t) => t.event_id))
    for (const e of running.filter((r) => !alive.has(r.id)).slice(0, STUCK_PER_RUN)) {
      const payload = (e.payload ?? {}) as Record<string, unknown>
      const revived = typeof payload.revived === 'number' && Number.isFinite(payload.revived) ? payload.revived : 0
      if (revived >= MAX_REVIVALS) {
        const ended = await ok(endEventFailed(db, e.id, STUCK_EVENT_ERROR, e.attempts, now.toISOString(), 'running'))
        if (ended.length) {
          failedCount++
          await afterEventFailed(db, ended[0]!, () => now)
        }
        continue
      }
      const taken = await ok(
        db.from('events').update({ status: 'queued', payload: { ...payload, revived: revived + 1 } as never }).eq('id', e.id).eq('status', 'running').select('id'),
      )
      if (taken.length === 0) continue // someone else moved it
      try {
        await requeue(e.id)
      } catch (err) {
        // The queue refused it: put the event back as it was, so the next run (a minute later) tries again.
        await db.from('events').update({ status: 'running', payload: e.payload as never }).eq('id', e.id).eq('status', 'queued')
        throw err
      }
      revivedCount++
    }
    if (revivedCount + failedCount > 0) console.log(`stuck jobs: put ${revivedCount} back on the queue, ended ${failedCount} as failed`)
  } catch (err) {
    console.error(`stuck jobs check failed: ${text(err)}`)
  }
  return revivedCount + failedCount
}
