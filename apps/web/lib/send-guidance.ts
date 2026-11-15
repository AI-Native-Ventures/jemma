import type { JemmaDb } from '@jemma/profiling/db'
import { GuidanceSchema } from '@jemma/profiling/schemas'
import { recordApproval } from './approvals'

// "Send to family": the one tap that lets a family read a guidance card Jemma wrote. Jemma saves a new card for a school child as a draft
// (`guidance_drafts`, readable by the child's teachers only). Sending copies the draft into `guidance_cards`, which is what a parent and the
// learner read, removes the draft, and records who sent it. Until then the family keeps the card it had, or none.
// Takes its clients as arguments, so tests can run it against doubles or a real database.

export type SendGuidanceDeps = {
  /** The signed-in teacher's own client: row level security and `teaches_class` decide whether they may send at all. */
  teacher: JemmaDb
  /** The service client. Reads the draft and writes the card, the removal and the approval. */
  admin: JemmaDb
  userId: string
  now?: () => Date
}

export type SendGuidanceResult = { ok: true; sent: boolean } | { ok: false; message: string }

const refuse = (message: string): SendGuidanceResult => ({ ok: false, message })

/**
 * Sends the waiting draft of one learner of a class to the family. The teacher's own session must teach the class, and the learner must be in it.
 * A draft that is not a well formed card is refused and stays. The card is copied first and the draft removed after, so a stop in between leaves
 * a card and a draft that say the same, never a lost card. The draft is removed only if it is still the one that was read: a newer draft that
 * Jemma wrote in the meantime stays for the teacher. Sending twice (or two taps at once) does it once: only the tap that removed the draft records the
 * approval, and a tap that finds no draft answers `sent: false` and changes nothing.
 */
export async function sendGuidance(deps: SendGuidanceDeps, classId: string, childId: string): Promise<SendGuidanceResult> {
  const { teacher, admin, userId } = deps
  const now = (deps.now ?? (() => new Date()))()

  const teaches = await teacher.rpc('teaches_class', { cls: classId })
  if (teaches.error || teaches.data !== true) return refuse('Only the class teacher can send this.')
  const [cls, enrolled] = await Promise.all([
    teacher.from('classes').select('id, school_id').eq('id', classId).maybeSingle(),
    admin.from('enrolments').select('child_id').eq('class_id', classId).eq('child_id', childId).maybeSingle(),
  ])
  if (cls.error || !cls.data) return refuse('That class is not yours.')
  if (enrolled.error || !enrolled.data) return refuse('That learner is not in this class.')

  const draft = await admin.from('guidance_drafts').select('content, created_at, updated_at').eq('child_id', childId).maybeSingle()
  if (draft.error) return refuse('Could not read the card. Try again.')
  if (!draft.data) return { ok: true, sent: false } // someone sent it already, or Jemma has written nothing new
  if (!GuidanceSchema.safeParse(draft.data.content).success) return refuse('This card could not be read, so it was not sent.')

  const card = await admin.from('guidance_cards').select('created_at').eq('child_id', childId).maybeSingle()
  if (card.error) return refuse('Could not send the card. Try again.')
  const copied = await admin
    .from('guidance_cards')
    .upsert({ child_id: childId, content: draft.data.content, created_at: card.data?.created_at ?? draft.data.created_at, updated_at: now.toISOString() }, { onConflict: 'child_id' })
  if (copied.error) return refuse('Could not send the card. Try again.')

  const removed = await admin.from('guidance_drafts').delete().eq('child_id', childId).eq('updated_at', draft.data.updated_at).select('child_id')
  let mine = true
  if (removed.error) {
    // The card is sent. The draft stays and shows again, which does no harm: sending it again changes nothing for the family.
    console.error(`send guidance: the card of ${childId} is sent, but its draft was not removed: ${removed.error.message}`)
  } else if ((removed.data?.length ?? 0) === 0) {
    // Another tap that sent the same draft removed it first: it records the approval, this one does not. A newer draft in its place means this tap did send.
    mine = (await admin.from('guidance_drafts').select('child_id').eq('child_id', childId).maybeSingle()).data !== null
  }
  if (!mine) return { ok: true, sent: false }

  const child = await admin.from('children').select('first_name').eq('id', childId).maybeSingle()
  await recordApproval(admin, { schoolId: cls.data.school_id, kind: 'guidance', refId: childId, childId, decision: 'shared', userId, note: child.data?.first_name ?? null })
  return { ok: true, sent: true }
}
