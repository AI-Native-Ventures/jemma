// @vitest-environment node
import { paperQuestions } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'

// `snapPractice`: a learner sends one photo of a practice answered on paper. The database, the signed-in learner, storage and the agent are
// stand-ins: the point is who may send, when, what is stored where, and the event that is sent.

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  who: 'learner' as 'learner' | 'teacher',
  /** The child the signed-in person is (their own, or the one a parent handed the phone to). */
  childId: 'c1',
  session: { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Equivalent fractions', question_count: 5, right: null, minutes: null } as Row,
  lesson: null as unknown,
  items: [] as Row[],
  /** The `practice.snapped` events of the session, newest first. */
  snaps: [] as { id: string; status: string }[],
  uploads: [] as { bucket: string; path: string; type: string; size: number }[],
  uploadError: null as string | null,
  sessionPatches: [] as Row[],
  closed: [] as { patch: Row; filters: string[] }[],
  sent: [] as { type: string; payload: Row }[],
  sendFails: false,
}))

vi.mock('@/lib/agent', () => ({
  sendEvent: vi.fn(async (type: string, payload: Row) => {
    if (state.sendFails) throw new Error('agent /events answered 502')
    state.sent.push({ type, payload })
    return 'event-1'
  }),
}))
vi.mock('@/lib/topics', () => ({ loadShortLabels: async () => (name: string) => name }))
vi.mock('@/lib/data/p27', () => ({
  myChild: async () => {
    // a teacher (or anyone who is not a learner, and has no hand-over) is sent to "not found" by the real function
    if (state.who === 'teacher') throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    return { supabase: {}, child: { id: state.childId } }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const row = table === 'sessions' ? state.session : { id: 'l1', topic_id: null, topic_name: 'Equivalent fractions', content: state.lesson, audio_path: null }
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'session_items') return { select: () => ({ eq: async () => ({ data: state.items, error: null }) }) }
      if (table === 'children') return { select: () => ({ eq: () => ({ single: async () => ({ data: { school_id: 'school-1' }, error: null }) }) }) }
      if (table === 'sessions') return { update: (patch: Row) => ({ eq: async () => (state.sessionPatches.push(patch), { error: null }) }) }
      if (table === 'events') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: state.snaps, error: null }) }) }) }) }),
          update: (patch: Row) => {
            const filters: string[] = []
            const chain: Record<string, unknown> = {
              eq: (k: string, v: unknown) => (filters.push(`${k}=${String(v)}`), chain),
              gte: async () => (state.closed.push({ patch, filters }), { error: null }),
            }
            return chain
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: File) => {
          if (state.uploadError) return { error: { message: state.uploadError } }
          state.uploads.push({ bucket, path, type: file.type, size: file.size })
          return { error: null }
        },
      }),
    },
  }),
}))

import { snapPractice } from '../app/k/session/[sessionId]/actions'

const photo = (over: { name?: string; type?: string; bytes?: number } = {}) => new File([new Uint8Array(over.bytes ?? 2000)], over.name ?? 'answers.jpg', { type: over.type ?? 'image/jpeg' })
const tryItem = (position: number): Row => ({ session_id: 's1', phase: 'try', position, question: AMINA_LESSON.questions[0], answer: '1', correct: true, difficulty: 1, seconds: 3 })
const nothingHappened = () => {
  expect(state.uploads).toEqual([])
  expect(state.sent).toEqual([])
  expect(state.sessionPatches).toEqual([])
}

beforeEach(() => {
  state.who = 'learner'
  state.childId = 'c1'
  state.session = { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Equivalent fractions', question_count: 5, right: null, minutes: null }
  state.lesson = { ...AMINA_LESSON, warmup: [] }
  state.items = []
  state.snaps = []
  state.uploads = []
  state.uploadError = null
  state.sessionPatches = []
  state.closed = []
  state.sent = []
  state.sendFails = false
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('a learner sends one photo', () => {
  it('stores it in the private papers bucket under the learner, and sends the event with its path and the five question indexes', async () => {
    expect(await snapPractice('s1', [photo()])).toEqual({ ok: true })
    expect(state.uploads).toHaveLength(1)
    expect(state.uploads[0]).toMatchObject({ bucket: 'papers', type: 'image/jpeg', size: 2000 })
    expect(state.uploads[0]!.path).toMatch(/^school-1\/c1\/practice\/s1-\d+\.jpg$/)
    expect(state.sent).toHaveLength(1)
    const [event] = state.sent
    expect(event).toMatchObject({ type: 'practice.snapped', payload: { sessionId: 's1', path: state.uploads[0]!.path } })
    expect(event!.payload.questions).toEqual(paperQuestions(AMINA_LESSON))
    expect(event!.payload.questions).toHaveLength(5)
  })

  it('a session that is planned becomes in progress, one that is already running is left alone', async () => {
    state.session = { ...state.session, status: 'planned' }
    await snapPractice('s1', [photo()])
    expect(state.sessionPatches).toEqual([{ status: 'in_progress' }])
    state.sessionPatches = []
    state.session = { ...state.session, status: 'in_progress' }
    await snapPractice('s1', [photo()])
    expect(state.sessionPatches).toEqual([])
  })

  it('the question indexes are the rule of paperQuestions, in order, whatever the lesson holds', async () => {
    const shuffled = [...AMINA_LESSON.questions].reverse()
    state.lesson = { ...AMINA_LESSON, warmup: [], questions: shuffled }
    await snapPractice('s1', [photo()])
    expect(state.sent[0]!.payload.questions).toEqual(paperQuestions({ questions: shuffled }))
  })

  it('a second tap while the first photo is being read makes no second photo and no second event', async () => {
    for (const status of ['queued', 'running']) {
      state.snaps = [{ id: 'e1', status }]
      expect(await snapPractice('s1', [photo()])).toEqual({ ok: true })
    }
    nothingHappened()
  })

  it('after a photo that could not be read, a new photo is taken', async () => {
    state.snaps = [{ id: 'e1', status: 'failed' }]
    expect(await snapPractice('s1', [photo()])).toEqual({ ok: true })
    expect(state.sent).toHaveLength(1)
  })
})

describe('who may send', () => {
  it('a teacher, or anyone who is not this learner, is refused by the learner check and nothing is stored', async () => {
    state.who = 'teacher'
    await expect(snapPractice('s1', [photo()])).rejects.toThrow()
    nothingHappened()
  })

  it("another learner's session is refused", async () => {
    state.childId = 'c2'
    await expect(snapPractice('s1', [photo()])).rejects.toThrow('Session not found')
    nothingHappened()
  })

  it('a parent whose phone was handed over is the child the cookie names: the same session is accepted', async () => {
    // myChild answers the child of the hand-over cookie
    state.childId = 'c1'
    expect(await snapPractice('s1', [photo()])).toEqual({ ok: true })
    expect(state.uploads[0]!.path).toMatch(/^school-1\/c1\/practice\//)
  })
})

describe('what may be sent', () => {
  it('a session with a try answer is refused: it was answered on the screen', async () => {
    state.items = [tryItem(1)]
    expect(await snapPractice('s1', [photo()])).toMatchObject({ ok: false })
    nothingHappened()
  })

  it('a session that is done is refused', async () => {
    state.session = { ...state.session, status: 'done' }
    expect(await snapPractice('s1', [photo()])).toMatchObject({ ok: false })
    nothingHappened()
  })

  it('warm-up answers are not try answers: the photo is accepted', async () => {
    state.items = [{ ...tryItem(1), phase: 'warmup' }]
    expect(await snapPractice('s1', [photo()])).toEqual({ ok: true })
  })

  it('more than one file is refused, and so is none', async () => {
    expect(await snapPractice('s1', [photo(), photo()])).toMatchObject({ ok: false })
    expect(await snapPractice('s1', [])).toMatchObject({ ok: false })
    expect(await snapPractice('s1', [new File([], 'empty.jpg', { type: 'image/jpeg' })])).toMatchObject({ ok: false })
    nothingHappened()
  })

  it('a file that is not an image, or is too big, is refused', async () => {
    expect(await snapPractice('s1', [photo({ type: 'application/pdf', name: 'answers.pdf' })])).toMatchObject({ ok: false })
    expect(await snapPractice('s1', [photo({ bytes: 4_000_001 })])).toMatchObject({ ok: false })
    nothingHappened()
  })

  it('a lesson that cannot put five questions on paper is refused', async () => {
    state.lesson = { ...AMINA_LESSON, warmup: [], questions: AMINA_LESSON.questions.filter((q) => q.difficulty !== 3) }
    // not a valid lesson any more: the lesson cannot be loaded, so nothing is sent either way
    await expect(snapPractice('s1', [photo()])).rejects.toThrow()
    nothingHappened()
  })
})

describe('when something goes wrong', () => {
  it('the photo could not be saved: a plain message, and no event', async () => {
    state.uploadError = 'bucket not found: school-1/secret-path'
    const res = await snapPractice('s1', [photo()])
    expect(res).toMatchObject({ ok: false })
    expect(JSON.stringify(res)).not.toContain('secret-path')
    expect(state.sent).toEqual([])
  })

  it('Jemma could not be reached: the queued event is closed as failed at once, so the screen shows the retry, and the learner is told', async () => {
    state.sendFails = true
    const res = await snapPractice('s1', [photo()])
    expect(res).toMatchObject({ ok: false, message: expect.stringContaining('could not be reached') })
    expect(state.closed).toHaveLength(1)
    expect(state.closed[0]!.patch).toMatchObject({ status: 'failed' })
    expect(state.closed[0]!.filters).toEqual(expect.arrayContaining(['type=practice.snapped', 'status=queued', 'payload->>sessionId=s1']))
  })
})
