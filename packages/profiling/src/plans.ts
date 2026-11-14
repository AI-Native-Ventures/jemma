import { z } from 'zod'
import type { JemmaDb } from './db'
import type { JemmaEvent } from './schemas/events'
import { PAPER_QUESTION_COUNT, pickPractice } from './logic'
import { maybe, ok } from './tools/context'
import { loadPracticeInput } from './tools/read/practice-input'

/** The AI jobs. Each has a prompt file `jobs/<job>.md` (see jobs/README.md). */
export const AI_JOBS = ['draft_map', 'read_key', 'read_paper', 'diagnose', 'class_report', 'write_lesson', 'guidance', 'long_view', 'map_records'] as const
/** Plain-code steps that sit in the plans next to the AI jobs. */
export const CODE_JOBS = ['plan_next_session', 'update_learner_profile'] as const
export const JOB_NAMES = [...AI_JOBS, ...CODE_JOBS] as const

export const JobNameSchema = z.enum(JOB_NAMES)
export type JobName = z.infer<typeof JobNameSchema>
export type JobStep = { job: JobName; ids: Record<string, string> }

/** Learners per read when `withHeldPapers` looks at a whole class: a hosted database returns at most 1000 rows to one read. */
const HELD_CHECK_CHUNK = 25

/**
 * The learners among `childIds` who have a paper in a test that is still held (the teacher has not shared it with parents).
 * The rule is `paper_shared` of 0018_share_gate.sql: a paper of no test, or of a test that is not held, is shared. The paper's status
 * does not matter: a paper being read again, or one that failed on a re-read, can still have the answers of its earlier marking.
 * A parent and the learner read the guidance card, and every runner writes it from the learner's whole profile (`get_learner_profile`
 * has no held filter, and a tool does not know its job), so the card is never planned for these learners. `test.shared` plans it
 * for each learner with a marked paper once the test is shared, if nothing of theirs is held any more.
 */
async function withHeldPapers(db: JemmaDb, childIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < childIds.length; i += HELD_CHECK_CHUNK) {
    const part = childIds.slice(i, i + HELD_CHECK_CHUNK)
    const papers = await ok(db.from('papers').select('child_id, test_id').in('child_id', part))
    const testIds = [...new Set(papers.map((p) => p.test_id).filter((t): t is string => !!t))]
    if (testIds.length === 0) continue
    const tests = await ok(db.from('tests').select('id, held').in('id', testIds))
    const held = new Set(tests.filter((t) => t.held).map((t) => t.id))
    for (const p of papers) if (p.child_id && p.test_id && held.has(p.test_id)) out.add(p.child_id)
  }
  return out
}

/**
 * Per learner: plan the next session (code), write the lesson, refresh guidance. A learner with a paper in another test that is
 * still held gets no guidance step: the card would be written from results the family may not see yet (see `withHeldPapers`).
 */
async function perChildTail(db: JemmaDb, childIds: string[]): Promise<JobStep[]> {
  const held = await withHeldPapers(db, childIds)
  return childIds.flatMap((childId) => [
    { job: 'plan_next_session' as const, ids: { childId } },
    { job: 'write_lesson' as const, ids: { childId } },
    ...(held.has(childId) ? [] : [{ job: 'guidance' as const, ids: { childId } }]),
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
    ...(test.held ? [] : await perChildTail(db, childIds)),
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
 * The learner's planned session for today or earlier, the one the home starts (the latest that is due), and whether its lesson has
 * questions yet. Null when there is none. The plan and the postcondition of `practice.requested` both ask it.
 */
async function dueSession(db: JemmaDb, childId: string, now: Date): Promise<{ id: string; written: boolean } | null> {
  const today = now.toISOString().slice(0, 10)
  const due = await ok(db.from('sessions').select('id, lesson_id, planned_for').eq('child_id', childId).eq('status', 'planned').lte('planned_for', today).order('planned_for'))
  const latest = due[due.length - 1]
  if (!latest) return null
  const lesson = latest.lesson_id ? await maybe(db.from('lessons').select('content').eq('id', latest.lesson_id).maybeSingle()) : null
  const questions = (lesson?.content as { questions?: unknown } | null)?.questions
  return { id: latest.id, written: Array.isArray(questions) && questions.length > 0 }
}

/** What follows a finished session, however its answers came: the profile moves, the next session is planned, its lesson is written. */
async function afterSession(db: JemmaDb, sessionId: string): Promise<JobStep[]> {
  const session = await ok(db.from('sessions').select('child_id').eq('id', sessionId).single())
  const childId = session.child_id
  return [
    { job: 'update_learner_profile', ids: { childId, sessionId } },
    { job: 'plan_next_session', ids: { childId } },
    { job: 'write_lesson', ids: { childId } },
  ]
}

/** The try answers a session has stored so far. A paper is only read while there are none. */
async function tryAnswers(db: JemmaDb, sessionId: string): Promise<number> {
  return (await ok(db.from('session_items').select('id').eq('session_id', sessionId).eq('phase', 'try'))).length
}

/**
 * The job plan for an event, from the current database state. The cloud consumer re-plans after every job,
 * so a paper that lands in "Needs you" drops the tail and a finished read_paper is not planned again.
 */
export async function jobPlan(event: JemmaEvent, db: JemmaDb, now: Date = new Date()): Promise<JobStep[]> {
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
    case 'session.finished':
      return afterSession(db, event.sessionId)
    case 'practice.snapped': {
      // The photo is read while the session has no try answer; `read_paper` stores all five and closes the session. After that, the same steps as a session finished on the screen.
      const read: JobStep[] = (await tryAnswers(db, event.sessionId)) === 0 ? [{ job: 'read_paper', ids: { sessionId: event.sessionId } }] : []
      return [...read, ...(await afterSession(db, event.sessionId))]
    }
    case 'observation.added':
    case 'activity.added':
      // A learner with a paper in a held test gets no card from a note or an activity: `test.shared` writes it once the test is shared.
      return (await withHeldPapers(db, [event.childId])).has(event.childId) ? [] : [{ job: 'guidance', ids: { childId: event.childId } }]
    case 'homework.snapped': {
      const paper = await ok(db.from('papers').select('child_id, status').eq('id', event.paperId).single())
      if (paper.status === 'queued' || paper.status === 'reading') return [{ job: 'read_paper', ids: { paperId: event.paperId } }]
      // After the parent confirms the scan the paper is marked: diagnose it.
      if (paper.status === 'marked' && paper.child_id) return [{ job: 'diagnose', ids: { childId: paper.child_id, paperId: event.paperId } }]
      return []
    }
    case 'long_view.requested':
      return [{ job: 'long_view', ids: { childId: event.childId } }]
    case 'practice.requested': {
      // The learner asked to practise now. A session for today whose lesson has questions: nothing to do. One whose lesson is still empty:
      // write it. None: plan one for today (code picks the topic), then write its lesson.
      const due = await dueSession(db, event.childId, now)
      if (due?.written) return []
      // The lesson is written for THIS session: the learner may have another one planned for a later day, and write_lesson takes the latest.
      const write: JobStep = { job: 'write_lesson', ids: due ? { childId: event.childId, sessionId: due.id } : { childId: event.childId } }
      // What the learner chose rides on the plan step (a choice is only planned when it is theirs to make: see `resolveChoice`).
      const choice = { ...(event.topicName ? { topicName: event.topicName } : {}), ...(event.topicId && event.topicName ? { topicId: event.topicId } : {}) }
      return due ? [write] : [{ job: 'plan_next_session', ids: { childId: event.childId, practice: '1', ...choice } }, write]
    }
    case 'test.shared':
      // The teacher shared the results: now each learner with a marked paper gets the next session, the lesson and the guidance.
      return (await isHeld(db, event.testId)) ? [] : perChildTail(db, await markedChildren(db, event.testId))
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
export async function postconditions(event: JemmaEvent, db: JemmaDb, now: Date = new Date()): Promise<string[]> {
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
  /** A learner with an open gap needs a planned session once a session is finished. */
  const nextSessionPlanned = async (sessionId: string) => {
    const session = await ok(db.from('sessions').select('child_id').eq('id', sessionId).single())
    const next = await ok(db.from('sessions').select('id').eq('child_id', session.child_id).eq('status', 'planned').limit(1))
    const gaps = await ok(db.from('gaps').select('stage').eq('child_id', session.child_id))
    if (next.length === 0 && gaps.some((g) => g.stage !== 'fixed')) missing.push(`no planned session for child ${session.child_id}`)
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
    case 'session.finished':
      await nextSessionPlanned(event.sessionId)
      break
    case 'practice.snapped': {
      // The paper was read: the session is closed with its five try answers. Then it is held to the rule of a session finished on the screen.
      const session = await ok(db.from('sessions').select('status').eq('id', event.sessionId).single())
      if (session.status !== 'done') missing.push(`session ${event.sessionId} is not done`)
      if ((await tryAnswers(db, event.sessionId)) < PAPER_QUESTION_COUNT) missing.push(`session ${event.sessionId} has fewer than ${PAPER_QUESTION_COUNT} try answers`)
      await nextSessionPlanned(event.sessionId)
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
    case 'practice.requested': {
      // A session for today or earlier whose lesson has questions, unless there was nothing to practise: no open gap and nothing for
      // `pickPractice` to pick (the same loader the planner uses).
      const due = await dueSession(db, event.childId, now)
      if (due?.written) break
      if (!due) {
        const open = await ok(db.from('gaps').select('id').eq('child_id', event.childId).neq('stage', 'fixed').limit(1))
        if (open.length === 0 && pickPractice(await loadPracticeInput(db, event.childId, now)) === null) break
      }
      missing.push(`no practice written for child ${event.childId}`)
      break
    }
  }
  return missing
}
