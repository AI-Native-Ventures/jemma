import { z } from 'zod'
import type { JemmaDb } from './db'
import type { JemmaEvent } from './schemas/events'
import { maybe, ok } from './tools/context'

/** The AI jobs. Each has a prompt file `jobs/<job>.md` (see jobs/README.md). */
export const AI_JOBS = ['draft_map', 'read_key', 'read_paper', 'diagnose', 'class_report', 'write_lesson', 'guidance', 'long_view', 'map_records'] as const
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
 * A test's tail once every paper is resolved (marked, or waiting on the teacher in Needs you), as the class home
 * board shows class gaps next to an open check: per child `diagnose` for marked papers, then `class_report`, then the
 * per child tail. With `onlyChild` (after the teacher checks one paper) only that learner is diagnosed and planned,
 * and the class report is redone. Returns [] while any paper is still being read, or for a failed paper.
 * While the test is held (the teacher has not shared it with parents) the plan stops after the diagnoses and the class
 * report: no session, lesson or guidance is made from a result the parent may not see yet. `test.shared` does those.
 */
async function testTail(db: JemmaDb, paperId: string, onlyChild = false): Promise<JobStep[]> {
  const paper = await ok(db.from('papers').select('id, test_id, status, child_id').eq('id', paperId).single())
  if (!paper.test_id || paper.status === 'failed') return []
  const [test, papers] = await Promise.all([
    ok(db.from('tests').select('class_id, held').eq('id', paper.test_id).single()),
    ok(db.from('papers').select('id, child_id, status').eq('test_id', paper.test_id)),
  ])
  // This paper may be read earlier in the same plan (paper.snapped): count it as marked.
  const readingNow = (p: { id: string; status: string }) => p.id === paperId && (p.status === 'queued' || p.status === 'reading')
  const status = (p: { id: string; status: string }) => (readingNow(p) ? 'marked' : p.status)
  if (papers.some((p) => status(p) !== 'marked' && status(p) !== 'needs_you' && status(p) !== 'failed')) return []
  const marked = papers.filter((p) => status(p) === 'marked' && p.child_id && (!onlyChild || p.id === paperId))
  const childIds = [...new Set(marked.map((p) => p.child_id as string))]
  if (childIds.length === 0) return []
  const testId = paper.test_id
  return [
    ...childIds.map((childId) => ({ job: 'diagnose' as const, ids: { testId, childId } })),
    { job: 'class_report' as const, ids: { classId: test.class_id, testId } },
    ...(test.held ? [] : perChildTail(childIds)),
  ]
}

/** Learners with a marked paper in a test, once each, in paper order. */
async function markedChildren(db: JemmaDb, testId: string): Promise<string[]> {
  const papers = await ok(db.from('papers').select('child_id, status').eq('test_id', testId))
  return [...new Set(papers.filter((p) => p.status === 'marked' && p.child_id).map((p) => p.child_id as string))]
}

/** True when the teacher has not shared the test with parents yet. A test that is not found counts as held: nothing is planned for it. */
async function isHeld(db: JemmaDb, testId: string): Promise<boolean> {
  const test = await maybe(db.from('tests').select('held').eq('id', testId).maybeSingle())
  return test ? test.held : true
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
      return testTail(db, event.paperId, true)
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
    case 'long_view.requested':
      return [{ job: 'long_view', ids: { childId: event.childId } }]
    case 'test.shared':
      // The teacher shared the results: now each learner with a marked paper gets the next session, the lesson and the guidance.
      return (await isHeld(db, event.testId)) ? [] : perChildTail(await markedChildren(db, event.testId))
    case 'records.uploaded': {
      // Once the file is read (ready), or the teacher has already decided, there is nothing left to map.
      const found = await ok(db.from('record_imports').select('status').eq('id', event.importId).single())
      return found.status === 'drafting' || found.status === 'failed' ? [{ job: 'map_records', ids: { importId: event.importId } }] : []
    }
  }
}

const UNREAD = ['queued', 'reading']

/**
 * What an event must have produced once its job plan is done. Empty means met.
 * A test's tail (reteach plan, a planned session per learner with an open gap) is due once no paper of the test is still being read; papers waiting in Needs you count as resolved.
 * The planned sessions are only due once the test is shared with parents (`held` is false): `test.shared` asks for them for the learners with a marked paper.
 */
export async function postconditions(event: JemmaEvent, db: JemmaDb): Promise<string[]> {
  const missing: string[] = []
  /** Every learner in `childIds` with an open gap needs a planned session. */
  const sessionsFor = async (childIds: string[]) => {
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
  const tail = async (paperId: string) => {
    const paper = await ok(db.from('papers').select('id, test_id, status').eq('id', paperId).single())
    if (paper.status === 'failed') return missing.push(`paper ${paperId} failed to read`)
    if (UNREAD.includes(paper.status)) return missing.push(`paper ${paperId} is not read yet`)
    if ((paper.status !== 'marked' && paper.status !== 'needs_you') || !paper.test_id) return
    const all = await ok(db.from('papers').select('child_id, status').eq('test_id', paper.test_id))
    if (all.some((p) => UNREAD.includes(p.status))) return
    const papers = all.filter((p) => p.status === 'marked')
    if (papers.length === 0) return
    const reteach = await ok(db.from('reteach_plans').select('id').eq('test_id', paper.test_id).limit(1))
    if (reteach.length === 0) missing.push(`no reteach plan for test ${paper.test_id}`)
    // Planned sessions are only due once the teacher has shared the test: until then `test.shared` owns them.
    if (await isHeld(db, paper.test_id)) return
    await sessionsFor([...new Set(papers.map((p) => p.child_id).filter((c): c is string => !!c))])
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
    case 'test.shared':
      if (!(await isHeld(db, event.testId))) await sessionsFor(await markedChildren(db, event.testId))
      break
    case 'records.uploaded': {
      const found = await ok(db.from('record_imports').select('status').eq('id', event.importId).single())
      if (found.status === 'drafting' || found.status === 'failed') missing.push(`the file ${event.importId} was not read`)
      break
    }
    case 'observation.added':
    case 'activity.added':
    case 'long_view.requested':
      break
  }
  return missing
}
