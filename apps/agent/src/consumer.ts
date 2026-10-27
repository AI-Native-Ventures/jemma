import { SupabaseReplayStore } from '@jemma/profiling/ai'
import { createServiceClient } from '@jemma/profiling/db'
import { EventSchema } from '@jemma/profiling/schemas'
import { jobPlan, type ToolContext } from '@jemma/profiling/tools'
import type { Env } from './env'
import { cloudJobs, type CloudJobs } from './jobs'

const MAX_STEPS = 60

export function toolContext(env: Env, schoolId: string, eventId: string | null, schoolIds?: string[]): ToolContext {
  const db = createServiceClient(env)
  return {
    db,
    schoolId,
    schoolIds,
    eventId,
    now: () => new Date(),
    env: {
      LLM_PROVIDER: env.LLM_PROVIDER,
      LLM_MODEL: env.LLM_MODEL,
      VISION_PROVIDER: env.VISION_PROVIDER,
      VISION_MODEL: env.VISION_MODEL,
      TTS_PROVIDER: env.TTS_PROVIDER,
      TTS_MODEL: env.TTS_MODEL,
      AI_MODE: env.AI_MODE,
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
      DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENCODE_API_KEY: env.OPENCODE_API_KEY,
      OPENCODE_BASE_URL: env.OPENCODE_BASE_URL,
      replayStore: new SupabaseReplayStore(db),
    },
  }
}

async function finish(ctx: ToolContext, eventId: string, status: 'done' | 'failed', error: string | null) {
  await ctx.db.from('events').update({ status, error, finished_at: new Date().toISOString() }).eq('id', eventId)
}

/**
 * Runs one event in the cloud. Events for a desktop school stay queued with runner 'desktop'.
 * Walks the job plan, re-planning after each job, and fails the event when a job is not built.
 * Retries, cancellation, notifications and the desktop timeout are Task 13.
 */
export async function processEvent(env: Env, eventId: string, jobs: CloudJobs = cloudJobs): Promise<void> {
  const db = createServiceClient(env)
  const row = await db.from('events').select('id, school_id, type, payload, status').eq('id', eventId).maybeSingle()
  if (row.error) throw new Error(row.error.message)
  if (!row.data || row.data.status !== 'queued') return
  const event = row.data
  const school = await db.from('schools').select('ai_runner').eq('id', event.school_id).single()
  if (school.error) throw new Error(school.error.message)
  if (school.data.ai_runner === 'desktop') {
    await db.from('events').update({ runner: 'desktop' }).eq('id', eventId).eq('status', 'queued')
    return
  }

  const ctx = toolContext(env, event.school_id, eventId)
  const claim = await db
    .from('events')
    .update({ status: 'running', attempts: 1 })
    .eq('id', eventId)
    .eq('status', 'queued')
    .select('id')
  if (claim.error) throw new Error(claim.error.message)
  if (claim.data.length === 0) return // someone else has it

  try {
    const parsed = EventSchema.parse({ ...(event.payload as object), type: event.type })
    const done = new Set<string>()
    for (let i = 0; i < MAX_STEPS; i++) {
      const step = (await jobPlan(parsed, db)).find((s) => !done.has(`${s.job}:${JSON.stringify(s.ids)}`))
      if (!step) break
      const run = jobs[step.job]
      if (!run) return await finish(ctx, eventId, 'failed', `job not available: ${step.job}`)
      await run(ctx, eventId, step.ids)
      done.add(`${step.job}:${JSON.stringify(step.ids)}`)
    }
    await finish(ctx, eventId, 'done', null)
  } catch (err) {
    await finish(ctx, eventId, 'failed', err instanceof Error ? err.message : String(err))
  }
}
