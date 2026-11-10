import type { JemmaDb } from '@jemma/profiling/db'
import { notify } from '@jemma/profiling/notify'
import type { LongViewStatus } from '@jemma/profiling/schemas'
import { sendEvent } from './agent'
import { recordApproval } from './approvals'
import { OPEN_UPDATE_GAP_MS, STALE_AFTER_MS } from './data/p52'
import { createSupabaseAdmin } from './supabase/admin'

// The Long view's two server-side jobs: asking the agent for an update, and the teacher's decisions on a pattern.
// Nothing here talks to a model. Both take their clients as arguments, so tests can run them against a real database.

const EVENT = 'long_view.requested'

export type RequestDeps = {
  /** The service client. Reads which updates are already waiting. */
  admin?: JemmaDb
  send?: typeof sendEvent
  now?: () => Date
}

export type RequestResult = { sent: string[]; skipped: string[]; failed: string[] }

/**
 * Asks the agent to update the Long view of each child: one `long_view.requested` per child, skipping a child that already
 * has one queued or running (one that has waited longer than the screen waits is taken as lost, and does not block a new one).
 * Never throws, so a caller such as `saveNote` can call it without risk: a child it could not ask for comes back in `failed`.
 * An update the agent could not be told about is marked failed at once, so the screen shows the retry card instead of waiting.
 */
export async function requestLongView(childIds: string[], deps: RequestDeps = {}): Promise<RequestResult> {
  const ids = [...new Set(childIds)]
  const result: RequestResult = { sent: [], skipped: [], failed: [] }
  if (ids.length === 0) return result
  const now = deps.now ?? (() => new Date())
  const send = deps.send ?? sendEvent
  try {
    const admin = deps.admin ?? createSupabaseAdmin()
    const since = new Date(now().getTime() - STALE_AFTER_MS).toISOString()
    const waiting = await admin.from('events').select('payload').eq('type', EVENT).in('status', ['queued', 'running']).gte('created_at', since)
    if (waiting.error) throw new Error(waiting.error.message)
    const busy = new Set((waiting.data ?? []).map((e) => (e.payload as { childId?: string } | null)?.childId))
    for (const childId of ids) {
      if (busy.has(childId)) {
        result.skipped.push(childId)
        continue
      }
      const asked = now().toISOString()
      try {
        await send(EVENT, { childId })
        result.sent.push(childId)
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        console.error(`${EVENT} for ${childId} not delivered: ${reason}`)
        result.failed.push(childId)
        // The event row is recorded before it is posted. Nobody will pick it up now, so close it.
        await admin
          .from('events')
          .update({ status: 'failed', error: reason, finished_at: now().toISOString() })
          .eq('type', EVENT)
          .eq('status', 'queued')
          .eq('payload->>childId', childId)
          .gte('created_at', asked)
      }
    }
  } catch (e) {
    console.error(`${EVENT} not requested: ${e instanceof Error ? e.message : String(e)}`)
    for (const childId of ids) if (!result.sent.includes(childId) && !result.skipped.includes(childId) && !result.failed.includes(childId)) result.failed.push(childId)
  }
  return result
}

export type OpenDeps = RequestDeps & {
  /** The signed-in teacher's own client. */
  teacher: JemmaDb
  admin: JemmaDb
}

/**
 * Called when the teacher opens a learner's Long view: asks for an update only when the learner has no pattern rows at all
 * and no update was asked for in the last 10 minutes. `refused` when the signed-in person does not teach the learner.
 */
export async function requestIfEmpty(deps: OpenDeps, childId: string): Promise<'sent' | 'skipped' | 'refused'> {
  const { teacher, admin } = deps
  const teaches = await teacher.rpc('teaches_child', { child: childId })
  if (teaches.error || teaches.data !== true) return 'refused'
  const patterns = await admin.from('long_view_patterns').select('id').eq('child_id', childId).limit(1)
  if (patterns.error || (patterns.data?.length ?? 0) > 0) return 'skipped'
  const since = new Date(((deps.now ?? (() => new Date()))()).getTime() - OPEN_UPDATE_GAP_MS).toISOString()
  const recent = await admin.from('events').select('id').eq('type', EVENT).eq('payload->>childId', childId).gte('created_at', since).limit(1)
  if (recent.error || (recent.data?.length ?? 0) > 0) return 'skipped'
  const r = await requestLongView([childId], deps)
  return r.sent.length > 0 ? 'sent' : 'skipped'
}

// ---------- the teacher's decisions ----------

export type Decision = 'approve' | 'dismiss' | 'restore' | 'discuss'

export type DecideDeps = {
  /** The signed-in teacher's own client: row level security and `teaches_child` decide whether they may decide at all. */
  teacher: JemmaDb
  /** The service client. Writes the decision. */
  admin: JemmaDb
  userId: string
  now?: () => Date
}

export type DecideResult = { ok: true; status: LongViewStatus; childId: string } | { ok: false; reason: string }

const refuse = (reason: string): DecideResult => ({ ok: false, reason })

/**
 * The teacher's decision on one pattern, with the transitions the screen offers:
 * - approve: a draft becomes approved (who and when are stored, the approval is logged with the teacher's name)
 * - dismiss: a draft or an approved pattern is set aside (a shared one cannot be)
 * - restore: a set aside pattern goes back to a draft
 * - discuss: only an approved pattern, and only when an approved parent link exists. It becomes shared, the approval is logged,
 *   and the approved parents are told. This is the one place a parent is told.
 * The teacher's own session must see the pattern and teach the child before anything is written. The write names the status it
 * expects, so two taps at once cannot decide twice. After approve, dismiss or restore the open `review_long_view` item is closed
 * when no draft is left.
 */
export async function decidePattern(deps: DecideDeps, decision: Decision, patternId: string): Promise<DecideResult> {
  const { teacher, admin, userId } = deps
  const stamp = (deps.now ?? (() => new Date()))().toISOString()

  const seen = await teacher.from('long_view_patterns').select('id, child_id, status, active').eq('id', patternId).maybeSingle()
  if (seen.error || !seen.data) return refuse('This pattern was not found.')
  const p = seen.data
  const teaches = await teacher.rpc('teaches_child', { child: p.child_id })
  if (teaches.error || teaches.data !== true) return refuse('Only the class teacher can decide on this.')
  const child = await teacher.from('children').select('id, first_name, school_id').eq('id', p.child_id).maybeSingle()
  if (child.error || !child.data) return refuse('This learner was not found.')
  const profile = await admin.from('profiles').select('display_name').eq('user_id', userId).maybeSingle()
  const teacherName = profile.data?.display_name?.trim() || 'Someone'
  const approval = { schoolId: child.data.school_id, refId: p.id, childId: p.child_id, userId }

  const move = async (from: LongViewStatus[], patch: Record<string, unknown>): Promise<boolean> => {
    const done = await admin
      .from('long_view_patterns')
      .update({ ...patch, updated_at: stamp })
      .eq('id', p.id)
      .in('status', from)
      .select('id')
    return !done.error && (done.data?.length ?? 0) > 0
  }

  let status: LongViewStatus
  if (decision === 'approve') {
    if (!p.active) return refuse('This no longer shows in the results.')
    if (p.status !== 'draft') return refuse('This pattern was already decided.')
    status = 'approved'
    if (!(await move(['draft'], { status, approved_by: userId, approved_by_name: teacherName, approved_at: stamp }))) return refuse('This pattern was already decided.')
    await recordApproval(admin, { ...approval, kind: 'long_view_pattern', decision: 'approved' })
  } else if (decision === 'dismiss') {
    if (p.status === 'discussed') return refuse('You have shared this pattern, so it cannot be set aside.')
    if (p.status !== 'draft' && p.status !== 'approved') return refuse('This pattern was already set aside.')
    status = 'dismissed'
    if (!(await move(['draft', 'approved'], { status, dismissed_by: userId, dismissed_at: stamp }))) return refuse('This pattern was already decided.')
    await recordApproval(admin, { ...approval, kind: 'long_view_pattern', decision: 'declined' })
  } else if (decision === 'restore') {
    if (!p.active) return refuse('This no longer shows in the results.')
    if (p.status !== 'dismissed') return refuse('Only a pattern you set aside can be brought back.')
    status = 'draft'
    const cleared = { status, dismissed_by: null, dismissed_at: null, approved_by: null, approved_by_name: null, approved_at: null }
    if (!(await move(['dismissed'], cleared))) return refuse('This pattern was already brought back.')
  } else {
    if (!p.active) return refuse('This no longer shows in the results.')
    if (p.status !== 'approved') return refuse('Say that it looks right first, then talk to the parent.')
    const links = await admin.from('parent_links').select('parent_id').eq('child_id', p.child_id).eq('status', 'approved')
    const parents = [...new Set((links.data ?? []).map((l) => l.parent_id))]
    if (links.error || parents.length === 0) return refuse('No parent is linked yet. This stays with you.')
    status = 'discussed'
    if (!(await move(['approved'], { status, discussed_by: userId, discussed_by_name: teacherName, discussed_at: stamp }))) return refuse('This pattern was already shared.')
    await recordApproval(admin, { ...approval, kind: 'long_view_talk', decision: 'confirmed' })
    try {
      await notify(admin, parents, {
        title: `${teacherName} shared something from your talk`,
        body: `Open ${child.data.first_name}'s Long view.`,
        href: `/p/${p.child_id}/long-view`,
      })
    } catch (e) {
      // The pattern is shared and logged. The parent can still open it from the profile page.
      console.error(`long view: could not tell the parents of ${p.child_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (decision !== 'discuss') await closeReviewIfNoDraft(admin, p.child_id)
  return { ok: true, status, childId: p.child_id }
}

/** Closes the open "look at this Long view" item once the child has no draft pattern left to look at. */
export async function closeReviewIfNoDraft(admin: JemmaDb, childId: string): Promise<void> {
  const drafts = await admin.from('long_view_patterns').select('id').eq('child_id', childId).eq('status', 'draft').eq('active', true).limit(1)
  if (drafts.error || (drafts.data?.length ?? 0) > 0) return
  await admin.from('needs_you_items').update({ status: 'done' }).eq('kind', 'review_long_view').eq('ref_id', childId).eq('status', 'open')
}
