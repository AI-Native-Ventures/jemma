import type { JemmaDb } from '@jemma/profiling/db'

/** What was decided on: the topic map, the answer key, a mark, a paper, a link request, a reteach, a homework scan, a Long view pattern, the talk about one, or sharing a test's results with parents. */
export type ApprovalKind =
  | 'topic_map'
  | 'answer_key'
  | 'mark'
  | 'paper_name'
  | 'paper'
  | 'guardian_link'
  | 'reteach'
  | 'homework_scan'
  | 'long_view_pattern'
  | 'long_view_talk'
  | 'share_results'

export type ApprovalDecision = 'approved' | 'declined' | 'edited' | 'confirmed' | 'shared'

export type ApprovalInput = {
  schoolId: string
  kind: ApprovalKind
  /** The id of the thing decided on (the map, the test, the paper, the link, the plan). */
  refId: string
  childId?: string | null
  decision: ApprovalDecision
  /** The signed-in person who decided. Their name is read from their profile and kept with the decision. */
  userId: string
  note?: string | null
}

/** The one line a teacher reads when an approval could not be saved. The step it belonged to did not happen. */
export const APPROVAL_NOT_SAVED = 'Could not save your approval. Nothing changed. Try again.'

/** Thrown by `withApproval` when the approval could not be saved: the step was not run. Its message is the line to show. */
export class ApprovalNotSaved extends Error {
  constructor() {
    super(APPROVAL_NOT_SAVED)
    this.name = 'ApprovalNotSaved'
  }
}

/** True for the error `withApproval` throws when the approval was not saved (so a caller can tell it from a failure of its own step). */
export function isApprovalNotSaved(e: unknown): e is ApprovalNotSaved {
  return e instanceof ApprovalNotSaved || (e instanceof Error && e.name === 'ApprovalNotSaved')
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Saves the approval row with the person's name as it is today. Answers its id, or null (and logs one line) when it could not be saved. Never throws. */
async function saveApproval(admin: JemmaDb, a: ApprovalInput): Promise<string | null> {
  try {
    const profile = await admin.from('profiles').select('display_name').eq('user_id', a.userId).maybeSingle()
    const name = profile.data?.display_name?.trim() || 'Someone'
    const id = crypto.randomUUID()
    const { error } = await admin.from('approvals').insert({
      id,
      school_id: a.schoolId,
      kind: a.kind,
      ref_id: a.refId,
      child_id: a.childId ?? null,
      decision: a.decision,
      decided_by: a.userId,
      decided_by_name: name,
      note: a.note ?? null,
    })
    if (error) {
      console.error(`approvals: could not save the ${a.kind} ${a.decision} for ${a.refId}: ${error.message}`)
      return null
    }
    return id
  } catch (e) {
    console.error(`approvals: could not save the ${a.kind} ${a.decision} for ${a.refId}: ${why(e)}`)
    return null
  }
}

/** Takes back the approval row of a step that did not happen. A best effort: if it fails, one line is logged. Never throws. */
async function removeApproval(admin: JemmaDb, id: string, a: ApprovalInput): Promise<void> {
  try {
    const { error } = await admin.from('approvals').delete().eq('id', id)
    if (error) console.error(`approvals: could not take back the ${a.kind} ${a.decision} for ${a.refId} (row ${id}) after its step did not happen: ${error.message}`)
  } catch (e) {
    console.error(`approvals: could not take back the ${a.kind} ${a.decision} for ${a.refId} (row ${id}) after its step did not happen: ${why(e)}`)
  }
}

export type WithApprovalOptions<T> = {
  /**
   * For a step that answers instead of throwing (a write that matched no row, a refusal): false means the step did not happen, so the
   * approval is taken back and the answer is handed back as it is.
   */
  happened?: (result: T) => boolean
}

/**
 * The only way to record an approval: the approval row is saved FIRST, then `step` (the write the teacher's tap is for) runs.
 * - The approval cannot be saved: `step` never runs and `ApprovalNotSaved` is thrown (its message is the one line for the screen).
 * - `step` throws: the approval row just written is deleted (a best effort, logged) and the error is thrown again, so the log never shows
 *   an approval for a step that did not happen.
 * - `step` answers and `happened` says it did nothing: the same, and the answer is returned.
 * `admin` is the service client (the table has no insert policy). The two writes are not one database transaction: if the delete fails too,
 * the row stays and one line is logged.
 */
export async function withApproval<T>(admin: JemmaDb, a: ApprovalInput, step: () => Promise<T>, opts: WithApprovalOptions<T> = {}): Promise<T> {
  const id = await saveApproval(admin, a)
  if (!id) throw new ApprovalNotSaved()
  let result: T
  try {
    result = await step()
  } catch (e) {
    await removeApproval(admin, id, a)
    throw e
  }
  if (opts.happened && !opts.happened(result)) await removeApproval(admin, id, a)
  return result
}
