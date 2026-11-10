import type { JemmaDb } from '@jemma/profiling/db'

/** What was decided on: the topic map, the answer key, a mark, a paper, a link request, a reteach or a homework scan. */
export type ApprovalKind = 'topic_map' | 'answer_key' | 'mark' | 'paper_name' | 'paper' | 'guardian_link' | 'reteach' | 'homework_scan'

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

/**
 * Saves who decided what, with the person's name as it is today. `admin` is the service client (the table has no
 * insert policy). Call it at the end of a successful action. It never throws: if the save fails the action still
 * succeeds and the failure is logged.
 */
export async function recordApproval(admin: JemmaDb, a: ApprovalInput): Promise<void> {
  try {
    const profile = await admin.from('profiles').select('display_name').eq('user_id', a.userId).maybeSingle()
    const name = profile.data?.display_name?.trim() || 'Someone'
    const { error } = await admin.from('approvals').insert({
      school_id: a.schoolId,
      kind: a.kind,
      ref_id: a.refId,
      child_id: a.childId ?? null,
      decision: a.decision,
      decided_by: a.userId,
      decided_by_name: name,
      note: a.note ?? null,
    })
    if (error) console.error(`approvals: could not save the ${a.kind} ${a.decision} for ${a.refId}: ${error.message}`)
  } catch (e) {
    console.error(`approvals: could not save the ${a.kind} ${a.decision} for ${a.refId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
