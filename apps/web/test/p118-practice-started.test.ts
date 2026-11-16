// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// P118: a learner who taps Start the moment the practice appears, and finishes it, must not see "Jemma could not write your practice" because the
// agent's own check of its work failed a moment later. The newest practice.requested event is read once (`newestPracticeEvent`); a failed one is
// told as done when this learner already has a session for today or earlier, of any status, whose lesson was written after the event. Every screen
// (the home, "My maths", the "Try again" action) reads the event through it. The database is a stand-in: no network, no model.

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, reads: [] as string[], broken: false }))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => {
  // The calls the loader makes, and what the database does with them: eq (also `payload->>childId`), in, lte, gte, order, limit.
  const valueOf = (r: Row, key: string): unknown => {
    const [column, ...path] = key.split('->>')
    return path.reduce<unknown>((v, field) => (v && typeof v === 'object' ? (v as Row)[field] : undefined), r[column!])
  }
  const from = (table: string) => {
    if (state.broken) throw new Error('database down')
    state.reads.push(table)
    const filters: ((r: Row) => boolean)[] = []
    let sort: { key: string; ascending: boolean } | null = null
    let max = Infinity
    const answer = () => {
      const hit = (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const ordered = sort ? [...hit].sort((a, b) => (String(a[sort!.key]) < String(b[sort!.key]) ? -1 : 1) * (sort!.ascending ? 1 : -1)) : hit
      return ordered.slice(0, max)
    }
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (key: string, value: unknown) => (filters.push((r) => valueOf(r, key) === value), q),
      in: (key: string, values: unknown[]) => (filters.push((r) => values.includes(r[key])), q),
      lte: (key: string, value: string) => (filters.push((r) => String(r[key]) <= value), q),
      gte: (key: string, value: string) => (filters.push((r) => String(r[key]) >= value), q),
      order: (key: string, o?: { ascending?: boolean }) => ((sort = { key, ascending: o?.ascending ?? true }), q),
      limit: (n: number) => ((max = n), q),
      maybeSingle: async () => ({ data: answer()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: answer(), error: null }).then(resolve, reject),
    }
    return q
  }
  return { createSupabaseAdmin: () => ({ from }) }
})

import { newestPracticeEvent, practiceState } from '../lib/data/p27'

const CHILD = 'db0a2ff1-8daf-473e-b9a0-2a403c50e9ca'
const OTHER = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-11-16T09:30:00.000Z')
const TODAY = '2026-11-16'
const ASKED = '2026-11-16T09:18:18.000Z'
const BEFORE = '2026-11-16T06:00:00.000Z'
const AFTER = '2026-11-16T09:19:17.000Z'
const withQuestions = { questions: [{ n: 1 }] }

const event = (status: string, over: Row = {}): Row => ({ id: 'e1', type: 'practice.requested', status, payload: { childId: CHILD }, created_at: ASKED, ...over })
const session = (status: string, at: string, over: Row = {}): Row => ({ id: 's1', child_id: CHILD, lesson_id: 'l1', status, planned_for: TODAY, created_at: at, ...over })
const lesson = (at: string, over: Row = {}): Row => ({ id: 'l1', child_id: CHILD, content: withQuestions, created_at: at, ...over })

function world(tables: Record<string, Row[]>) {
  state.tables = { events: [], sessions: [], lessons: [], ...tables }
  state.reads = []
  state.broken = false
}
const home = async () => {
  const newest = await newestPracticeEvent(CHILD, NOW)
  return { newest, practice: practiceState({ event: newest?.status ?? null, session: false, canPractise: true }) }
}

describe('a failed practice the learner already started or finished (P118)', () => {
  it('a session done, its lesson written after the event: the event is told as done and the home never says "failed"', async () => {
    world({ events: [event('failed')], sessions: [session('done', AFTER)], lessons: [lesson(AFTER)] })
    expect(await home()).toEqual({ newest: { id: 'e1', status: 'done' }, practice: 'ready' })
  })

  it('a session started and not finished, the same', async () => {
    world({ events: [event('failed')], sessions: [session('in_progress', AFTER)], lessons: [lesson(AFTER)] })
    expect((await home()).newest).toEqual({ id: 'e1', status: 'done' })
  })

  it('the lesson or the session made after the event is enough, each alone', async () => {
    world({ events: [event('failed')], sessions: [session('done', BEFORE)], lessons: [lesson(AFTER)] })
    expect((await home()).newest!.status).toBe('done')
    world({ events: [event('failed')], sessions: [session('done', AFTER)], lessons: [lesson(BEFORE)] })
    expect((await home()).newest!.status).toBe('done')
  })

  it('a session planned for an earlier day counts, as it does for the agent', async () => {
    world({ events: [event('failed')], sessions: [session('done', AFTER, { planned_for: '2026-11-12' })], lessons: [lesson(AFTER)] })
    expect((await home()).newest!.status).toBe('done')
  })
})

describe('a failed practice that nothing started is still failed, as today (P118)', () => {
  it('only older sessions: failed, and the home says so', async () => {
    world({ events: [event('failed')], sessions: [session('done', BEFORE)], lessons: [lesson(BEFORE)] })
    expect(await home()).toEqual({ newest: { id: 'e1', status: 'failed' }, practice: 'failed' })
  })

  it('no session at all: failed', async () => {
    world({ events: [event('failed')] })
    expect(await home()).toEqual({ newest: { id: 'e1', status: 'failed' }, practice: 'failed' })
  })

  it('a session planned for a later day, a lesson with no questions, a session with no lesson, or another learner\'s session: failed', async () => {
    const cases: Record<string, Row[]>[] = [
      { sessions: [session('done', AFTER, { planned_for: '2026-11-17' })], lessons: [lesson(AFTER)] },
      { sessions: [session('done', AFTER)], lessons: [lesson(AFTER, { content: {} })] },
      { sessions: [session('done', AFTER)], lessons: [lesson(AFTER, { content: { questions: [] } })] },
      { sessions: [session('done', AFTER, { lesson_id: null })], lessons: [] },
      { sessions: [session('done', AFTER, { child_id: OTHER })], lessons: [lesson(AFTER, { child_id: OTHER })] },
    ]
    for (const c of cases) {
      world({ events: [event('failed')], ...c })
      expect((await home()).newest!.status).toBe('failed')
    }
  })
})

describe('the other states are read as they always were (P118)', () => {
  it.each(['queued', 'running', 'done', 'cancelled'])('%s: handed back as it is, and no session is looked at', async (status) => {
    world({ events: [event(status)], sessions: [session('done', AFTER)], lessons: [lesson(AFTER)] })
    expect(await newestPracticeEvent(CHILD, NOW)).toEqual({ id: 'e1', status })
    expect(state.reads).toEqual(['events'])
  })

  it('the newest event of this learner is the one that counts, and another learner\'s is never read', async () => {
    world({
      events: [event('failed', { id: 'old', created_at: BEFORE }), event('running', { id: 'new', created_at: AFTER }), event('failed', { id: 'theirs', payload: { childId: OTHER }, created_at: '2026-11-16T09:25:00.000Z' })],
      sessions: [session('done', AFTER)],
      lessons: [lesson(AFTER)],
    })
    expect(await newestPracticeEvent(CHILD, NOW)).toEqual({ id: 'new', status: 'running' })
  })

  it('no event: null. A database that cannot be read: null, so the home never waits on it', async () => {
    world({})
    expect(await newestPracticeEvent(CHILD, NOW)).toBeNull()
    world({ events: [event('failed')] })
    state.broken = true
    expect(await newestPracticeEvent(CHILD, NOW)).toBeNull()
  })
})
