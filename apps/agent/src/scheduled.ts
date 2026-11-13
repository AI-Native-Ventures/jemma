import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'
import { sweepOldSandboxes } from '../../../supabase/seed/teardown'
import { checkDesktop, checkOperator, checkStuck } from './consumer'
import type { Env } from './env'

/** The two crons in wrangler.jsonc and wrangler.local.jsonc. A test keeps these names and those files the same. */
export const MINUTE_CRON = '* * * * *'
export const SWEEP_CRON = '17 * * * *'

/** Demo sandboxes unused for this many days are removed by the sweep. */
export const DEFAULT_SANDBOX_DAYS = 7

/** `DEMO_SANDBOX_DAYS`: a number of days, `0` for off. Anything missing or not a number of days is the default. */
export function sandboxDays(env: Pick<Env, 'DEMO_SANDBOX_DAYS'>): number {
  const raw = env.DEMO_SANDBOX_DAYS
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_SANDBOX_DAYS
  const days = Number(raw)
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_SANDBOX_DAYS
}

export type ScheduledDeps = {
  checkDesktop: (env: Env) => Promise<unknown>
  checkOperator: (env: Env) => Promise<unknown>
  checkStuck: (env: Env) => Promise<unknown>
  sweep: typeof sweepOldSandboxes
  admin: (env: Env) => JemmaDb
}

const defaults: ScheduledDeps = { checkDesktop, checkOperator, checkStuck, sweep: sweepOldSandboxes, admin: (env) => createServiceClient(env) }

/**
 * The hourly sweep: removes demo sandboxes nobody has used for `DEMO_SANDBOX_DAYS` days (default 7, `0` is off). It never throws:
 * a failure is logged as one line and the next hour tries again.
 */
export async function sweepDemoSandboxes(env: Env, deps: ScheduledDeps = defaults): Promise<string[]> {
  try {
    const days = sandboxDays(env)
    if (days === 0) return []
    const removed = await deps.sweep(deps.admin(env), { olderThanDays: days })
    if (removed.length) console.log(`demo sweep: removed ${removed.length} old demo ${removed.length === 1 ? 'sandbox' : 'sandboxes'}`)
    return removed
  } catch (e) {
    console.error(`demo sweep failed: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

/**
 * What a cron does. The hourly one only sweeps. Every other one (the every-minute cron) runs the desktop and operator checks
 * exactly as before, and the check of jobs that stopped half way, and never a sweep.
 */
export async function runScheduled(cron: string, env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>, deps: ScheduledDeps = defaults): Promise<void> {
  if (cron === SWEEP_CRON) {
    ctx.waitUntil(sweepDemoSandboxes(env, deps))
    return
  }
  ctx.waitUntil(deps.checkDesktop(env))
  ctx.waitUntil(deps.checkOperator(env))
  ctx.waitUntil(deps.checkStuck(env))
}
