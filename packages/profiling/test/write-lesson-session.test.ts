import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ToolContext } from '../src/tools/context'

// write_lesson writes for the session the step names (`ids.sessionId`): a learner who chose what to practise has that session planned for
// today next to a session planned for a later day, and the latest planned session is the wrong one. Without a session id nothing changes.
// The context tool is a double that records what it was asked: no database, no model.

const asked = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock('../src/tools/read/get-child-context', () => ({
  getChildContext: {
    run: vi.fn(async (_ctx: unknown, input: unknown) => {
      asked.calls.push(input)
      return { profile: {}, gaps: [], formatTrials: [], session: null }
    }),
  },
}))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

import { runJobWriteLesson } from '../src/jobs/cloud/write-lesson'

const ctx = { db: {}, schoolId: 's', eventId: null, env: {}, now: () => new Date() } as unknown as ToolContext

beforeEach(() => {
  asked.calls = []
})

describe('runJobWriteLesson', () => {
  test('asks for the session the step names, by id', async () => {
    await runJobWriteLesson(ctx, 'e1', { childId: 'c1', sessionId: 's-today' })
    expect(asked.calls).toEqual([{ childId: 'c1', sessionId: 's-today' }])
  })

  test('without a session id it asks as it always did: the latest planned session', async () => {
    await runJobWriteLesson(ctx, 'e1', { childId: 'c1' })
    expect(asked.calls).toEqual([{ childId: 'c1', sessionId: undefined }])
  })

  test('with no planned session it writes nothing and does not fail', async () => {
    await expect(runJobWriteLesson(ctx, 'e1', { childId: 'c1', sessionId: 's-gone' })).resolves.toBeUndefined()
  })
})
