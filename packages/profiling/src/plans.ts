import { z } from 'zod'
import type { JemmaDb } from './db'
import type { JemmaEvent } from './schemas/events'
import { ok } from './tools/context'

/** The 7 AI jobs. Each has a prompt file `jobs/<job>.md` (see jobs/README.md). */
export const AI_JOBS = ['draft_map', 'read_key', 'read_paper', 'diagnose', 'class_report', 'write_lesson', 'guidance'] as const
/** Plain-code steps that sit in the plans next to the AI jobs. */
export const CODE_JOBS = ['plan_next_session', 'update_learner_profile'] as const
export const JOB_NAMES = [...AI_JOBS, ...CODE_JOBS] as const

export const JobNameSchema = z.enum(JOB_NAMES)
export type JobName = z.infer<typeof JobNameSchema>
export type JobStep = { job: JobName; ids: Record<string, string> }

/** Per learner: plan the next session (code), write the lesson, refresh guidance. */
function perChildTail(childIds: string[]): JobStep[] {
  return childIds.flatMap((childId) => [
    { job: 'plan_next_session' as const, ids: { childId } },
    { job: 'write_lesson' as const, ids: { childId } },
    { job: 'guidance' as const, ids: { childId } },
  ])
}

/**
 * After a test's papers are marked: per child `diagnose`, then `class_report`, then the per child tail.
 * Returns [] while any other paper of the test is unmarked, or when this paper is waiting on the teacher.
 */
async function testTail(db: JemmaDb, paperId: string): Promise<JobStep[]> {
  const paper = await ok(db.from('papers').select('id, test_id, status').eq('id', paperId).single())
  if (!paper.test_id || paper.status === 'needs_you' || paper.status === 'failed') return []
  const [test, papers] = await Promise.all([
    ok(db.from('tests').select('class_id').eq('id', paper.test_id).single()),
    ok(db.from('papers').select('id, child_id, status').eq('test_id', paper.test_id)),
  ])
  if (papers.some((p) => p.id !== paperId && p.status !== 'marked')) return []
  const childIds = [...new Set(papers.map((p) => p.child_id).filter((c): c is string => !!c))]
  const testId = paper.test_id
  return [
    ...childIds.map((childId) => ({ job: 'diagnose' as const, ids: { testId, childId } })),
    { job: 'class_report' as const, ids: { classId: test.class_id, testId } },
    ...perChildTail(childIds),
  ]
}

/**
 * The job plan for an event, from the current database state. The cloud consumer re-plans after every job,
 * so a paper that lands in "Needs you" drops the tail and a finished read_paper is not planned again.
 */
export async function jobPlan(event: JemmaEvent, db: JemmaDb): Promise<JobStep[]> {
  switch (event.type) {
    case 'curriculum.uploaded':
      return [{ job: 'draft_map', ids: { mapId: event.mapId } }]
    case 'key.snapped':
      return [{ job: 'read_key', ids: { testId: event.testId } }]
    case 'paper.snapped': {
      const paper = await ok(db.from('papers').select('status').eq('id', event.paperId).single())
      const read: JobStep[] = paper.status === 'queued' || paper.status === 'reading' ? [{ job: 'read_paper', ids: { paperId: event.paperId } }] : []
      return [...read, ...(await testTail(db, event.paperId))]
    }
    case 'paper.checked':
      return testTail(db, event.paperId)
    case 'session.finished': {
      const session = await ok(db.from('sessions').select('child_id').eq('id', event.sessionId).single())
      const childId = session.child_id
      return [
        { job: 'update_learner_profile', ids: { childId, sessionId: event.sessionId } },
        { job: 'plan_next_session', ids: { childId } },
        { job: 'write_lesson', ids: { childId } },
      ]
    }
    case 'observation.added':
    case 'activity.added':
      return [{ job: 'guidance', ids: { childId: event.childId } }]
    case 'homework.snapped': {
      const paper = await ok(db.from('papers').select('child_id, status').eq('id', event.paperId).single())
      if (paper.status === 'queued' || paper.status === 'reading') return [{ job: 'read_paper', ids: { paperId: event.paperId } }]
      // After the parent confirms the scan the paper is marked: diagnose it.
      if (paper.status === 'marked' && paper.child_id) return [{ job: 'diagnose', ids: { childId: paper.child_id, paperId: event.paperId } }]
      return []
    }
  }
}

const UNREAD = ['queued', 'reading']

/**
 * What an event must have produced once its job plan is done. Empty means met.
 * A test's tail (reteach plan, a planned session per learner with an open gap) is only due once every paper of the test is marked.
 */
export async function postconditions(event: JemmaEvent, db: JemmaDb): Promise<string[]> {
  const missing: string[] = []
  const tail = async (paperId: string) => {
    const paper = await ok(db.from('papers').select('id, test_id, status').eq('id', paperId).single())
    if (paper.status === 'failed') return missing.push(`paper ${paperId} failed to read`)
    if (UNREAD.includes(paper.status)) return missing.push(`paper ${paperId} is not read yet`)
    if (paper.status !== 'marked' || !paper.test_id) return
    const papers = await ok(db.from('papers').select('child_id, status').eq('test_id', paper.test_id))
    if (papers.some((p) => p.status !== 'marked')) return
    const reteach = await ok(db.from('reteach_plans').select('id').eq('test_id', paper.test_id).limit(1))
    if (reteach.length === 0) missing.push(`no reteach plan for test ${paper.test_id}`)
    const childIds = [...new Set(papers.map((p) => p.child_id).filter((c): c is string => !!c))]
    if (childIds.length === 0) return
    const [gaps, sessions] = await Promise.all([
      ok(db.from('gaps').select('child_id, stage').in('child_id', childIds)),
      ok(db.from('sessions').select('child_id').eq('status', 'planned').in('child_id', childIds)),
    ])
    const planned = new Set(sessions.map((s) => s.child_id))
    for (const childId of new Set(gaps.filter((g) => g.stage !== 'fixed').map((g) => g.child_id))) {
      if (!planned.has(childId)) missing.push(`no planned session for child ${childId}`)
    }
  }
  switch (event.type) {
    case 'curriculum.uploaded': {
      // A drafted map lives in curriculum_maps.draft; `topics` rows only appear once the teacher approves it.
      const map = await ok(db.from('curriculum_maps').select('draft').eq('id', event.mapId).single())
      const terms = (map.draft as { terms?: { topics?: unknown[] }[] } | null)?.terms ?? []
      if (!terms.some((t) => (t.topics?.length ?? 0) > 0)) missing.push(`no topics drafted for map ${event.mapId}`)
      break
    }
    case 'key.snapped': {
      const keys = await ok(db.from('answer_keys').select('items').eq('test_id', event.testId))
      if (!keys.some((k) => Array.isArray(k.items) && k.items.length > 0)) missing.push(`no answer key read for test ${event.testId}`)
      break
    }
    case 'paper.snapped':
    case 'paper.checked':
      await tail(event.paperId)
      break
    case 'homework.snapped': {
      const paper = await ok(db.from('papers').select('status').eq('id', event.paperId).single())
      if (UNREAD.includes(paper.status)) missing.push(`homework ${event.paperId} is not read yet`)
      break
    }
    case 'session.finished': {
      const session = await ok(db.from('sessions').select('child_id').eq('id', event.sessionId).single())
      const next = await ok(db.from('sessions').select('id').eq('child_id', session.child_id).eq('status', 'planned').limit(1))
      const gaps = await ok(db.from('gaps').select('stage').eq('child_id', session.child_id))
      if (next.length === 0 && gaps.some((g) => g.stage !== 'fixed')) missing.push(`no planned session for child ${session.child_id}`)
      break
    }
    case 'observation.added':
    case 'activity.added':
      break
  }
  return missing
}
