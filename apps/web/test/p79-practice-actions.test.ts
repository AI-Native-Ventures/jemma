// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Practise now" and "Try again" on the learner's home. The learner is found the way the learner's screens find them (a stand-in here), the
// events are a list, and the agent is a double. Both actions answer the app's ActionResult and never throw to the screen.

const state = vi.hoisted(() => ({
  childId: 'child-1',
  /** The events of this learner, newest first. */
  events: [] as { id: string; status: string }[],
  who: 'ok' as 'ok' | 'nobody',
  updates: [] as { patch: Record<string, unknown>; filters: string[] }[],
  sendFails: false,
  retryFails: false,
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({}) }))
vi.mock('@/lib/agent', () => ({
  sendEvent: vi.fn(async () => {
    if (state.sendFails) throw new Error('agent /events answered 502')
    return 'new-event'
  }),
  retryEvent: vi.fn(async () => {
    if (state.retryFails) throw new Error('agent /events answered 502')
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: string[] = [table]
      let patch: Record<string, unknown> | null = null
      const chain = {
        select: () => chain,
        update: (p: Record<string, unknown>) => ((patch = p), chain),
        eq: (key: string, value: unknown) => (filters.push(`${key}=${String(value)}`), chain),
        gte: (key: string) => (filters.push(`${key}>=`), chain),
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown) => {
          if (patch) state.updates.push({ patch, filters })
          return Promise.resolve({ data: patch ? null : state.events, error: null }).then(resolve)
        },
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/data/p27', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/data/p27')>()),
  myChild: async () => {
    if (state.who === 'nobody') throw new Error('NEXT_NOT_FOUND')
    return { supabase: {}, child: { id: state.childId, first_name: 'Amina' } }
  },
}))

import { revalidatePath } from 'next/cache'
import { retryEvent, sendEvent } from '@/lib/agent'
import { retryPractice, startPractice } from '../app/k/actions'

beforeEach(() => {
  state.events = []
  state.who = 'ok'
  state.updates = []
  state.sendFails = false
  state.retryFails = false
  vi.mocked(sendEvent).mockClear()
  vi.mocked(retryEvent).mockClear()
  vi.mocked(revalidatePath).mockClear()
})

describe('startPractice', () => {
  it('asks for a practice for this learner, and refreshes the home', async () => {
    expect(await startPractice()).toEqual({ ok: true })
    expect(sendEvent).toHaveBeenCalledTimes(1)
    expect(sendEvent).toHaveBeenCalledWith('practice.requested', { childId: 'child-1' })
    expect(revalidatePath).toHaveBeenCalledWith('/k')
  })

  it('does nothing when a practice is already queued or running: no second event', async () => {
    for (const status of ['queued', 'running']) {
      state.events = [{ id: 'ev-1', status }]
      expect(await startPractice()).toEqual({ ok: true })
    }
    expect(sendEvent).not.toHaveBeenCalled()
    expect(retryEvent).not.toHaveBeenCalled()
  })

  it('a newest practice that is over (done, cancelled, failed) does not stop a new one', async () => {
    for (const status of ['done', 'cancelled', 'failed']) {
      state.events = [{ id: 'ev-1', status }]
      await startPractice()
    }
    expect(sendEvent).toHaveBeenCalledTimes(3)
  })

  it('when the agent cannot be told, the event is closed as failed so the home offers a retry, and the screen gets plain words', async () => {
    state.sendFails = true
    const answer = await startPractice()
    expect(answer).toEqual({ ok: false, message: 'Jemma could not be reached. Try again in a minute.' })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]!.patch).toMatchObject({ status: 'failed', error: 'agent /events answered 502' })
    expect(state.updates[0]!.filters).toEqual(expect.arrayContaining(['events', 'type=practice.requested', 'status=queued', 'payload->>childId=child-1']))
  })

  it('never throws: a learner that cannot be found is an answer, and nothing is sent', async () => {
    state.who = 'nobody'
    const answer = await startPractice()
    expect(answer).toMatchObject({ ok: false })
    expect(sendEvent).not.toHaveBeenCalled()
  })
})

describe('retryPractice', () => {
  it('puts the newest practice back when it failed, and sends no new event', async () => {
    state.events = [{ id: 'ev-failed', status: 'failed' }, { id: 'ev-older', status: 'failed' }]
    expect(await retryPractice()).toEqual({ ok: true })
    expect(retryEvent).toHaveBeenCalledTimes(1)
    expect(retryEvent).toHaveBeenCalledWith('ev-failed')
    expect(sendEvent).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/k')
  })

  it('starts a new practice when there is none to retry', async () => {
    expect(await retryPractice()).toEqual({ ok: true })
    expect(sendEvent).toHaveBeenCalledWith('practice.requested', { childId: 'child-1' })
    expect(retryEvent).not.toHaveBeenCalled()
  })

  it('starts a new practice when the newest is over and was not a failure', async () => {
    state.events = [{ id: 'ev-done', status: 'done' }, { id: 'ev-old-failed', status: 'failed' }]
    await retryPractice()
    expect(sendEvent).toHaveBeenCalledTimes(1)
    expect(retryEvent).not.toHaveBeenCalled()
  })

  it('does nothing when the newest is queued or running (it was asked for already)', async () => {
    for (const status of ['queued', 'running']) {
      state.events = [{ id: 'ev-1', status }]
      expect(await retryPractice()).toEqual({ ok: true })
    }
    expect(sendEvent).not.toHaveBeenCalled()
    expect(retryEvent).not.toHaveBeenCalled()
  })

  it('when the agent cannot be told again, the event is closed as failed once more and the screen gets plain words', async () => {
    state.events = [{ id: 'ev-failed', status: 'failed' }]
    state.retryFails = true
    expect(await retryPractice()).toEqual({ ok: false, message: 'Jemma could not be reached. Try again in a minute.' })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]!.patch).toMatchObject({ status: 'failed' })
    expect(state.updates[0]!.filters).toEqual(expect.arrayContaining(['id=ev-failed', 'status=queued']))
  })

  it('never throws', async () => {
    state.who = 'nobody'
    expect(await retryPractice()).toMatchObject({ ok: false })
  })
})
