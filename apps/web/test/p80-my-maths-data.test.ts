// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// What "My maths" asks for and what it says may be offered. The learner, their sessions, the newest practice event and the count are stand-ins:
// no database, no browser.

const state = vi.hoisted(() => ({
  tonight: null as unknown,
  event: null as { id: string; status: string } | null,
  maths: { subject: 'Mathematics', strands: [], gaps: [], suggestions: [] } as unknown,
  asked: [] as unknown[],
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({}) }))
vi.mock('../lib/data/p27', () => ({
  myChild: async () => ({ supabase: {}, child: { id: 'child-1', first_name: 'amina' } }),
  loadLearnerSessions: async () => [],
  newestPracticeEvent: async () => state.event,
  tonightFrom: async (_s: unknown, _sessions: unknown, asked: unknown) => (state.asked.push(asked), state.tonight),
  myMathsOf: async (childId: string) => (state.asked.push(childId), state.maths),
}))

import { getMyMaths, mathsStatus } from '../lib/data/p80'

beforeEach(() => {
  state.tonight = null
  state.event = null
  state.asked = []
})

describe('mathsStatus', () => {
  it('a session due wins, then a practice being written, else free', () => {
    expect(mathsStatus({ event: null, due: false })).toBe('free')
    expect(mathsStatus({ event: 'done', due: false })).toBe('free')
    expect(mathsStatus({ event: 'failed', due: false })).toBe('free')
    expect(mathsStatus({ event: 'cancelled', due: false })).toBe('free')
    expect(mathsStatus({ event: 'queued', due: false })).toBe('writing')
    expect(mathsStatus({ event: 'running', due: false })).toBe('writing')
    for (const event of [null, 'done', 'failed', 'queued', 'running']) expect(mathsStatus({ event, due: true })).toBe('due')
  })
})

describe('getMyMaths', () => {
  it('answers the learner\'s first name and initial, the count for this learner, and what may be offered', async () => {
    const view = await getMyMaths()
    expect(view).toEqual({ firstName: 'amina', initial: 'A', maths: state.maths, status: 'free' })
    expect(state.asked).toContain('child-1')
  })

  it('a session due tonight says due, a practice being written says writing', async () => {
    state.tonight = { sessionId: 's1' }
    expect((await getMyMaths()).status).toBe('due')
    state.tonight = null
    state.event = { id: 'e1', status: 'queued' }
    expect((await getMyMaths()).status).toBe('writing')
  })

  it('asks for tonight\'s session with the newest practice event, so a lesson that is still empty is not offered while it is written', async () => {
    state.event = { id: 'e1', status: 'running' }
    await getMyMaths()
    expect(state.asked).toContainEqual({ id: 'e1', status: 'running' })
  })
})
