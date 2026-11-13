// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Try the same photo again" on the card that says the memo could not be read. It takes no file. It asks the same ownership questions as
// the other actions of the snap screens, and it puts the newest `key.snapped` event of the test back to the queue only when that event
// ended failed. The teacher's session and the service client are stand-ins; nothing reaches a database.

const state = vi.hoisted(() => ({ owns: true, events: [] as { id: string; status: string }[], eventsError: null as string | null, adminReads: [] as string[][] }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'teacher-a', profile: {} }) }))
vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(), retryEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    from: (table: string) => {
      const row = table === 'classes' ? { id: 'cls', school_id: 'sch' } : { id: 'tst', title: 'Class Test 1', out_of: 20 }
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: state.owns ? row : null, error: null }) }
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      const asked: string[] = [table]
      state.adminReads.push(asked)
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => (asked.push(`${key}=${String(value)}`), chain),
        order: () => chain,
        limit: async () => (state.eventsError ? { data: null, error: { message: state.eventsError } } : { data: state.events, error: null }),
      }
      return chain
    },
  }),
}))

import { revalidatePath } from 'next/cache'
import { retryEvent } from '@/lib/agent'
import { retryKey } from '../app/t/[classId]/snap/actions'

beforeEach(() => {
  state.owns = true
  state.events = []
  state.eventsError = null
  state.adminReads = []
  vi.mocked(retryEvent).mockClear()
  vi.mocked(revalidatePath).mockClear()
})

describe('retryKey', () => {
  it('puts the newest key.snapped event of the test back to the queue when it ended failed, and refreshes the key screen', async () => {
    state.events = [{ id: 'ev-new', status: 'failed' }]
    expect(await retryKey('cls', 'tst')).toEqual({ ok: true })
    expect(retryEvent).toHaveBeenCalledTimes(1)
    expect(retryEvent).toHaveBeenCalledWith('ev-new')
    expect(revalidatePath).toHaveBeenCalledWith('/t/cls/snap/tst/key')
    // It asked for the events of this test and no other: the type and the test are both named.
    const asked = state.adminReads.find((r) => r[0] === 'events')!
    expect(asked).toContain('type=key.snapped')
    expect(asked).toContain('payload->>testId=tst')
  })

  it('does nothing when there is no event', async () => {
    expect(await retryKey('cls', 'tst')).toEqual({ ok: true })
    expect(retryEvent).not.toHaveBeenCalled()
  })

  it('does nothing when the newest event is not failed (it was asked for already, or it is running)', async () => {
    for (const status of ['queued', 'running', 'done', 'cancelled']) {
      state.events = [{ id: 'ev-new', status }]
      expect(await retryKey('cls', 'tst')).toEqual({ ok: true })
    }
    expect(retryEvent).not.toHaveBeenCalled()
  })

  it('a teacher who does not teach the class is refused, and nothing is read or written', async () => {
    state.owns = false
    const answer = await retryKey('cls', 'tst')
    expect(answer).toMatchObject({ ok: false })
    expect(retryEvent).not.toHaveBeenCalled()
    expect(state.adminReads.filter((r) => r[0] === 'events')).toEqual([])
  })

  it('a read that fails is answered in plain words and nothing is retried', async () => {
    state.eventsError = 'the pool is full'
    expect(await retryKey('cls', 'tst')).toEqual({ ok: false, message: 'the pool is full' })
    expect(retryEvent).not.toHaveBeenCalled()
  })
})
