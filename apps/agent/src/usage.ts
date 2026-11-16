import type { ModelUsage } from '@jemma/profiling/ai'
import type { Database, JemmaDb } from '@jemma/profiling/db'
import type { ToolContext } from '@jemma/profiling/tools'
import { classIdFor } from '../../../packages/profiling/src/ai/subject-profile'

/** A job step as the orchestrator runs it (the same shape as `CloudJob`, kept here so this file pulls in no job prompt). */
type Job = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => Promise<void>

type UsageRow = Database['public']['Tables']['ai_usage']['Insert']

/** How long a step waits for its usage rows to be saved. A database that is slow or hangs must not hold a job: after this the rows are given up. */
export const USAGE_SAVE_WAIT_MS = 3000

let warned = false

/** Makes the next failure to save be logged again (the log is once for each worker start, and a test starts over). */
export function resetUsageWarning(): void {
  warned = false
}

/** One line in the log for the first failure to save usage, then nothing: the table may simply not be there yet, and that must not flood the log. */
function warnOnce(reason: unknown): void {
  if (warned) return
  warned = true
  console.error(`ai_usage not saved, the job carries on: ${reason instanceof Error ? reason.message : String(reason)}`)
}

const uuidOrNull = (v: string | undefined): string | null => (v ? v : null)

/**
 * What a step belongs to, from the ids it was given and, for a paper or a learner, one or two reads. Any read that fails leaves the id null: the
 * row is still saved with what is known.
 */
async function scopeOf(db: JemmaDb, eventId: string | null, ids: Record<string, string>) {
  const scope = { class_id: uuidOrNull(ids.classId), child_id: uuidOrNull(ids.childId), test_id: uuidOrNull(ids.testId), session_id: uuidOrNull(ids.sessionId), lesson_id: uuidOrNull(ids.lessonId) }
  try {
    if (ids.paperId && (!scope.child_id || !scope.test_id)) {
      const paper = await db.from('papers').select('test_id, child_id').eq('id', ids.paperId).maybeSingle()
      scope.test_id ??= paper.data?.test_id ?? null
      scope.child_id ??= paper.data?.child_id ?? null
    }
    scope.class_id ??= await classIdFor(db, { testId: scope.test_id, childId: scope.child_id, sessionId: scope.session_id, mapId: ids.mapId ?? null, eventId })
  } catch {
    // The class and the learner are best knowledge: the counts are what matter.
  }
  return scope
}

async function saveRows(ctx: ToolContext, job: string, ids: Record<string, string>, seen: ModelUsage[]): Promise<void> {
  const scope = await scopeOf(ctx.db, ctx.eventId, ids)
  const rows: UsageRow[] = seen.map((u) => ({
    school_id: ctx.schoolId,
    ...scope,
    job,
    provider: u.provider,
    model: u.model,
    prompt_tokens: u.promptTokens,
    completion_tokens: u.completionTokens,
    total_tokens: u.totalTokens,
    reported: u.reported,
  }))
  const { error } = await ctx.db.from('ai_usage').insert(rows)
  if (error) throw new Error(error.message)
}

/**
 * Saves the usage of a step, never failing and never waiting longer than `waitMs`. A missing table, a refused insert, a network error and a hang
 * are each one line in the log at most (see `warnOnce`) and are never retried.
 */
async function saveUsage(ctx: ToolContext, job: string, ids: Record<string, string>, seen: ModelUsage[], waitMs: number): Promise<void> {
  if (seen.length === 0) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const gaveUp = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), waitMs)
  })
  try {
    const saving = saveRows(ctx, job, ids, seen).then(() => 'saved' as const)
    saving.catch(() => undefined) // a save that ends after the wait has its error read here, not as an unhandled one
    if ((await Promise.race([saving, gaveUp])) === 'late') warnOnce(`no answer from the database after ${waitMs} ms`)
  } catch (err) {
    warnOnce(err)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Wraps a cloud job so that the real tokens of its model calls are saved (P137). The job runs with a copy of its context whose `env.onUsage` collects
 * the usage of every live model call (a recorded answer that is replayed reports none); after the step, success or failure, one `ai_usage` row is saved
 * for each call with the ids the step knows. The job itself is untouched: same prompts, same calls, same result, and an error of its own goes up as it was.
 */
export function withUsage(job: string, run: Job, opts: { waitMs?: number } = {}): Job {
  return async (ctx, eventId, ids) => {
    const seen: ModelUsage[] = []
    const counting: ToolContext = { ...ctx, env: { ...ctx.env, onUsage: (usage) => void seen.push(usage) } }
    try {
      await run(counting, eventId, ids)
    } finally {
      await saveUsage(ctx, job, ids, seen, opts.waitMs ?? USAGE_SAVE_WAIT_MS)
    }
  }
}
