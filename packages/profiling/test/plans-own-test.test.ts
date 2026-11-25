import { describe, expect, test, vi } from 'vitest'
import { afterEventFailed } from '../src/orchestrator'
import { AI_JOBS, jobPlan, postconditions } from '../src/plans'
import { EventSchema } from '../src/schemas/events'
import { CHILD, EVENT, NOW, OTHER_SCHOOL, PAPER, SCHOOL, ownTestWorld } from './helpers/own-test'
import { PROBLEM_TITLE } from '../src/tools/save/mark-paper'

// `own_test.snapped`: a learner sent a photo of a test they got back already marked. Its job plan in each state of the paper (the plan is made
// again after every job), its postcondition, and what happens when it ends failed. Tables are in memory: no database, no network.

const event = EventSchema.parse({ type: 'own_test.snapped', childId: CHILD, paperId: PAPER })
const world = (paper: Record<string, unknown> = {}) =>
  ownTestWorld({ papers: [{ id: PAPER, child_id: CHILD, test_id: null, owner: 'parent', kind: 'test', status: 'queued', name_read: null, total: null, error: null, ...paper }] })

const read = [{ job: 'read_marked_test', ids: { paperId: PAPER } }]
const tail = [
  { job: 'diagnose', ids: { childId: CHILD, paperId: PAPER } },
  { job: 'plan_next_session', ids: { childId: CHILD } },
  { job: 'write_lesson', ids: { childId: CHILD } },
]

describe('read_marked_test is an AI job', () => {
  test('it is in the list of AI jobs', () => {
    expect(AI_JOBS).toContain('read_marked_test')
    expect(AI_JOBS).toHaveLength(11)
  })
})

describe('the job plan of own_test.snapped', () => {
  test('a queued paper: read it first, and nothing else yet', async () => {
    expect(await jobPlan(event, world({ status: 'queued' }), NOW)).toEqual(read)
  })

  test('a paper being read: read it (a read that died is done again)', async () => {
    expect(await jobPlan(event, world({ status: 'reading' }), NOW)).toEqual(read)
  })

  test('a marked paper: diagnose it, plan the next session, write its lesson, and the read is not planned again', async () => {
    expect(await jobPlan(event, world({ status: 'marked', total: 7 }), NOW)).toEqual(tail)
  })

  test('a failed paper: nothing', async () => {
    expect(await jobPlan(event, world({ status: 'failed', error: 'read_failed' }), NOW)).toEqual([])
  })

  test('there is no guidance and no class report: the learner is not in a class that a teacher reads', async () => {
    const jobs = [...(await jobPlan(event, world({ status: 'marked' }), NOW))].map((s) => s.job)
    expect(jobs).not.toContain('guidance')
    expect(jobs).not.toContain('class_report')
  })

  test('a paper that is another learner\'s is not planned at all', async () => {
    const other = world({ child_id: '66666666-6666-4666-8666-666666666666' })
    expect(await jobPlan(event, other, NOW)).toEqual([])
  })
})

describe('the postcondition of own_test.snapped', () => {
  test('a marked paper meets it, and so does a failed one (the event ends failed by itself)', async () => {
    expect(await postconditions(event, world({ status: 'marked' }), NOW)).toEqual([])
    expect(await postconditions(event, world({ status: 'failed', error: 'read_failed' }), NOW)).toEqual([])
  })

  test('a paper still queued or reading does not', async () => {
    for (const status of ['queued', 'reading']) {
      const missing = await postconditions(event, world({ status }), NOW)
      expect(missing, status).toEqual([`own test ${PAPER} is not read yet`])
    }
  })

  test('a paper of another learner does not', async () => {
    const missing = await postconditions(event, world({ status: 'marked', child_id: '66666666-6666-4666-8666-666666666666' }), NOW)
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain(PAPER)
  })
})

describe('an own_test.snapped event that ended failed', () => {
  const failed = { id: EVENT, school_id: SCHOOL, type: 'own_test.snapped', payload: { childId: CHILD, paperId: PAPER } }

  test('a paper still being read becomes failed with the code of a read that failed, and asks no teacher anything', async () => {
    for (const status of ['queued', 'reading']) {
      const db = world({ status })
      await afterEventFailed(db, failed, () => NOW)
      expect(db.tables.papers![0], status).toMatchObject({ status: 'failed', error: 'read_failed' })
      expect(db.tables.needs_you_items ?? []).toHaveLength(0)
    }
    expect(PROBLEM_TITLE.read_failed).toBe('Jemma could not read this photo')
  })

  test('a paper that is already marked or failed is never touched', async () => {
    for (const status of ['marked', 'failed']) {
      const db = world({ status, total: 5, error: status === 'failed' ? 'blurry' : null })
      const before = JSON.stringify(db.tables)
      await afterEventFailed(db, failed, () => NOW)
      expect(JSON.stringify(db.tables), status).toBe(before)
    }
  })

  test('the results of an earlier read go with a paper that failed', async () => {
    const db = ownTestWorld({
      papers: [{ id: PAPER, child_id: CHILD, test_id: null, owner: 'parent', kind: 'test', status: 'reading', error: null }],
      question_results: [{ id: 'r1', paper_id: PAPER, child_id: CHILD, n: 1 }],
    })
    await afterEventFailed(db, failed, () => NOW)
    expect(db.tables.question_results).toHaveLength(0)
  })

  test('a paper of another school is not touched (and the refusal is logged as one line)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = world({ status: 'reading' })
    await afterEventFailed(db, { ...failed, school_id: OTHER_SCHOOL }, () => NOW)
    expect(db.tables.papers![0]!.status).toBe('reading')
    log.mockRestore()
  })
})
