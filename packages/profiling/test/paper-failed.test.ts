import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JemmaDb } from '../src/db'
import { afterEventFailed, checkStuckEvents, endEventFailed, runEvent, STUCK_EVENT_ERROR } from '../src/orchestrator'
import { PROBLEM_TITLE } from '../src/tools/save/mark-paper'
import { PaperReadSchema } from '../src/schemas/papers'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// When the job behind a photo ends failed for good, the paper ends the way mark_paper ends a page that is not usable. No database and no
// network: the tables are in memory (helpers/memory-db.ts).

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const TEST = '33333333-3333-4333-8333-333333333333'
const TEACHER = '44444444-4444-4444-8444-444444444444'
const PARENT = '55555555-5555-4555-8555-555555555555'
const CHILD = '66666666-6666-4666-8666-666666666666'
const PAPER = '77777777-7777-4777-8777-777777777777'
const HOMEWORK = '88888888-8888-4888-8888-888888888888'
const EVENT = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-11-13T09:00:00.000Z')

function world(over: { paper?: Record<string, unknown>; homework?: Record<string, unknown>; extra?: Record<string, Record<string, unknown>[]> } = {}): MemoryDb {
  return memoryDb({
    schools: [{ id: SCHOOL }],
    classes: [{ id: CLASS, school_id: SCHOOL, teacher_id: TEACHER }],
    tests: [{ id: TEST, class_id: CLASS, title: 'Class Test 1: Fractions', held: true }],
    children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina' }],
    parent_links: [{ parent_id: PARENT, child_id: CHILD, status: 'approved' }],
    papers: [
      { id: PAPER, test_id: TEST, child_id: null, owner: 'teacher', status: 'reading', error: null, name_read: null, ...over.paper },
      { id: HOMEWORK, test_id: null, child_id: CHILD, owner: 'parent', status: 'queued', error: null, name_read: null, ...over.homework },
    ],
    needs_you_items: [],
    question_results: [],
    activity_log: [],
    events: [],
    tool_calls: [],
    ...over.extra,
  })
}
const event = (type: string, paperId: string | null = PAPER, id = EVENT) => ({ id, school_id: SCHOOL, type, payload: paperId ? { paperId } : { testId: TEST } })
const paperOf = (db: MemoryDb, id = PAPER) => db.tables.papers!.find((p) => p.id === id)!

afterEach(() => vi.restoreAllMocks())

describe('the code for a read that failed', () => {
  test('it has a title in the same plain style, and the model cannot choose it', () => {
    expect(PROBLEM_TITLE.read_failed).toBe('Jemma could not read this photo')
    // None of the four codes the model may choose says "Jemma could not read this photo this time": each names a cause.
    expect(Object.keys(PROBLEM_TITLE).sort()).toEqual(['blurry', 'cut_off', 'not_a_test', 'read_failed', 'too_dark'])
    const base = { nameAsWritten: null, nameConfidence: 0, pageUsable: false, answers: [] }
    for (const problem of ['too_dark', 'blurry', 'cut_off', 'not_a_test']) expect(PaperReadSchema.safeParse({ ...base, problem }).success, problem).toBe(true)
    expect(PaperReadSchema.safeParse({ ...base, problem: 'read_failed' }).success).toBe(false)
  })
})

describe("a teacher's paper whose paper.snapped event ended failed", () => {
  test('a paper being read becomes needs_you, with one Needs you item that asks for a retake or a check by hand', async () => {
    const db = world()
    await afterEventFailed(db, event('paper.snapped'), () => NOW)
    expect(paperOf(db)).toMatchObject({ status: 'needs_you', error: 'read_failed', name_read: null })
    expect(db.tables.needs_you_items).toHaveLength(1)
    expect(db.tables.needs_you_items![0]).toMatchObject({
      owner_id: TEACHER,
      school_id: SCHOOL,
      kind: 'confirm_scan',
      ref_id: PAPER,
      status: 'open',
      title: 'Jemma could not read this photo',
      detail: 'Class Test 1: Fractions · retake the photo or check it yourself',
    })
    expect(db.tables.activity_log).toHaveLength(1)
    expect(db.tables.activity_log![0]).toMatchObject({ school_id: SCHOOL, class_id: CLASS, event_id: EVENT, text: 'Read 1 paper. 1 unsure, sent to you.', at: NOW.toISOString() })
  })

  test('a queued paper too, and a second call changes nothing (the paper is no longer waiting)', async () => {
    const db = world({ paper: { status: 'queued' } })
    await afterEventFailed(db, event('paper.snapped'), () => NOW)
    await afterEventFailed(db, event('paper.snapped'), () => NOW)
    expect(paperOf(db).status).toBe('needs_you')
    expect(db.tables.needs_you_items).toHaveLength(1)
    expect(db.tables.activity_log).toHaveLength(1)
  })

  test('an item left open by an earlier read is replaced, as mark_paper replaces it, so the teacher sees one', async () => {
    const stale = { id: 'old', owner_id: TEACHER, school_id: SCHOOL, kind: 'confirm_scan', ref_id: PAPER, status: 'open', title: 'Photo too blurry', detail: 'x' }
    const db = world({ extra: { needs_you_items: [stale] } })
    await afterEventFailed(db, event('paper.snapped'), () => NOW)
    expect(db.tables.needs_you_items).toHaveLength(1)
    expect(db.tables.needs_you_items![0]!.title).toBe('Jemma could not read this photo')
  })

  test('a paper that is already marked, needs_you or failed is never touched', async () => {
    for (const status of ['marked', 'needs_you', 'failed']) {
      const db = world({ paper: { status, error: status === 'failed' ? 'blurry' : null, total: 7 } })
      const before = JSON.stringify(db.tables)
      await afterEventFailed(db, event('paper.snapped'), () => NOW)
      expect(JSON.stringify(db.tables), status).toBe(before)
    }
  })
})

describe("a parent's homework photo whose homework.snapped event ended failed", () => {
  test('a queued paper becomes failed with the code, and no Needs you item is made', async () => {
    const db = world()
    await afterEventFailed(db, event('homework.snapped', HOMEWORK), () => NOW)
    expect(paperOf(db, HOMEWORK)).toMatchObject({ status: 'failed', error: 'read_failed' })
    expect(db.tables.needs_you_items).toHaveLength(0)
    expect(db.tables.activity_log).toHaveLength(1)
    expect(db.tables.activity_log![0]).toMatchObject({ child_id: CHILD, text: 'Jemma could not read this photo, asked for a new photo' })
    // The teacher's paper is not touched by the parent's event.
    expect(paperOf(db).status).toBe('reading')
  })

  test('a paper being read becomes failed too, and a marked homework stays as it is', async () => {
    const reading = world({ homework: { status: 'reading' } })
    await afterEventFailed(reading, event('homework.snapped', HOMEWORK), () => NOW)
    expect(paperOf(reading, HOMEWORK).status).toBe('failed')
    const marked = world({ homework: { status: 'marked' } })
    const before = JSON.stringify(marked.tables)
    await afterEventFailed(marked, event('homework.snapped', HOMEWORK), () => NOW)
    expect(JSON.stringify(marked.tables)).toBe(before)
  })
})

describe('everything else is left alone', () => {
  const asks = (log: string[]): JemmaDb =>
    ({
      from: (table: string) => {
        log.push(table)
        throw new Error('the database was reached')
      },
    }) as unknown as JemmaDb

  test('a key.snapped event, a paper.checked event and the other types do nothing, and ask the database for nothing', async () => {
    const log: string[] = []
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = asks(log)
    for (const type of ['key.snapped', 'paper.checked', 'curriculum.uploaded', 'observation.added', 'long_view.requested', 'records.uploaded', 'test.shared', 'session.finished']) {
      await afterEventFailed(db, event(type, type === 'paper.checked' ? PAPER : null), () => NOW)
    }
    expect(log).toEqual([])
    expect(err).not.toHaveBeenCalled()
  })

  test('a paper event that names no paper does nothing', async () => {
    const db = world()
    const before = JSON.stringify(db.tables)
    await afterEventFailed(db, { id: EVENT, school_id: SCHOOL, type: 'paper.snapped', payload: {} }, () => NOW)
    await afterEventFailed(db, { id: EVENT, school_id: SCHOOL, type: 'paper.snapped', payload: null }, () => NOW)
    expect(JSON.stringify(db.tables)).toBe(before)
  })

  test('a paper of another school is not touched (and the refusal is logged as one line)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = world()
    await afterEventFailed(db, { id: EVENT, school_id: '00000000-0000-4000-8000-000000000000', type: 'paper.snapped', payload: { paperId: PAPER } }, () => NOW)
    expect(paperOf(db).status).toBe('reading')
    expect(db.tables.needs_you_items).toHaveLength(0)
    expect(log).toHaveBeenCalledTimes(1)
  })
})

describe('it never throws', () => {
  test('a database that does not answer is logged as one line, and nothing is thrown', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      from: () => {
        throw new Error('the pool is full')
      },
    } as unknown as JemmaDb
    await expect(afterEventFailed(db, event('paper.snapped'), () => NOW)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('paper after a failed event: the pool is full')
  })

  test('a write that is refused halfway is logged once too, and the event is not looked at again', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const inner = world()
    const db = {
      ...inner,
      from: (table: string) => {
        const q = (inner as unknown as { from: (t: string) => Record<string, unknown> }).from(table)
        if (table !== 'needs_you_items') return q
        return { ...q, insert: () => ({ select: async () => ({ data: null, error: { message: 'connection reset' } }) }) }
      },
    } as unknown as JemmaDb
    await expect(afterEventFailed(db, event('paper.snapped'), () => NOW)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toBe('paper after a failed event: connection reset')
  })
})

describe('where an event ends failed for good', () => {
  test('endEventFailed answers the event it ended, so a caller can look at its type and its paper', async () => {
    const db = memoryDb({ events: [{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', status: 'running', payload: { paperId: PAPER }, attempts: 1 }] })
    const ended = await endEventFailed(db, EVENT, 'boom', 2, NOW.toISOString())
    expect(ended.error).toBeNull()
    expect(ended.data).toHaveLength(1)
    expect(ended.data![0]).toMatchObject({ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', payload: { paperId: PAPER } })
    expect(db.tables.events![0]).toMatchObject({ status: 'failed', error: 'boom', attempts: 2, finished_at: NOW.toISOString() })
  })

  test('checkStuckEvents: a job that died a third time ends failed, and its paper says so', async () => {
    const created = new Date(NOW.getTime() - 17 * 60_000).toISOString()
    const db = world({
      extra: { events: [{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', status: 'running', runner: 'cloud', claimed_by: null, attempts: 1, created_at: created, payload: { paperId: PAPER, revived: 2 } }] },
    })
    const requeue = vi.fn(async () => {})
    expect(await checkStuckEvents(db, requeue, NOW)).toBe(1)
    expect(requeue).not.toHaveBeenCalled()
    expect(db.tables.events![0]).toMatchObject({ status: 'failed', error: STUCK_EVENT_ERROR })
    expect(paperOf(db)).toMatchObject({ status: 'needs_you', error: 'read_failed' })
    expect(db.tables.needs_you_items).toHaveLength(1)
  })

  test('checkStuckEvents: a job brought back for the first time leaves its paper alone', async () => {
    const created = new Date(NOW.getTime() - 17 * 60_000).toISOString()
    const db = world({
      extra: { events: [{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', status: 'running', runner: 'cloud', claimed_by: null, attempts: 1, created_at: created, payload: { paperId: PAPER } }] },
    })
    expect(await checkStuckEvents(db, vi.fn(async () => {}), NOW)).toBe(1)
    expect(db.tables.events![0]!.status).toBe('queued')
    expect(paperOf(db).status).toBe('reading')
    expect(db.tables.needs_you_items).toHaveLength(0)
  })

  test('runEvent: a read job that fails for good ends the event failed, and the paper says so', async () => {
    const db = world({ extra: { events: [{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', status: 'queued', runner: 'cloud', claimed_by: null, attempts: 0, payload: { paperId: PAPER } }] } })
    const out = await runEvent(EVENT, {
      db,
      env: {} as never,
      jobs: {
        read_paper: async () => {
          throw new Error('the model said no')
        },
      },
      sleep: async () => {},
      now: () => NOW,
    })
    expect(out).toEqual({ status: 'failed' })
    expect(db.tables.events![0]).toMatchObject({ status: 'failed', error: 'the model said no' })
    expect(paperOf(db)).toMatchObject({ status: 'needs_you', error: 'read_failed' })
    expect(db.tables.needs_you_items).toHaveLength(1)
  })

  test('runEvent: an event that was cancelled is left cancelled and its paper is not touched', async () => {
    const db = world({ extra: { events: [{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', status: 'queued', runner: 'cloud', claimed_by: null, attempts: 0, payload: { paperId: PAPER } }] } })
    const out = await runEvent(EVENT, {
      db,
      env: {} as never,
      jobs: {
        read_paper: async () => {
          // The school was reset while the job ran: the event is cancelled, then the job fails.
          db.tables.events![0]!.status = 'cancelled'
          throw new Error('late failure')
        },
      },
      sleep: async () => {},
      now: () => NOW,
    })
    expect(out.status).toBe('failed')
    expect(db.tables.events![0]!.status).toBe('cancelled')
    expect(paperOf(db).status).toBe('reading')
    expect(db.tables.needs_you_items).toHaveLength(0)
  })

  test('a paper that was marked before a later job of its event failed stays marked', async () => {
    const db = world({
      paper: { status: 'marked', total: 7 },
      extra: { events: [{ id: EVENT, school_id: SCHOOL, type: 'paper.snapped', status: 'queued', runner: 'cloud', claimed_by: null, attempts: 0, payload: { paperId: PAPER } }] },
    })
    // The plan for a marked paper with no learner has nothing to do and the event is done, so fail it through the shared function.
    const ended = await endEventFailed(db, EVENT, 'class report failed', 1, NOW.toISOString())
    await afterEventFailed(db, ended.data![0]!, () => NOW)
    expect(paperOf(db)).toMatchObject({ status: 'marked', total: 7 })
    expect(db.tables.needs_you_items).toHaveLength(0)
  })
})
