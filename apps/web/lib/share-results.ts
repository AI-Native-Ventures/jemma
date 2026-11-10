import type { JemmaDb } from '@jemma/profiling/db'
import { notify } from '@jemma/profiling/notify'
import { sendEvent } from './agent'
import { recordApproval } from './approvals'
import { requestLongView } from './long-view'

// "Share with parents": the one tap that lets a parent and a learner see a class test. Until then the test is held:
// row level security hides its marks, gaps and log lines from the family, and Jemma plans no lesson from it.
// Takes its clients as arguments, so tests can run it against doubles or a real database.

export type ShareDeps = {
  /** The signed-in teacher's own client: row level security and `teaches_class` decide whether they may share at all. */
  teacher: JemmaDb
  /** The service client. Writes the fields, the approval and the messages. */
  admin: JemmaDb
  userId: string
  send?: typeof sendEvent
  /** Asks the agent to update the Long view of these learners. Never throws in real life; a failure here still does not fail the share. */
  askLongView?: (childIds: string[]) => Promise<unknown>
  now?: () => Date
}

export type ShareResult = { ok: true; shared: boolean; childIds: string[] } | { ok: false; message: string }

const refuse = (message: string): ShareResult => ({ ok: false, message })
const log = (what: string, e: unknown) => console.error(`share results: ${what}: ${e instanceof Error ? e.message : String(e)}`)

/**
 * Shares a test's results with parents. The teacher's own session must teach the class and see the test, and at least one paper
 * must be marked. The write names `held = true`, so sharing twice (or two taps at once) does it once: the second call answers
 * `shared: false` and does nothing more. After the three fields are written, the rest is done on a best effort and never fails the share:
 * the approval (with the teacher's name), one message for each approved parent of each learner with a marked paper, then
 * `test.shared` (Jemma plans the lessons) and the Long view update for those learners, side by side.
 */
export async function shareResults(deps: ShareDeps, classId: string, testId: string): Promise<ShareResult> {
  const { teacher, admin, userId } = deps
  const send = deps.send ?? sendEvent
  const askLongView = deps.askLongView ?? requestLongView
  const now = (deps.now ?? (() => new Date()))()

  const teaches = await teacher.rpc('teaches_class', { cls: classId })
  if (teaches.error || teaches.data !== true) return refuse('Only the class teacher can share results.')
  const [test, cls] = await Promise.all([
    teacher.from('tests').select('id, title, out_of').eq('id', testId).eq('class_id', classId).maybeSingle(),
    teacher.from('classes').select('id, school_id').eq('id', classId).maybeSingle(),
  ])
  if (test.error || !test.data || cls.error || !cls.data) return refuse('That test is not in this class.')
  const { title, out_of: outOf } = test.data
  const schoolId = cls.data.school_id

  const papers = await admin.from('papers').select('id, child_id, status, total, created_at').eq('test_id', testId).order('created_at')
  if (papers.error) return refuse('Could not read the papers of this test. Try again.')
  // One mark for each learner with a marked paper: the newest paper if there are two.
  const marked = new Map<string, number>()
  for (const p of papers.data ?? []) if (p.status === 'marked' && p.child_id) marked.set(p.child_id, p.total ?? 0)
  const childIds = [...marked.keys()]
  if (childIds.length === 0) return refuse('No paper of this test is marked yet.')

  const opened = await admin
    .from('tests')
    .update({ held: false, shared_at: now.toISOString(), shared_by: userId })
    .eq('id', testId)
    .eq('held', true)
    .select('id')
  if (opened.error) return refuse('Could not share the results. Try again.')
  if ((opened.data?.length ?? 0) === 0) return { ok: true, shared: false, childIds } // someone shared it already: nothing more to do

  await recordApproval(admin, { schoolId, kind: 'share_results', refId: testId, decision: 'shared', userId, note: title })

  try {
    const links = await admin.from('parent_links').select('parent_id, child_id').in('child_id', childIds).eq('status', 'approved')
    if (links.error) throw new Error(links.error.message)
    await Promise.all(
      (links.data ?? []).map((l) =>
        notify(admin, [l.parent_id], { title: `${title} is marked`, body: `${marked.get(l.child_id) ?? 0} out of ${outOf}`, href: `/p/${l.child_id}/tests` }).catch((e) =>
          log(`could not tell parent ${l.parent_id} about ${l.child_id}`, e),
        ),
      ),
    )
  } catch (e) {
    log('could not find the parents to tell', e)
  }

  // Jemma plans the lessons and looks at each Long view again. Side by side, and neither can fail the share: the fields and the approval are saved.
  await Promise.all([
    Promise.resolve()
      .then(() => send('test.shared', { testId }))
      .catch((e) => log('could not post test.shared to the agent', e)),
    Promise.resolve()
      .then(() => askLongView(childIds))
      .catch((e) => log('could not ask for the Long view update', e)),
  ])
  return { ok: true, shared: true, childIds }
}
