import type { JemmaDb } from '@jemma/profiling/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestLongView } from '@/lib/long-view'

type Call = { table: string; op: string; args: unknown[] }

/**
 * An admin client double. Every chained call is recorded and the chain answers `data` when awaited.
 * `busy` are the long_view.requested events that are queued or running (as the dedup query returns them).
 */
function fakeAdmin(busy: { childId: string }[] = [], opts: { selectError?: string } = {}) {
  const calls: Call[] = []
  const chain = (table: string, op: string, data: unknown, error: { message: string } | null = null) => {
    const q: Record<string, unknown> = {}
    const proxy = new Proxy(q, {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data, error })
        return (...args: unknown[]) => {
          calls.push({ table, op: `${op}.${prop}`, args })
          return proxy
        }
      },
    })
    return proxy
  }
  const admin = {
    from(table: string) {
      return {
        select: (...args: unknown[]) => {
          calls.push({ table, op: 'select', args })
          return chain(table, 'select', opts.selectError ? null : busy.map((b) => ({ payload: { type: 'long_view.requested', childId: b.childId } })), opts.selectError ? { message: opts.selectError } : null)
        },
        update: (...args: unknown[]) => {
          calls.push({ table, op: 'update', args })
          return chain(table, 'update', null)
        },
      }
    },
  }
  return { admin: admin as unknown as JemmaDb, calls }
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-10T12:00:00Z')

afterEach(() => vi.restoreAllMocks())

describe('requestLongView', () => {
  it('sends one long_view.requested for each child', async () => {
    const f = fakeAdmin()
    const send = vi.fn(async () => 'event-id')
    const r = await requestLongView([A, B], { admin: f.admin, send, now: () => NOW })
    expect(send.mock.calls).toEqual([
      ['long_view.requested', { childId: A }],
      ['long_view.requested', { childId: B }],
    ])
    expect(r).toEqual({ sent: [A, B], skipped: [], failed: [] })
  })

  it('sends one event for a child named twice', async () => {
    const send = vi.fn(async () => 'event-id')
    await requestLongView([A, A], { admin: fakeAdmin().admin, send, now: () => NOW })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('skips a child who already has an update queued or running', async () => {
    const f = fakeAdmin([{ childId: A }])
    const send = vi.fn(async () => 'event-id')
    const r = await requestLongView([A, B], { admin: f.admin, send, now: () => NOW })
    expect(send.mock.calls).toEqual([['long_view.requested', { childId: B }]])
    expect(r).toEqual({ sent: [B], skipped: [A], failed: [] })
  })

  it('looks only at updates that are still fresh, so a lost one never blocks a new request', async () => {
    const f = fakeAdmin()
    await requestLongView([A], { admin: f.admin, send: vi.fn(async () => 'x'), now: () => NOW })
    const gte = f.calls.find((c) => c.op === 'select.gte')!
    expect(gte.args).toEqual(['created_at', new Date(NOW.getTime() - 15 * 60_000).toISOString()])
    const status = f.calls.find((c) => c.op === 'select.in')!
    expect(status.args).toEqual(['status', ['queued', 'running']])
  })

  it('does nothing for no children', async () => {
    const send = vi.fn(async () => 'x')
    expect(await requestLongView([], { admin: fakeAdmin().admin, send })).toEqual({ sent: [], skipped: [], failed: [] })
    expect(send).not.toHaveBeenCalled()
  })

  it('never throws: an agent that cannot be reached marks the new event failed, so the screen shows the retry card', async () => {
    const f = fakeAdmin()
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const send = vi.fn(async () => {
      throw new Error('agent /events answered 502')
    })
    const r = await requestLongView([A], { admin: f.admin, send, now: () => NOW })
    expect(r).toEqual({ sent: [], skipped: [], failed: [A] })
    const update = f.calls.find((c) => c.table === 'events' && c.op === 'update')!
    expect(update.args[0]).toMatchObject({ status: 'failed', error: 'agent /events answered 502' })
    expect(f.calls.some((c) => c.op === 'update.eq' && c.args[0] === 'payload->>childId' && c.args[1] === A)).toBe(true)
    expect(f.calls.some((c) => c.op === 'update.eq' && c.args[0] === 'status' && c.args[1] === 'queued')).toBe(true)
    expect(err).toHaveBeenCalled()
  })

  it('never throws when it cannot even look for a running update', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const send = vi.fn(async () => 'x')
    const r = await requestLongView([A], { admin: fakeAdmin([], { selectError: 'db down' }).admin, send, now: () => NOW })
    expect(r).toEqual({ sent: [], skipped: [], failed: [A] })
    expect(send).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
  })
})
