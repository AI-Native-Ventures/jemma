import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JemmaDb } from '@jemma/profiling/db'
import worker from '../src/index'
import type { Env } from '../src/env'
import { DEFAULT_SANDBOX_DAYS, MINUTE_CRON, SWEEP_CRON, runScheduled, sandboxDays, sweepDemoSandboxes, type ScheduledDeps } from '../src/scheduled'

// The two crons: every minute the desktop, operator and stuck-jobs checks, once an hour (minute 17) the sweep of old demo sandboxes.
// No network and no database: the checks and the sweep are doubles, or `fetch` is.

afterEach(() => vi.restoreAllMocks())

const env = (extra: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'http://localhost:1', SUPABASE_SERVICE_ROLE_KEY: 'x', ...extra }) as unknown as Env
const admin = {} as JemmaDb

function doubles(over: Partial<ScheduledDeps> = {}) {
  const calls: string[] = []
  const deps: ScheduledDeps = {
    checkDesktop: vi.fn(async () => (calls.push('desktop'), 0)),
    checkOperator: vi.fn(async () => (calls.push('operator'), 0)),
    checkStuck: vi.fn(async () => (calls.push('stuck'), 0)),
    sweep: vi.fn(async () => (calls.push('sweep'), ['gone'])),
    admin: () => admin,
    ...over,
  }
  return { deps, calls }
}
/** A context that keeps what is handed to `waitUntil`, so the test can wait for it. */
function context() {
  const pending: Promise<unknown>[] = []
  return { ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) } as unknown as ExecutionContext, done: () => Promise.allSettled(pending) }
}

describe('the crons', () => {
  test('the two crons are named as wrangler has them', () => {
    expect(MINUTE_CRON).toBe('* * * * *')
    expect(SWEEP_CRON).toBe('17 * * * *')
  })

  test('every minute: the desktop, operator and stuck-jobs checks run and no sweep does', async () => {
    const { deps, calls } = doubles()
    const { ctx, done } = context()
    await runScheduled(MINUTE_CRON, env(), ctx, deps)
    await done()
    expect(calls.sort()).toEqual(['desktop', 'operator', 'stuck'])
    expect(deps.checkStuck).toHaveBeenCalledTimes(1)
    expect(deps.checkStuck).toHaveBeenCalledWith(expect.objectContaining({ SUPABASE_URL: 'http://localhost:1' }))
    expect(deps.sweep).not.toHaveBeenCalled()
  })

  test('every minute: a stuck-jobs check that fails does not stop the other checks', async () => {
    const { deps, calls } = doubles({ checkStuck: vi.fn(async () => Promise.reject(new Error('down'))) })
    const { ctx, done } = context()
    await expect(runScheduled(MINUTE_CRON, env(), ctx, deps)).resolves.toBeUndefined()
    await done()
    expect(calls.sort()).toEqual(['desktop', 'operator'])
  })

  test('once an hour: the sweep runs, with the default of 7 days, and the minute checks do not run again', async () => {
    const { deps, calls } = doubles()
    const { ctx, done } = context()
    await runScheduled(SWEEP_CRON, env(), ctx, deps)
    await done()
    expect(calls).toEqual(['sweep'])
    expect(deps.checkStuck).not.toHaveBeenCalled()
    expect(deps.sweep).toHaveBeenCalledWith(admin, { olderThanDays: DEFAULT_SANDBOX_DAYS })
    expect(DEFAULT_SANDBOX_DAYS).toBe(7)
  })

  test('DEMO_SANDBOX_DAYS sets the days, and 0 switches the sweep off', async () => {
    for (const [value, days] of [['14', 14], [30, 30], ['1', 1]] as const) {
      const { deps } = doubles()
      const { ctx, done } = context()
      await runScheduled(SWEEP_CRON, env({ DEMO_SANDBOX_DAYS: value }), ctx, deps)
      await done()
      expect(deps.sweep).toHaveBeenCalledWith(admin, { olderThanDays: days })
    }
    for (const off of ['0', 0, ' 0 ']) {
      const { deps, calls } = doubles()
      const { ctx, done } = context()
      await runScheduled(SWEEP_CRON, env({ DEMO_SANDBOX_DAYS: off }), ctx, deps)
      await done()
      expect(calls).toEqual([])
      expect(deps.sweep).not.toHaveBeenCalled()
      expect(deps.checkStuck).not.toHaveBeenCalled()
    }
  })

  test('a value that is not a number of days falls back to 7', () => {
    for (const bad of [undefined, '', '  ', 'seven', '-3', 'NaN', 'Infinity']) expect(sandboxDays(env({ DEMO_SANDBOX_DAYS: bad }))).toBe(7)
    expect(sandboxDays(env({ DEMO_SANDBOX_DAYS: '0' }))).toBe(0)
    expect(sandboxDays(env({ DEMO_SANDBOX_DAYS: '2.5' }))).toBe(2.5)
  })

  test('an unknown cron runs the minute checks, as before', async () => {
    const { deps, calls } = doubles()
    const { ctx, done } = context()
    await runScheduled('*/5 * * * *', env(), ctx, deps)
    await done()
    expect(calls.sort()).toEqual(['desktop', 'operator', 'stuck'])
  })
})

describe('the sweep never throws out of scheduled()', () => {
  test('a sweep that fails is caught and logged as one line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps } = doubles({ sweep: vi.fn(async () => Promise.reject(new Error('the database is down'))) })
    const { ctx, done } = context()
    await expect(runScheduled(SWEEP_CRON, env(), ctx, deps)).resolves.toBeUndefined()
    const settled = await done()
    expect(settled.every((s) => s.status === 'fulfilled')).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('demo sweep failed: the database is down')
  })

  test('a client that cannot be made is caught too', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps } = doubles({ admin: () => { throw new Error('no key') } })
    const { ctx, done } = context()
    await runScheduled(SWEEP_CRON, env(), ctx, deps)
    expect((await done()).every((s) => s.status === 'fulfilled')).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
  })

  test('sweepDemoSandboxes answers the ids it removed, and says how many in one line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { deps } = doubles()
    expect(await sweepDemoSandboxes(env(), deps)).toEqual(['gone'])
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('demo sweep: removed 1 old demo sandbox')
  })
})

describe('the worker', () => {
  /** Answers every database call with an empty list, and counts them. */
  const fakeFetch = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))

  test('scheduled() with the hourly cron and the sweep off asks the database for nothing', async () => {
    const spy = fakeFetch()
    const { ctx, done } = context()
    await worker.scheduled({ cron: SWEEP_CRON, scheduledTime: Date.now(), noRetry: () => {} } as ScheduledController, env({ DEMO_SANDBOX_DAYS: '0' }), ctx)
    await done()
    expect(spy).not.toHaveBeenCalled()
  })

  test('scheduled() with the hourly cron and the sweep on looks for old sandboxes and never rejects', async () => {
    const spy = fakeFetch()
    const { ctx, done } = context()
    await expect(worker.scheduled({ cron: SWEEP_CRON, scheduledTime: Date.now(), noRetry: () => {} } as ScheduledController, env(), ctx)).resolves.toBeUndefined()
    expect((await done()).every((s) => s.status === 'fulfilled')).toBe(true)
    const urls = spy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/rest/v1/demo_sandboxes'))).toBe(true)
    expect(urls.some((u) => u.includes('/rest/v1/events'))).toBe(false) // none of the minute checks
  })

  test('scheduled() with the minute cron runs the checks and asks for no sandbox', async () => {
    const spy = fakeFetch()
    const { ctx, done } = context()
    await worker.scheduled({ cron: MINUTE_CRON, scheduledTime: Date.now(), noRetry: () => {} } as ScheduledController, env(), ctx)
    await done()
    const urls = spy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/rest/v1/events'))).toBe(true)
    expect(urls.some((u) => u.includes('/rest/v1/demo_sandboxes'))).toBe(false)
  })
})
