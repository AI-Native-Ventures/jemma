// @vitest-environment node
import { paperQuestions } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'
import { missedOf, type StoredItem } from '../app/k/session/[sessionId]/logic'
import { progressOf } from '../app/k/session/[sessionId]/paper'

// Where a practice answered on paper stands: the pure rule, what the lesson hands the screen (the five questions without answers), the
// states `beginSession` and `paperProgress` answer, and the results of a paper answer that Jemma could not read. The database and the
// signed-in learner are stand-ins.

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  lesson: null as unknown,
  items: [] as Record<string, unknown>[],
  snaps: [] as { id: string; status: string }[],
  /** The learner's gaps, as the database holds them now (after the agent moved one, when it did). */
  gaps: [] as Record<string, unknown>[],
  /** Rows of `format_trials` for the session: the agent writes one when it applies a finished session to the profile. */
  trials: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(async () => 'event') }))
vi.mock('@/lib/topics', () => ({ loadShortLabels: async () => (name: string) => name }))
vi.mock('@/lib/data/p27', () => ({ myChild: async () => ({ supabase: {}, child: { id: 'c1' } }) }))
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
vi.mock('@/lib/supabase/admin', () => {
  /** A query that answers `data` however it is chained. */
  const answer = (data: unknown): unknown => {
    const chain: unknown = new Proxy(() => undefined, {
      get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => unknown) => resolve({ data, error: null }) : () => chain),
    })
    return chain
  }
  return {
    createSupabaseAdmin: () => ({
      from: (table: string) => {
        if (table === 'session_items') return answer(state.items)
        if (table === 'events') return answer(state.snaps)
        if (table === 'format_trials') return answer(state.trials)
        if (table === 'gaps') {
          // `.neq('stage', 'fixed')` drops the fixed ones, as the database does
          let rows = state.gaps
          const chain: Record<string, unknown> = {
            select: () => chain,
            eq: () => chain,
            neq: (_column: string, value: string) => ((rows = rows.filter((g) => g.stage !== value)), chain),
            then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
          }
          return chain
        }
        if (table === 'sessions') {
          const reads = answer([]) as Record<string | symbol, unknown>
          return new Proxy(reads, { get: (_t, prop) => (prop === 'update' ? () => answer(null) : reads[prop]) })
        }
        return answer([])
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    }),
  }
})

import { beginSession, finishSession, paperProgress } from '../app/k/session/[sessionId]/actions'

const lesson = { ...AMINA_LESSON, format: 'reading' as const, warmup: [] }
const baseSession = { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Equivalent fractions', question_count: 5, right: null, minutes: null }

/** The five try answers a paper read stores, the third one unread. */
const fiveTries = (unreadAt: number[] = []): Row[] =>
  paperQuestions(lesson).map((index, i) => ({
    session_id: 's1',
    phase: 'try',
    position: i + 1,
    question: unreadAt.includes(i + 1) ? { ...lesson.questions[index]!, unread: true } : lesson.questions[index],
    answer: unreadAt.includes(i + 1) ? '' : lesson.questions[index]!.answer,
    correct: !unreadAt.includes(i + 1),
    difficulty: lesson.questions[index]!.difficulty,
    seconds: 0,
  }))

beforeEach(() => {
  state.lesson = lesson
  state.session = { ...baseSession }
  state.items = []
  state.snaps = []
  state.gaps = []
  state.trials = []
})

describe('progressOf', () => {
  it('no photo was sent: none', () => {
    expect(progressOf({ status: 'in_progress' }, null)).toBe('none')
    expect(progressOf({ status: 'done' }, null)).toBe('none')
  })

  it('a photo that is queued or running is being read', () => {
    for (const status of ['queued', 'running']) expect(progressOf({ status: 'in_progress' }, { id: 'e', status })).toBe('reading')
  })

  it('a photo whose event failed, or was cancelled, or ended without closing the session, is failed', () => {
    for (const status of ['failed', 'cancelled', 'done']) expect(progressOf({ status: 'in_progress' }, { id: 'e', status }), status).toBe('failed')
  })

  it('a closed session is done, whatever its event says: the answers are in', () => {
    for (const status of ['queued', 'running', 'failed', 'done']) expect(progressOf({ status: 'done' }, { id: 'e', status }), status).toBe('done')
  })
})

describe('beginSession hands the screen the paper questions', () => {
  it('the five questions of paperQuestions, numbered 1 to 5, and nothing of the key', async () => {
    const { lesson: handed, paper } = await beginSession('s1')
    expect(paper).toBe('none')
    expect(handed.paper).toHaveLength(5)
    expect(handed.paper!.map((q) => q.prompt)).toEqual(paperQuestions(lesson).map((i) => lesson.questions[i]!.prompt))
    expect(handed.paper!.map((q) => [q.index, q.of, q.phase])).toEqual([1, 2, 3, 4, 5].map((n) => [n, 5, 'try']))
    const text = JSON.stringify(handed.paper)
    for (const key of ['"answer"', '"why"', '"rightWay"']) expect(text, key).not.toContain(key)
  })
})

describe('beginSession and paperProgress say where a paper answer stands', () => {
  it('a photo being read, a photo that failed, none sent', async () => {
    expect((await beginSession('s1')).paper).toBe('none')
    expect(await paperProgress('s1')).toBe('none')
    state.snaps = [{ id: 'e1', status: 'running' }]
    expect((await beginSession('s1')).paper).toBe('reading')
    expect(await paperProgress('s1')).toBe('reading')
    state.snaps = [{ id: 'e1', status: 'failed' }]
    expect((await beginSession('s1')).paper).toBe('failed')
    expect(await paperProgress('s1')).toBe('failed')
  })

  it('a session closed after a photo was read is handed back, with nothing left to ask, so its results are shown', async () => {
    state.session = { ...baseSession, status: 'done', right: 5, minutes: 9 }
    state.items = fiveTries()
    state.snaps = [{ id: 'e1', status: 'running' }]
    const begun = await beginSession('s1')
    expect(begun.paper).toBe('done')
    expect(begun.lesson.first).toBeNull()
    expect(await paperProgress('s1')).toBe('done')
  })

  it('a session finished on the screen is still refused, as it always was', async () => {
    state.session = { ...baseSession, status: 'done' }
    await expect(beginSession('s1')).rejects.toThrow('This session is finished')
  })

  it('a session that is not the learner\'s is not found', async () => {
    state.session = null as unknown as Record<string, unknown>
    await expect(paperProgress('s1')).rejects.toThrow('Session not found')
  })
})

describe('the results of a paper answer that could not be read', () => {
  const item = (position: number, over: Partial<StoredItem> = {}): StoredItem => ({
    phase: 'try',
    position,
    question: lesson.questions[position - 1]!,
    answer: '1/2',
    correct: false,
    difficulty: 1,
    seconds: 0,
    ...over,
  })

  it('an unread answer is missed, shows no answer, and is marked unread', () => {
    const [missed] = missedOf([item(1, { answer: '', unread: true })])
    expect(missed).toMatchObject({ n: 1, wrote: '', unread: true })
  })

  it('a wrong answer that was read is as it always was, with no flag', () => {
    const [missed] = missedOf([item(1)])
    expect(missed).toMatchObject({ n: 1, wrote: '1/2' })
    expect(missed).not.toHaveProperty('unread')
  })

  it('finishSession reads the flag from the stored question and hands the missed ones back', async () => {
    state.session = { ...baseSession, status: 'done', right: 4, minutes: 9 }
    state.items = fiveTries([3])
    state.snaps = [{ id: 'e1', status: 'done' }]
    const done = await finishSession('s1')
    expect(done.missed.map((m) => [m.n, m.wrote, m.unread])).toEqual([[3, '', true]])
    expect(done.minutes).toBe(9)
  })
})

describe('the progress after a paper answer, whether or not the agent has already moved the gap', () => {
  // The session was closed at 15:00:00. The agent follows the read at once, so by the time the child sees the results it may have applied the
  // session to the profile (a `format_trials` row says so), moving the gap at 15:00:01.
  const CLOSED = '2026-11-14T15:00:00.000Z'
  const LATER = '2026-11-14T15:00:01.000Z'
  const EARLIER = '2026-11-10T09:00:00.000Z'
  const gap = (over: Record<string, unknown>) => ({ topic_id: null, topic_name: 'Equivalent fractions', created_at: '2026-11-01T09:00:00.000Z', stage: 'new', first_practised_at: null, fixed_at: null, ...over })

  beforeEach(() => {
    state.session = { ...baseSession, status: 'done', right: 4, minutes: 9, finished_at: CLOSED }
    state.items = fiveTries()
    state.snaps = [{ id: 'e1', status: 'running' }]
  })

  it('not applied yet: the move is worked out from the gap as it is, as on the screen', async () => {
    state.gaps = [gap({ stage: 'new' })]
    expect((await finishSession('s1')).stage).toEqual({ from: 'new', to: 'practising', topicName: 'Equivalent fractions' })
  })

  it('not applied yet: a fixed gap is not counted', async () => {
    state.gaps = [gap({ stage: 'fixed', fixed_at: EARLIER })]
    expect((await finishSession('s1')).stage).toBeNull()
  })

  it('applied, a new gap that this session moved to Practising: moved, not kept', async () => {
    state.trials = [{ id: 't1' }]
    state.gaps = [gap({ stage: 'practising', first_practised_at: LATER })]
    expect((await finishSession('s1')).stage).toEqual({ from: 'new', to: 'practising', topicName: 'Equivalent fractions' })
  })

  it('applied, a gap that was already Practising and stays: kept', async () => {
    state.trials = [{ id: 't1' }]
    state.gaps = [gap({ stage: 'practising', first_practised_at: EARLIER })]
    expect((await finishSession('s1')).stage).toEqual({ from: 'practising', to: 'practising', topicName: 'Equivalent fractions' })
  })

  it('applied, a gap that this session fixed: fixed (the screen must not lose it because the gap is fixed now)', async () => {
    state.trials = [{ id: 't1' }]
    state.gaps = [gap({ stage: 'fixed', first_practised_at: EARLIER, fixed_at: LATER })]
    expect((await finishSession('s1')).stage).toEqual({ from: 'practising', to: 'fixed', topicName: 'Equivalent fractions' })
  })

  it('applied, a gap that was fixed long before this session: nothing moved', async () => {
    state.trials = [{ id: 't1' }]
    state.gaps = [gap({ stage: 'fixed', first_practised_at: EARLIER, fixed_at: EARLIER })]
    expect((await finishSession('s1')).stage).toBeNull()
  })

  it('applied, no gap on this topic: no stage line', async () => {
    state.trials = [{ id: 't1' }]
    state.gaps = [gap({ topic_name: 'Something else', stage: 'practising', first_practised_at: LATER })]
    expect((await finishSession('s1')).stage).toBeNull()
  })
})
