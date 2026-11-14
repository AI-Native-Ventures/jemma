// @vitest-environment node
import { paperQuestions } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'
import { fakeDb, inFilter, type FakeDb } from './p89-fake-db'

// Closing a session names the topic that moved ("Adding fractions", the short label). It reads the labels of the topics of the learner's own
// classes only, not every topic of every school. The database, the signed-in learner and the agent are stand-ins.

let admin: FakeDb
const { shortSpy } = vi.hoisted(() => ({ shortSpy: vi.fn() }))

vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(async () => 'event') }))
vi.mock('@/lib/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/topics')>()),
  loadShortLabels: (client: unknown, scope?: { classIds: string[] }) => shortSpy(client, scope),
}))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => admin }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const row = table === 'sessions' ? session : { id: 'l1', topic_id: null, topic_name: 'Equivalent fractions', content: lesson, audio_path: null }
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }),
}))

import { finishSession } from '../app/k/session/[sessionId]/actions'

const lesson = { ...AMINA_LESSON, format: 'reading' as const, warmup: [] }
const session = { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Equivalent fractions', question_count: 5, right: null, minutes: null }

const fiveTries = () =>
  paperQuestions(lesson).map((index, i) => ({
    session_id: 's1',
    phase: 'try',
    position: i + 1,
    question: lesson.questions[index],
    answer: lesson.questions[index]!.answer,
    correct: true,
    difficulty: lesson.questions[index]!.difficulty,
    seconds: 0,
  }))

const gap = { stage: 'new', first_practised_at: null, fixed_at: null, topic_id: null, topic_name: 'Equivalent fractions', created_at: '2026-11-01', child_id: 'c1' }

beforeEach(() => {
  shortSpy.mockReset()
  shortSpy.mockImplementation(async () => (name: string) => `short:${name}`)
})

describe('finishSession and the short label of the topic that moved', () => {
  it("asks for the labels of the learner's own classes, once, with the service client, and names the topic with the label", async () => {
    admin = fakeDb({
      session_items: fiveTries(),
      gaps: [gap],
      enrolments: [
        { class_id: 'class-1', child_id: 'c1' },
        { class_id: 'class-2', child_id: 'c1' },
        { class_id: 'class-3', child_id: 'someone-else' },
      ],
    })
    const done = await finishSession('s1')
    expect(shortSpy.mock.calls).toEqual([[admin, { classIds: ['class-1', 'class-2'] }]])
    expect(done.stage).toEqual({ from: 'new', to: 'practising', topicName: 'short:Equivalent fractions' })
    // The classes are those of the child on the session, and nothing else is read for them but their ids.
    expect(admin.reads('enrolments')).toHaveLength(1)
    expect(admin.reads('enrolments')[0]!.ops).toContainEqual(['eq', 'child_id', 'c1'])
    expect(admin.reads('enrolments')[0]!.ops).toContainEqual(['select', 'class_id'])
    expect(admin.reads('topics')).toHaveLength(0)
    expect(inFilter(admin.reads('enrolments')[0]!, 'class_id')).toBeNull()
  })

  it('a learner in no class asks with no class: names as they are', async () => {
    admin = fakeDb({ session_items: fiveTries(), gaps: [gap], enrolments: [] })
    await finishSession('s1')
    expect(shortSpy.mock.calls).toEqual([[admin, { classIds: [] }]])
  })

  it('with no gap to move there is no label to draw, so nothing about classes or topics is read', async () => {
    admin = fakeDb({ session_items: fiveTries(), gaps: [], enrolments: [{ class_id: 'class-1', child_id: 'c1' }] })
    const done = await finishSession('s1')
    expect(done.stage).toBeNull()
    expect(shortSpy).not.toHaveBeenCalled()
    expect(admin.reads('enrolments')).toHaveLength(0)
  })
})
