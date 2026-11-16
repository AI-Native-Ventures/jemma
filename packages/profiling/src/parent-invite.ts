import type { JemmaDb } from './db'
import { capsClassName } from './own-class-names'
import { maybe, ok } from './tools/context'

// A parent links to a learner who signed up alone (P114). The learner makes a short code on their own screen and shows it to a parent or guardian; the
// parent types it on "Add a child" and is linked to the learner at once. The learner giving the code is the consent, so no teacher says yes. The code is
// 6 letters and numbers without look-alikes, works for 7 days and works once. One live code for each learner: a new code replaces the old one.
// Server only: every function takes the service client and checks who is asking.

export const PARENT_CODE_LENGTH = 6
export const PARENT_CODE_DAYS = 7
/** Letters and numbers a person cannot mix up: no 0 or O, no 1, I or L. */
export const PARENT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** What a person reads when a code cannot be made or used. A message is plain words. */
export class ParentCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParentCodeError'
  }
}

const codeOf = (e: unknown): string | undefined => (e && typeof e === 'object' ? (e as { code?: string }).code : undefined)

/** One new code. A byte is used only when it falls inside a whole number of rounds of the alphabet, so every letter is as likely as the others. */
export function newParentCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const limit = 256 - (256 % PARENT_CODE_ALPHABET.length)
  let code = ''
  while (code.length < PARENT_CODE_LENGTH) {
    for (const byte of random(PARENT_CODE_LENGTH * 2)) {
      if (byte < limit && code.length < PARENT_CODE_LENGTH) code += PARENT_CODE_ALPHABET[byte % PARENT_CODE_ALPHABET.length]
    }
  }
  return code
}

/** When a code made at `now` stops working. */
export const parentCodeExpiry = (now: Date): string => new Date(now.getTime() + PARENT_CODE_DAYS * 24 * 60 * 60 * 1000).toISOString()

/** A code as people type it: any case, with stray spaces and dashes taken out. */
export const cleanParentCode = (raw: unknown): string => (typeof raw === 'string' ? raw : '').replace(/[\s-]+/g, '').toUpperCase()

const SHAPE = new RegExp(`^[${PARENT_CODE_ALPHABET}]{${PARENT_CODE_LENGTH}}$`)
/** True when `code` (already cleaned) has the shape of a code this file makes. A code of another shape is never looked up. */
export const isParentCode = (code: string): boolean => SHAPE.test(code)

export type MadeParentCode = { code: string; expiresAt: string }

/**
 * The learner who is acting, and only a learner who signed up on their own: the child whose `user_id` is this login, in a personal school, and not a
 * private twin of a school child. Anyone else is refused. A learner of a school is linked to a parent by the teacher, not by a code.
 */
async function mustBeIndependentLearner(db: JemmaDb, childId: string, actorUserId: string): Promise<void> {
  const child = await maybe(db.from('children').select('id, school_id, user_id, private_of').eq('id', childId).maybeSingle())
  if (!child || (child.private_of ?? null) !== null || (child.user_id ?? null) === null || child.user_id !== actorUserId) throw new ParentCodeError('Only you can make a code for yourself.')
  const school = await maybe(db.from('schools').select('kind').eq('id', child.school_id).maybeSingle())
  if (school?.kind !== 'private') throw new ParentCodeError('A code is for a learner who signed up on their own.')
}

/**
 * Makes a new code for the learner `childId` and takes any earlier code of theirs away: the old code stops working at once. The code works for 7 days from
 * `now`. Only the learner's own login may ask, and only for a learner who signed up on their own. A code someone else holds is not made twice (the table
 * keeps every code once), so the call tries again with another code a few times.
 */
export async function makeParentCode(db: JemmaDb, input: { childId: string; actorUserId: string }, now: Date = new Date(), random?: (n: number) => Uint8Array): Promise<MadeParentCode> {
  await mustBeIndependentLearner(db, input.childId, input.actorUserId)
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newParentCode(random)
    const expiresAt = parentCodeExpiry(now)
    const gone = await db.from('parent_invite_codes').delete().eq('child_id', input.childId)
    if (gone.error) throw new Error(`could not make a code: ${gone.error.message}`)
    const made = await db.from('parent_invite_codes').insert({ child_id: input.childId, code, expires_at: expiresAt }).select('code, expires_at').single()
    if (made.data) return { code: made.data.code, expiresAt: made.data.expires_at }
    // 23505: the code is held by another learner, or two taps at once made this learner's row first. Either way, try again.
    if (codeOf(made.error) !== '23505') throw new Error(`could not make a code: ${made.error?.message ?? 'no row'}`)
  }
  throw new Error('could not make a code: no free code')
}

/** The learner's code that still works at `now`, or null when they have none or it has run out. Only the learner's own login may ask. */
export async function currentParentCode(db: JemmaDb, input: { childId: string; actorUserId: string }, now: Date = new Date()): Promise<MadeParentCode | null> {
  await mustBeIndependentLearner(db, input.childId, input.actorUserId)
  const row = await maybe(db.from('parent_invite_codes').select('code, expires_at').eq('child_id', input.childId).maybeSingle())
  return row && new Date(row.expires_at).getTime() > now.getTime() ? { code: row.code, expiresAt: row.expires_at } : null
}

export const BAD_CODE = 'That code is not right. Check it with your child.'
export const OLD_CODE = 'That code has run out. Ask your child for a new one.'
const TRY_AGAIN = 'Could not link your child. Try again.'

export type LinkedChild = { childId: string; firstName: string }
export type LinkResult = ({ ok: true } & LinkedChild) | { ok: false; reason: string }

/**
 * A parent links to the learner whose code they typed. The code is taken away first, in one step, so two parents with the same code cannot both use it:
 * the code works once. A code of the wrong shape, a code nobody has and a code that was used all answer the same sentence; a code past its 7 days says so.
 * The link is approved at once (the learner gave the code, and that is the consent), on the learner's own CAPS class (`parent_links.class_id` cannot be
 * null); a parent who already has a link to the learner, waiting or turned down, gets it approved and no second link is made. A failure after the code was
 * taken puts the code back. Only a signed-in parent may ask; the caller has checked that `parentId` is that parent.
 */
export async function linkParentWithCode(db: JemmaDb, input: { parentId: string; code: unknown }, now: Date = new Date()): Promise<LinkResult> {
  const clean = cleanParentCode(input.code)
  if (!isParentCode(clean)) return { ok: false, reason: BAD_CODE }
  const profile = await maybe(db.from('profiles').select('role').eq('user_id', input.parentId).maybeSingle())
  if (profile?.role !== 'parent') return { ok: false, reason: 'Only a parent can link a child.' }

  const taken = await db.from('parent_invite_codes').delete().eq('code', clean).select('child_id, code, expires_at')
  if (taken.error) return { ok: false, reason: TRY_AGAIN }
  const row = taken.data?.[0]
  if (!row) return { ok: false, reason: BAD_CODE }
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, reason: OLD_CODE }

  const putBack = async () => {
    await db.from('parent_invite_codes').insert({ child_id: row.child_id, code: row.code, expires_at: row.expires_at })
  }
  try {
    const child = await maybe(db.from('children').select('id, first_name, grade, school_id, private_of').eq('id', row.child_id).maybeSingle())
    const school = child ? await maybe(db.from('schools').select('kind').eq('id', child.school_id).maybeSingle()) : null
    if (!child || (child.private_of ?? null) !== null || school?.kind !== 'private') return { ok: false, reason: BAD_CODE }

    // The class the link is tied to: the CAPS class of the learner's grade, else the first class they are in.
    const enrolled = await ok(db.from('enrolments').select('class_id').eq('child_id', child.id))
    const classes = enrolled.length === 0 ? [] : await ok(db.from('classes').select('id, name, grade, created_at').in('id', enrolled.map((e) => e.class_id)))
    const sorted = [...classes].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const home = sorted.find((c) => c.grade === child.grade && c.name === capsClassName(child.grade)) ?? sorted[0]
    if (!home) throw new Error('the learner has no class')

    const consent = { guardian: true, teach: true, improve: false }
    const existing = await maybe(db.from('parent_links').select('id, status').eq('parent_id', input.parentId).eq('child_id', child.id).maybeSingle())
    if (existing?.status === 'approved') return { ok: true, childId: child.id, firstName: child.first_name }
    if (existing) await ok(db.from('parent_links').update({ status: 'approved', consent, decided_at: now.toISOString() }).eq('id', existing.id).select('id'))
    else await ok(db.from('parent_links').insert({ parent_id: input.parentId, child_id: child.id, class_id: home.id, status: 'approved', consent, decided_at: now.toISOString() }).select('id'))
    return { ok: true, childId: child.id, firstName: child.first_name }
  } catch {
    await putBack().catch(() => undefined)
    return { ok: false, reason: TRY_AGAIN }
  }
}
