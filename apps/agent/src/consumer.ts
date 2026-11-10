import { SupabaseReplayStore } from '@jemma/profiling/ai'
import { createServiceClient } from '@jemma/profiling/db'
import { checkDesktopTimeouts, checkOperatorTimeouts, runEvent } from '@jemma/profiling/orchestrator'
import type { ToolContext } from '@jemma/profiling/tools'
import type { Env } from './env'
import { cloudJobs, type CloudJobs } from './jobs'

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
      LLM_MODEL_FALLBACKS: env.LLM_MODEL_FALLBACKS,
      VISION_PROVIDER: env.VISION_PROVIDER,
      VISION_MODEL: env.VISION_MODEL,
      VISION_MODEL_FALLBACKS: env.VISION_MODEL_FALLBACKS,
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

/** Queue deliveries allowed after the first (wrangler `max_retries`). */
export const MAX_QUEUE_RETRIES = 3

/**
 * Runs one event in the cloud. Events for a desktop school stay queued with runner 'desktop' (the cron check
 * asks the owner if the runner stays away). The run itself is `runEvent`: job plan, retries, cancellation, postconditions.
 * With `AI_ROUTE=operator` each job tries recorded answers first and hands the event to the owner's laptop on a miss;
 * an event already handed off (queued for the desktop side with `payload.route = 'operator'`) is left alone here.
 * `final` is true on the last queue delivery, when a still-failing event must be marked failed.
 */
export async function processEvent(env: Env, eventId: string, jobs: CloudJobs = cloudJobs, final = true): Promise<void> {
  const db = createServiceClient(env)
  const row = await db.from('events').select('id, school_id, status, runner, payload').eq('id', eventId).maybeSingle()
  if (row.error) throw new Error(row.error.message)
  if (!row.data || row.data.status !== 'queued') return
  const school = await db.from('schools').select('ai_runner').eq('id', row.data.school_id).single()
  if (school.error) throw new Error(school.error.message)
  if (school.data.ai_runner === 'desktop') {
    await db.from('events').update({ runner: 'desktop' }).eq('id', eventId).eq('status', 'queued')
    return
  }
  const handedOff = row.data.runner === 'desktop' && (row.data.payload as { route?: unknown } | null)?.route === 'operator'
  if (handedOff) return
  const ctx = toolContext(env, row.data.school_id, eventId)
  await runEvent(eventId, { db, env: ctx.env, jobs, final, route: env.AI_ROUTE === 'operator' ? 'operator' : 'cloud', routeTag: env.AI_ROUTE_TAG || undefined })
}

/** Cron: asks the owner when a desktop event has waited 10 minutes with no Jemma Desktop heartbeat. */
export async function checkDesktop(env: Env): Promise<number> {
  return checkDesktopTimeouts(createServiceClient(env))
}

/**
 * Cron, every minute: when no operator runner has been seen for 90 seconds, events handed to the owner's laptop go
 * back to the cloud (marked `cloud_live`, so they are never handed off again) and onto the queue.
 */
export async function checkOperator(env: Env): Promise<number> {
  return checkOperatorTimeouts(createServiceClient(env), async (eventId) => void (await env.EVENTS_QUEUE.send({ eventId })), new Date(), undefined, env.AI_ROUTE_TAG || undefined)
}

/** Marks an event failed after its last queue delivery blew up outside the job plan. */
export async function failEvent(env: Env, eventId: string, error: string): Promise<void> {
  await createServiceClient(env)
    .from('events')
    .update({ status: 'failed', error, finished_at: new Date().toISOString() })
    .eq('id', eventId)
    .in('status', ['queued', 'running'])
}
