import { describe, expect, test } from 'vitest'
import { MemoryStore } from '../src/ai/stores'
import type { ToolContext } from '../src/tools/context'
import { updateLearnerProfile } from '../src/tools/save/update-learner-profile'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// A practice is a session like any other, and it never opens and never reopens a gap. `update_learner_profile` (finishing a session) moves only
// an OPEN gap of the session's topic: a session on a fixed gap's topic and a session on a strand name move nothing. No database, no network.

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CHILD = '33333333-3333-4333-8333-333333333333'
const SESSION = '66666666-6666-4666-8666-666666666666'
const LESSON = '77777777-7777-4777-8777-777777777777'
const TOPIC = '55555555-5555-4555-8555-555555555551'
const NOW = new Date('2026-11-13T15:00:00.000Z')

type Row = Record<string, unknown>
const fixedGap: Row = { id: 'g-fixed', child_id: CHILD, topic_id: TOPIC, topic_name: 'Adding decimals', stage: 'fixed', first_practised_at: '2026-10-10T08:00:00Z', fixed_at: '2026-10-20T08:00:00Z', created_at: '2026-10-01T08:00:00Z', evidence: [] }
const otherOpen: Row = { id: 'g-open', child_id: CHILD, topic_id: null, topic_name: 'Angles', stage: 'practising', first_practised_at: '2026-11-01T08:00:00Z', fixed_at: null, created_at: '2026-10-05T08:00:00Z', evidence: [] }

function world(topic: { id: string | null; name: string }, gaps: Row[]): MemoryDb {
  return memoryDb({
    children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina' }],
    sessions: [{ id: SESSION, child_id: CHILD, lesson_id: LESSON, status: 'in_progress', right: 5, topic_id: topic.id, topic_name: topic.name, format: 'reading' }],
    lessons: [{ id: LESSON, child_id: CHILD, topic_id: topic.id, topic_name: topic.name, format: 'reading', content: { questions: [{ n: 1 }] } }],
    session_items: [{ session_id: SESSION, phase: 'try' }, { session_id: SESSION, phase: 'try' }, { session_id: SESSION, phase: 'try' }, { session_id: SESSION, phase: 'try' }, { session_id: SESSION, phase: 'try' }],
    topics: topic.id ? [{ id: topic.id, family: 'decimals', name: topic.name }] : [],
    format_trials: [],
    gaps,
    activity_log: [],
    tool_calls: [],
  })
}
const ctx = (db: MemoryDb): ToolContext => ({ db, schoolId: SCHOOL, eventId: null, env: { replayStore: new MemoryStore() }, now: () => NOW })
const finish = (db: MemoryDb) => updateLearnerProfile.run(ctx(db), { childId: CHILD, sessionId: SESSION })

describe('finishing a practice', () => {
  test('a session on the topic of a fixed gap moves no gap: the gap stays fixed, with its dates', async () => {
    const db = world({ id: TOPIC, name: 'Adding decimals' }, [{ ...fixedGap }])
    expect(await finish(db)).toEqual({ gapsOpened: 0, gapsMoved: 0 })
    expect(db.tables.gaps).toEqual([fixedGap])
  })

  test('the same by name only: a session whose name is the fixed gap\'s (no topic id) does not reopen it', async () => {
    const db = world({ id: null, name: '  adding DECIMALS ' }, [{ ...fixedGap }])
    expect(await finish(db)).toEqual({ gapsOpened: 0, gapsMoved: 0 })
    expect(db.tables.gaps).toEqual([fixedGap])
  })

  test('a session on a strand name (a practice from the past records) moves no gap and opens none', async () => {
    const db = world({ id: null, name: 'Fractions' }, [{ ...fixedGap }, { ...otherOpen }])
    expect(await finish(db)).toEqual({ gapsOpened: 0, gapsMoved: 0 })
    expect(db.tables.gaps).toEqual([fixedGap, otherOpen])
  })

  test('a learner with no gap at all finishes a practice and still has none', async () => {
    const db = world({ id: null, name: 'Fractions' }, [])
    expect(await finish(db)).toEqual({ gapsOpened: 0, gapsMoved: 0 })
    expect(db.tables.gaps).toEqual([])
  })

  test('the format trial of the practice is still recorded, under the strand name when there is no topic', async () => {
    const db = world({ id: null, name: 'Fractions' }, [])
    await finish(db)
    expect(db.tables.format_trials).toMatchObject([{ child_id: CHILD, topic_family: 'Fractions', format: 'reading', score: 5, session_id: SESSION }])
  })
})
