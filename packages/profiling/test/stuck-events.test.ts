import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JemmaDb } from '../src/db'
import { checkStuckEvents, isTransient, runEvent, STUCK_EVENT_ERROR, STUCK_EVENT_MS } from '../src/orchestrator'
import { isRetryableModelError, ModelTimeoutError } from '../src/ai'

// The stuck-jobs check, with no database and no network: the tables are arrays in memory, and the query builder knows the few
// calls the check makes. A test can make any call fail, or change a row between the read and the write (someone else got there first).

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
type Fail = (table: string, op: 'select' | 'update') => string | null

function memory(seed: Tables, opts: { fail?: Fail; beforeUpdate?: (row: Row) => void } = {}) {
  const tables: Tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]))
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'update' = 'select'
    let patch: Row = {}
    let sort: string | null = null
    let max = Infinity
    const run = () => {
      const failure = opts.fail?.(table, op)
      if (failure) return { data: null, error: { message: failure } }
      const all = tables[table] ?? []
      if (op === 'update') {
        // The row can change between the check and the write: the filters see it as it is now.
        for (const r of all) if (filters.every((f) => f(r))) opts.beforeUpdate?.(r)
        const hit = all.filter((r) => filters.every((f) => f(r)))
        for (const r of hit) Object.assign(r, patch)
        return { data: hit.map((r) => ({ ...r })), error: null }
      }
      const hit = all.filter((r) => filters.every((f) => f(r)))
      const ordered = sort ? [...hit].sort((a, b) => (String(a[sort!]) < String(b[sort!]) ? -1 : 1)) : hit
      return { data: ordered.slice(0, max).map((r) => ({ ...r })), error: null }
    }
    const q = {
      select: () => q,
      update: (p: Row) => ((op = 'update'), (patch = p), q),
      eq: (key: string, value: unknown) => (filters.push((r) => r[key] === value), q),
      neq: (key: string, value: unknown) => (filters.push((r) => r[key] !== value), q),
      is: (key: string, value: null) => (filters.push((r) => (r[key] ?? null) === value), q),
      lte: (key: string, value: string) => (filters.push((r) => String(r[key]) <= value), q),
      gte: (key: string, value: string) => (filters.push((r) => String(r[key]) >= value), q),
      in: (key: string, values: unknown[]) => (filters.push((r) => values.includes(r[key])), q),
      order: (key: string) => ((sort = key), q),
      limit: (n: number) => ((max = n), q),
      maybeSingle: async () => {
        const res = run() as { data: Row[] | null; error: unknown }
        return res.error ? res : { data: res.data![0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }
  return { db: { from } as unknown as JemmaDb, tables }
}

const NOW = new Date('2026-11-13T09:00:00.000Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

let n = 0
/** A cloud event that is running and 17 minutes old unless the test says otherwise. */
function event(over: Row = {}): Row {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    school_id: '11111111-1111-4111-8111-111111111111',
    type: 'key.snapped',
    status: 'running',
    runner: 'cloud',
    claimed_by: null,
    attempts: 0,
    error: null,
    finished_at: null,
    created_at: minutesAgo(17),
    payload: { type: 'key.snapped', testId: 'abc', progress: { job: 'read_key', step: 1, done: 0 } },
    ...over,
  }
}
const toolCall = (eventId: string, ago: number): Row => ({ id: `t${n++}`, event_id: eventId, created_at: minutesAgo(ago) })

afterEach(() => vi.restoreAllMocks())

describe('the limit', () => {
  test('a cloud invocation lives 15 minutes, so a job that shows nothing for 16 minutes is dead', () => {
    expect(STUCK_EVENT_MS).toBe(16 * 60 * 1000)
  })
})

describe('a stuck job is put back on the queue', () => {
  test('a running cloud event 17 minutes old with no tool call goes back to queued with revived 1 and is requeued once', async () => {
    const e = event()
    const { db, tables } = memory({ events: [e], tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(requeue).toHaveBeenCalledTimes(1)
    expect(requeue).toHaveBeenCalledWith(e.id)
    const row = tables.events![0]!
    expect(row.status).toBe('queued')
    // Everything else of the payload stays, the progress too.
    expect(row.payload).toEqual({ type: 'key.snapped', testId: 'abc', progress: { job: 'read_key', step: 1, done: 0 }, revived: 1 })
    expect(row.error).toBeNull()
  })

  test('an event that was brought back once is brought back a second time, with revived 2', async () => {
    const e = event({ payload: { type: 'key.snapped', testId: 'abc', revived: 1 } })
    const { db, tables } = memory({ events: [e], tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(tables.events![0]).toMatchObject({ status: 'queued', payload: { revived: 2 } })
    expect(requeue).toHaveBeenCalledTimes(1)
  })

  test('a revived that is not a number counts as never brought back', async () => {
    const { db, tables } = memory({ events: [event({ payload: { type: 'key.snapped', testId: 'abc', revived: 'twice' } })], tool_calls: [] })
    await checkStuckEvents(db, vi.fn(async () => {}), NOW)
    expect(tables.events![0]).toMatchObject({ status: 'queued', payload: { revived: 1 } })
  })

  test('an event with a tool call 5 minutes ago is alive and left alone', async () => {
    const e = event()
    const { db, tables } = memory({ events: [e], tool_calls: [toolCall(e.id as string, 5)] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(0)
    expect(requeue).not.toHaveBeenCalled()
    expect(tables.events![0]).toMatchObject({ status: 'running', payload: { type: 'key.snapped' } })
    expect((tables.events![0]!.payload as Row).revived).toBeUndefined()
  })

  test('a tool call older than the limit is no sign of life', async () => {
    const e = event()
    const { db } = memory({ events: [e], tool_calls: [toolCall(e.id as string, 20)] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(requeue).toHaveBeenCalledWith(e.id)
  })

  test('a tool call of another event is no sign of life of this one', async () => {
    const e = event()
    const other = event()
    const { db } = memory({ events: [e, other], tool_calls: [toolCall(other.id as string, 2)] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(requeue).toHaveBeenCalledWith(e.id)
  })

  test('an event 10 minutes old is left alone', async () => {
    const { db, tables } = memory({ events: [event({ created_at: minutesAgo(10) })], tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(0)
    expect(requeue).not.toHaveBeenCalled()
    expect(tables.events![0]!.status).toBe('running')
  })

  test('the age and the limit can be set per call', async () => {
    const { db } = memory({ events: [event({ created_at: minutesAgo(3) })], tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW, 5 * 60_000)).toBe(0)
    expect(await checkStuckEvents(db, requeue, NOW, 2 * 60_000)).toBe(1)
  })

  test('with nothing running it asks for no tool calls at all', async () => {
    const seen: string[] = []
    const { db } = memory({ events: [event({ status: 'queued' })], tool_calls: [] }, { fail: (table) => (seen.push(table), null) })
    expect(await checkStuckEvents(db, vi.fn(async () => {}), NOW)).toBe(0)
    expect(seen).toEqual(['events'])
  })
})

describe('what is never touched', () => {
  test('events a laptop holds are left alone, and events that are not running', async () => {
    const held = [
      event({ runner: 'desktop', claimed_by: null }), // an operator runner
      event({ runner: 'desktop', claimed_by: '22222222-2222-4222-8222-222222222222' }), // a user's Desktop
      event({ claimed_by: '22222222-2222-4222-8222-222222222222' }), // claimed by anyone: not a cloud run
    ]
    const others = ['queued', 'done', 'failed', 'cancelled'].map((status) => event({ status }))
    const { db, tables } = memory({ events: [...held, ...others], tool_calls: [] })
    const before = JSON.stringify(tables.events)
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(0)
    expect(requeue).not.toHaveBeenCalled()
    expect(JSON.stringify(tables.events)).toBe(before)
  })
})

describe('a job that died three times ends the way a failed job ends', () => {
  test('revived 2 ends failed with the error text, its attempts kept, and is not requeued', async () => {
    const e = event({ attempts: 3, payload: { type: 'key.snapped', testId: 'abc', revived: 2, progress: { job: 'read_key', step: 1, done: 0 } } })
    const { db, tables } = memory({ events: [e], tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(requeue).not.toHaveBeenCalled()
    expect(tables.events![0]).toMatchObject({ status: 'failed', error: 'Jemma stopped answering. Try again.', attempts: 3, finished_at: NOW.toISOString() })
    expect(STUCK_EVENT_ERROR).toBe('Jemma stopped answering. Try again.')
    // The payload is not touched: a retry from the screen starts from what the event named.
    expect(tables.events![0]!.payload).toEqual(e.payload)
  })

  test('revived 5 is the same, and a failed event is not looked at again', async () => {
    const { db, tables } = memory({ events: [event({ payload: { type: 'key.snapped', testId: 'abc', revived: 5 } })], tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(tables.events![0]!.status).toBe('failed')
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(0)
    expect(requeue).not.toHaveBeenCalled()
  })

  test('an event cancelled or finished in the meantime is not overwritten', async () => {
    const e = event({ payload: { type: 'key.snapped', testId: 'abc', revived: 2 } })
    const { db, tables } = memory({ events: [e], tool_calls: [] }, { beforeUpdate: (row) => void (row.status = 'done') })
    expect(await checkStuckEvents(db, vi.fn(async () => {}), NOW)).toBe(0)
    expect(tables.events![0]!.status).toBe('done')
    expect(tables.events![0]!.error).toBeNull()
  })

  test('runEvent writes a failed job through the same function, so both ends look alike', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    const row = event({ id, type: 'observation.added', status: 'queued', created_at: minutesAgo(1), payload: { childId: 'c1' } })
    const { db, tables } = memory({ events: [row], schools: [{ id: row.school_id }] })
    const fresh = new Date('2026-11-13T09:05:00.000Z')
    const out = await runEvent(id, {
      db,
      env: {} as never,
      jobs: {
        guidance: async () => {
          throw new Error('the model said no')
        },
      },
      sleep: async () => {},
      now: () => fresh,
    })
    expect(out).toEqual({ status: 'failed' })
    expect(tables.events![0]).toMatchObject({ status: 'failed', error: 'the model said no', attempts: 1, finished_at: fresh.toISOString() })
  })
})

describe('the guarded update', () => {
  test('an update that changes no row does not requeue and is not counted', async () => {
    const e = event()
    // Between the read and the write someone else moved the event.
    const { db, tables } = memory({ events: [e], tool_calls: [] }, { beforeUpdate: (row) => void (row.status = 'queued') })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(0)
    expect(requeue).not.toHaveBeenCalled()
    expect((tables.events![0]!.payload as Row).revived).toBeUndefined()
  })

  test('the write is guarded by status running, so a finished event is never put back', async () => {
    const { db, tables } = memory({ events: [event()], tool_calls: [] }, { beforeUpdate: (row) => void (row.status = 'done') })
    const requeue = vi.fn(async () => {})
    await checkStuckEvents(db, requeue, NOW)
    expect(requeue).not.toHaveBeenCalled()
    expect(tables.events![0]!.status).toBe('done')
  })
})

describe('at most 20 a run, oldest first', () => {
  test('25 stuck events: the 20 oldest move, the other 5 wait for the next minute', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => event({ created_at: minutesAgo(100 - i) }))
    const { db, tables } = memory({ events: [...rows].reverse(), tool_calls: [] })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(20)
    expect(requeue.mock.calls.map((c) => (c as unknown[])[0])).toEqual(rows.slice(0, 20).map((r) => r.id))
    expect(tables.events!.filter((r) => r.status === 'running')).toHaveLength(5)
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(5)
  })

  test('events that are alive do not use up the 20', async () => {
    const alive = Array.from({ length: 22 }, (_, i) => event({ created_at: minutesAgo(200 - i) }))
    const dead = event({ created_at: minutesAgo(30) })
    const { db } = memory({ events: [...alive, dead], tool_calls: alive.map((a) => toolCall(a.id as string, 1)) })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(requeue).toHaveBeenCalledWith(dead.id)
  })
})

describe('it never throws', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  test('a database error on the first read is logged as one line and nothing throws', async () => {
    const log = quiet()
    const { db } = memory({ events: [event()], tool_calls: [] }, { fail: (table, op) => (table === 'events' && op === 'select' ? 'the pool is full' : null) })
    const requeue = vi.fn(async () => {})
    await expect(checkStuckEvents(db, requeue, NOW)).resolves.toBe(0)
    expect(requeue).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('stuck jobs check failed: the pool is full')
  })

  test('an error reading the tool calls stops the run and moves nothing', async () => {
    const log = quiet()
    const { db, tables } = memory({ events: [event()], tool_calls: [] }, { fail: (table) => (table === 'tool_calls' ? 'timeout' : null) })
    const requeue = vi.fn(async () => {})
    await expect(checkStuckEvents(db, requeue, NOW)).resolves.toBe(0)
    expect(log).toHaveBeenCalledTimes(1)
    expect(tables.events![0]!.status).toBe('running')
  })

  test('an error on the write is logged once, and the events written before it still count', async () => {
    const log = quiet()
    let writes = 0
    const { db } = memory(
      { events: [event({ created_at: minutesAgo(40) }), event({ created_at: minutesAgo(30) }), event({ created_at: minutesAgo(20) })], tool_calls: [] },
      { fail: (table, op) => (op === 'update' && table === 'events' && ++writes === 2 ? 'connection reset' : null) },
    )
    const requeue = vi.fn(async () => {})
    await expect(checkStuckEvents(db, requeue, NOW)).resolves.toBe(1)
    expect(requeue).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('stuck jobs check failed: connection reset')
  })

  test('a queue that refuses the message gets the event put back as it was, so the next minute tries again', async () => {
    const log = quiet()
    const e = event()
    const { db, tables } = memory({ events: [e], tool_calls: [] })
    const requeue = vi.fn(async () => {
      throw new Error('queue is full')
    })
    await expect(checkStuckEvents(db, requeue, NOW)).resolves.toBe(0)
    expect(tables.events![0]).toMatchObject({ status: 'running', payload: e.payload })
    expect((tables.events![0]!.payload as Row).revived).toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('stuck jobs check failed: queue is full')
    // A minute later the queue works.
    const again = vi.fn(async () => {})
    expect(await checkStuckEvents(db, again, NOW)).toBe(1)
    expect(again).toHaveBeenCalledWith(e.id)
  })

  test('something that is not an Error is logged too', async () => {
    const log = quiet()
    const { db } = memory({ events: [event()], tool_calls: [] })
    await expect(
      checkStuckEvents(db, async () => {
        throw 'plain text'
      }, NOW),
    ).resolves.toBe(0)
    expect(String(log.mock.calls[0]![0])).toBe('stuck jobs check failed: plain text')
  })
})

describe('a model timeout counts as a transient failure', () => {
  test('the orchestrator and the model retry layer both treat it as one', () => {
    const err = new ModelTimeoutError(240_000)
    expect(err.message).toMatch(/timeout/)
    expect(isTransient(err)).toBe(true)
    expect(isRetryableModelError(err)).toBe(true)
  })

  test('a plain error is neither', () => {
    expect(isTransient(new Error('bad request'))).toBe(false)
    expect(isRetryableModelError(new Error('bad request'))).toBe(false)
  })
})
