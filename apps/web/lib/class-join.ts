import type { JemmaDb } from '@jemma/profiling/db'
import { isApprovalNotSaved, withApproval } from './approvals'

// A learner who signed up alone joins their school class (P112). The learner types the teacher's class code and a request waits in the teacher's
// Needs you; the teacher says who the learner is (a learner of the class who has no login yet, or a new learner) and yes or no. On a yes the learner
// gets a school record in the class and their own record becomes its twin (`children.private_of`, P94): "My school" is the official side and "My own"
// keeps the grades and the practice the learner already had. Every function takes the service client and the ids it needs and checks who may ask, so
// the server actions stay thin and a test can run them on stand-in rows. Relative imports only.

/** A class code as people type it: any case, stray spaces. */
export const cleanJoinCode = (raw: string | null | undefined): string => (raw ?? '').replace(/\s+/g, '').toUpperCase()

const NO_CLASS = 'No class has that code. Check it with your teacher.'
const NOT_SENT = 'Could not send the request. Try again.'
const HAS_SCHOOL = 'You already have a school class.'
const ANSWERED = 'This request was already answered.'
const NOT_FINISHED = 'Could not finish. Nothing was lost: try again.'

const why = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Own = { id: string; firstName: string }
/** What a login is: a learner on their own (one record, in a personal school), a learner who has a school record (or a twin), or no learner at all. */
type Who = { kind: 'own'; own: Own } | { kind: 'school' } | { kind: 'none' }

/** Who the login is, by the children that hold it. Only a learner on their own may ask to join: a school record or a twin means a school class is already there. */
async function whoIs(admin: JemmaDb, userId: string): Promise<Who> {
  const { data } = await admin.from('children').select('id, first_name, school_id, private_of').eq('user_id', userId)
  const rows = data ?? []
  if (rows.length === 0) return { kind: 'none' }
  if (rows.some((r) => r.private_of)) return { kind: 'school' }
  const { data: schools } = await admin.from('schools').select('id, kind').in('id', rows.map((r) => r.school_id))
  const kinds = new Map((schools ?? []).map((s) => [s.id, s.kind]))
  // A school that cannot be read counts as a school: the learner is not offered a second class on a guess.
  if (rows.some((r) => (kinds.get(r.school_id) ?? 'school') !== 'private')) return { kind: 'school' }
  return { kind: 'own', own: { id: rows[0]!.id, firstName: rows[0]!.first_name } }
}

/** The class name and the teacher's name for a class, for "Waiting for {teacher} to say yes." */
async function classAndTeacher(admin: JemmaDb, classId: string): Promise<{ className: string; teacherName: string } | null> {
  const { data: cls } = await admin.from('classes').select('name, teacher_id').eq('id', classId).maybeSingle()
  if (!cls) return null
  const { data: teacher } = await admin.from('profiles').select('display_name').eq('user_id', cls.teacher_id).maybeSingle()
  return { className: cls.name, teacherName: teacher?.display_name?.trim() || 'your teacher' }
}

export type SendResult = { ok: true; requestId: string; teacherName: string; className: string } | { ok: false; message: string }

/**
 * The learner types the teacher's class code. A request is written and an "approve join" item goes into the teacher's Needs you. Refused, with one plain
 * sentence and nothing written: no code, a code no class has (a personal class does not count), a login that is not a learner on their own, a learner who
 * already has a school class, and a learner whose request is still waiting (one at a time). A learner may ask again after a no.
 * `userId` is the signed-in learner: the caller has checked it.
 */
export async function requestToJoin(admin: JemmaDb, input: { userId: string; code: string }): Promise<SendResult> {
  const code = cleanJoinCode(input.code)
  if (!code) return { ok: false, message: "Type your teacher's class code." }
  const who = await whoIs(admin, input.userId)
  if (who.kind === 'none') return { ok: false, message: 'Only a learner who signed up on their own can join a class.' }
  if (who.kind === 'school') return { ok: false, message: HAS_SCHOOL }
  const { own } = who

  const { data: waiting } = await admin.from('class_join_requests').select('id, class_id').eq('own_child_id', own.id).eq('status', 'pending').maybeSingle()
  if (waiting) {
    const there = await classAndTeacher(admin, waiting.class_id)
    return { ok: false, message: `You already asked. Waiting for ${there?.teacherName ?? 'your teacher'} to say yes.` }
  }

  if (code.length !== 6) return { ok: false, message: NO_CLASS }
  const { data: cls } = await admin.from('classes').select('id, name, teacher_id, school_id').eq('join_code', code).maybeSingle()
  if (!cls) return { ok: false, message: NO_CLASS }
  const { data: school } = await admin.from('schools').select('kind').eq('id', cls.school_id).maybeSingle()
  if (!school || school.kind === 'private') return { ok: false, message: NO_CLASS }
  const there = await classAndTeacher(admin, cls.id)

  const made = await admin.from('class_join_requests').insert({ class_id: cls.id, own_child_id: own.id, requested_name: own.firstName, status: 'pending' }).select('id').single()
  if (made.error || !made.data) {
    // The one waiting request of a learner is also held by the database: a second tap at the same moment lands here.
    if (made.error?.code === '23505') return { ok: false, message: `You already asked. Waiting for ${there?.teacherName ?? 'your teacher'} to say yes.` }
    console.error(`class join: could not save the request of ${own.id}: ${made.error?.message ?? 'no row'}`)
    return { ok: false, message: NOT_SENT }
  }
  const requestId = made.data.id
  const item = await admin.from('needs_you_items').insert({
    owner_id: cls.teacher_id,
    school_id: cls.school_id,
    child_id: own.id,
    kind: 'approve_join',
    ref_id: requestId,
    title: `${own.firstName} wants to join ${cls.name}`,
    detail: `Signed up alone · code ${code}`,
  })
  if (item.error) {
    // A request the teacher can never see would wait for ever: take it back.
    await admin.from('class_join_requests').delete().eq('id', requestId)
    console.error(`class join: could not tell the teacher about request ${requestId}: ${item.error.message}`)
    return { ok: false, message: NOT_SENT }
  }
  return { ok: true, requestId, teacherName: there?.teacherName ?? 'your teacher', className: cls.name }
}

/** What the learner's "Join your school class" card shows: nothing, the code form (with a note after a no), or the waiting line. */
export type JoinCard = { kind: 'hidden' } | { kind: 'form'; declined: boolean } | { kind: 'waiting'; teacherName: string; className: string }

/**
 * The card for the signed-in learner. Only a learner on their own sees it. A table that cannot be read (the migration is not applied yet) shows the
 * form, never an error.
 */
export async function joinCardFor(admin: JemmaDb, userId: string): Promise<JoinCard> {
  const who = await whoIs(admin, userId)
  if (who.kind !== 'own') return { kind: 'hidden' }
  let rows: { class_id: string; status: string }[] = []
  try {
    const { data } = await admin.from('class_join_requests').select('class_id, status').eq('own_child_id', who.own.id).order('created_at', { ascending: false })
    rows = data ?? []
  } catch {
    rows = []
  }
  const pending = rows.find((r) => r.status === 'pending')
  if (pending) {
    const there = await classAndTeacher(admin, pending.class_id)
    if (there) return { kind: 'waiting', ...there }
  }
  return { kind: 'form', declined: rows[0]?.status === 'declined' }
}

/** Who the learner is, as the teacher says it: a learner of the class who has no login yet, or a new one. */
export type JoinChoice = { kind: 'existing'; childId: string } | { kind: 'new' }
export type DecideResult = { ok: true } | { ok: false; message: string }

type Step = { done: boolean }

/**
 * The teacher's yes or no. The approval is saved first (`withApproval`, kind `class_join`); then the step runs:
 * - the request is claimed (waiting to approved, in one write that only a waiting request matches, so two taps or two teachers make one yes);
 * - the school record: an existing learner of the class gets the learner's login, or a new child (first name, the class grade, the login) is made and
 *   enrolled; a school child that already holds the login in this school is used again, so a tap after a half failure never makes a second one;
 * - the learner's own record becomes the twin of that school child (`private_of`): it keeps its grades and practice;
 * - the Needs you item is closed.
 * A failure after the claim gives the request back (waiting again) and takes the approval back. A no only closes the request.
 * Refused with one plain sentence before anything is approved: a request already answered or of another class, a yes with no choice, a child who is
 * not in the class or already has a login, a learner who already has a school class. `teacherId` and `schoolId` are the signed-in teacher of `classId`:
 * the caller has checked it.
 */
export async function decideJoin(
  admin: JemmaDb,
  input: { classId: string; requestId: string; teacherId: string; schoolId: string; decision: 'approved' | 'declined'; choice?: JoinChoice },
): Promise<DecideResult> {
  const { classId, requestId, teacherId, schoolId, decision } = input
  const { data: req } = await admin.from('class_join_requests').select('id, class_id, own_child_id, status').eq('id', requestId).eq('class_id', classId).maybeSingle()
  if (!req || req.status !== 'pending') return { ok: false, message: ANSWERED }

  let plan: { classSchoolId: string; grade: number; ownName: string; learnerId: string; choice: JoinChoice } | null = null
  if (decision === 'approved') {
    if (!input.choice) return { ok: false, message: 'Pick who this is first.' }
    const [{ data: cls }, { data: own }] = await Promise.all([
      admin.from('classes').select('school_id, grade').eq('id', classId).maybeSingle(),
      admin.from('children').select('id, first_name, user_id, private_of').eq('id', req.own_child_id).maybeSingle(),
    ])
    if (!cls) return { ok: false, message: 'That class was not found.' }
    if (!own || !own.user_id) return { ok: false, message: 'This learner is no longer here. Decline the request.' }
    if (own.private_of) return { ok: false, message: 'This learner already has a school class.' }
    if (input.choice.kind === 'existing') {
      const childId = input.choice.childId
      const { data: there } = await admin.from('enrolments').select('child_id').eq('class_id', classId).eq('child_id', childId).maybeSingle()
      if (!there) return { ok: false, message: 'That learner is not in this class.' }
      const { data: kid } = await admin.from('children').select('user_id').eq('id', childId).maybeSingle()
      if (!kid) return { ok: false, message: 'That learner is not in this class.' }
      if (kid.user_id && kid.user_id !== own.user_id) return { ok: false, message: 'That learner already has a login. Pick someone else, or add a new learner.' }
    }
    plan = { classSchoolId: cls.school_id, grade: cls.grade, ownName: own.first_name, learnerId: own.user_id, choice: input.choice }
  }

  const now = () => new Date().toISOString()
  const claim = async (status: 'approved' | 'declined'): Promise<boolean> => {
    const { data, error } = await admin
      .from('class_join_requests')
      .update({ status, decided_by: teacherId, decided_at: now() })
      .eq('id', requestId)
      .eq('class_id', classId)
      .eq('status', 'pending')
      .select('id')
    if (error) throw new Error(`could not save: ${error.message}`)
    return Boolean(data?.length)
  }
  const closeItem = async () => {
    await admin.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_join').eq('ref_id', requestId)
  }

  const step = async (): Promise<Step> => {
    if (!plan) {
      if (!(await claim('declined'))) return { done: false }
      await closeItem()
      return { done: true }
    }
    if (!(await claim('approved'))) return { done: false }
    try {
      const schoolChildId = plan.choice.kind === 'existing' ? await giveLogin(admin, plan.choice.childId, plan.learnerId) : await makeSchoolChild(admin, { classId, schoolId: plan.classSchoolId, grade: plan.grade, firstName: plan.ownName, learnerId: plan.learnerId })
      await linkTwin(admin, req.own_child_id, schoolChildId)
      await closeItem()
      return { done: true }
    } catch (e) {
      // Give the request back so the teacher can tap again: every write above is safe to repeat.
      const back = await admin.from('class_join_requests').update({ status: 'pending', decided_by: null, decided_at: null }).eq('id', requestId)
      if (back.error) console.error(`class join: could not give request ${requestId} back after a failure: ${back.error.message}`)
      throw e
    }
  }

  try {
    const result = await withApproval(admin, { schoolId, kind: 'class_join', refId: requestId, childId: req.own_child_id, decision, userId: teacherId }, step, { happened: (r) => r.done })
    return result.done ? { ok: true } : { ok: false, message: ANSWERED }
  } catch (e) {
    if (isApprovalNotSaved(e)) return { ok: false, message: e.message }
    console.error(`class join: request ${requestId} ${decision} did not finish: ${why(e)}`)
    return { ok: false, message: NOT_FINISHED }
  }
}

/** An existing learner of the class gets the learner's login. Already holding it is fine (a repeat); another login is refused. Answers the child's id. */
async function giveLogin(admin: JemmaDb, childId: string, learnerId: string): Promise<string> {
  const { data: kid } = await admin.from('children').select('id, user_id').eq('id', childId).maybeSingle()
  if (!kid) throw new Error('that learner was not found')
  if (kid.user_id === learnerId) return kid.id
  if (kid.user_id) throw new Error('that learner already has a login')
  const { data, error } = await admin.from('children').update({ user_id: learnerId }).eq('id', childId).is('user_id', null).select('id')
  if (error) throw new Error(`could not give the login: ${error.message}`)
  if (!data?.length) throw new Error('that learner already has a login')
  return childId
}

/** A new school child (first name, the class grade, the learner's login) enrolled in the class. A school child of this school that holds the login already is used again. */
async function makeSchoolChild(admin: JemmaDb, input: { classId: string; schoolId: string; grade: number; firstName: string; learnerId: string }): Promise<string> {
  const { data: held } = await admin.from('children').select('id').eq('school_id', input.schoolId).eq('user_id', input.learnerId).is('private_of', null).maybeSingle()
  let childId = held?.id
  if (!childId) {
    const made = await admin.from('children').insert({ school_id: input.schoolId, first_name: input.firstName, grade: input.grade, user_id: input.learnerId }).select('id').single()
    if (made.error || !made.data) throw new Error(`could not add the learner: ${made.error?.message ?? 'no row'}`)
    childId = made.data.id
  }
  const { data: enrolled } = await admin.from('enrolments').select('child_id').eq('class_id', input.classId).eq('child_id', childId).maybeSingle()
  if (!enrolled) {
    const { error } = await admin.from('enrolments').insert({ class_id: input.classId, child_id: childId })
    if (error) throw new Error(`could not enrol the learner: ${error.message}`)
  }
  return childId
}

/** The learner's own record becomes the twin of the school child: it keeps its grades and practice. Already the twin of this child is fine (a repeat). */
async function linkTwin(admin: JemmaDb, ownChildId: string, schoolChildId: string): Promise<void> {
  const { data, error } = await admin.from('children').update({ private_of: schoolChildId }).eq('id', ownChildId).is('private_of', null).select('id')
  if (error) throw new Error(`could not link the learner's own record: ${error.message}`)
  if (data?.length) return
  const { data: now } = await admin.from('children').select('private_of').eq('id', ownChildId).maybeSingle()
  if (now?.private_of !== schoolChildId) throw new Error(`the learner's own record belongs to another school child`)
}

/**
 * The Needs you items of one class, for the class home. An "approve join" item has no child of the class (the learner is not in it yet), so it is kept
 * only where its request is for this class (`joinIds`); every other item is kept as before: it has no child, or its child is in the class.
 */
export function needsOfClass<T extends { child_id: string | null; kind: string; ref_id: string }>(needs: T[], childIds: string[], joinIds: ReadonlySet<string>): T[] {
  return needs.filter((n) => (n.kind === 'approve_join' ? joinIds.has(n.ref_id) : !n.child_id || childIds.includes(n.child_id)))
}
