import * as invite from '@jemma/profiling/parent-invite'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// A parent links to a learner who signed up alone (P114), for the web app. The work is in `packages/profiling/src/parent-invite.ts` (the tests use it
// too); these are the same functions with the service client filled in, as the screens and the actions call them. The service client bypasses row level
// security, so every function here checks who is asking: the learner's own login to make or read a code, a signed-in parent to use one.

export { BAD_CODE, cleanParentCode, isParentCode, OLD_CODE, ParentCodeError, PARENT_CODE_DAYS, PARENT_CODE_LENGTH } from '@jemma/profiling/parent-invite'
export type { LinkResult, MadeParentCode } from '@jemma/profiling/parent-invite'

/**
 * The learner's own child when they signed up on their own: the child whose `user_id` is this login, in a personal school, and not a private twin of a
 * school child. Null for a learner of a school (a teacher or a parent links them), for a login with no child and for a parent. Read with the service
 * client for a login the caller has already checked is the signed-in person.
 */
export async function independentChildOf(userId: string): Promise<{ id: string; firstName: string } | null> {
  const db = createSupabaseAdmin()
  const { data: child } = await db.from('children').select('id, first_name, school_id').eq('user_id', userId).is('private_of', null).limit(1).maybeSingle()
  if (!child) return null
  const { data: school } = await db.from('schools').select('kind').eq('id', child.school_id).maybeSingle()
  return school?.kind === 'private' ? { id: child.id, firstName: child.first_name } : null
}

/** Makes a new code for the learner `childId` (the learner's own login `actorUserId`, who signed up alone) and takes the earlier one away. */
export async function makeParentCode(childId: string, actorUserId: string): Promise<invite.MadeParentCode> {
  return invite.makeParentCode(createSupabaseAdmin(), { childId, actorUserId })
}

/** The learner's code that still works, or null. Only the learner's own login may ask. */
export async function currentParentCode(childId: string, actorUserId: string): Promise<invite.MadeParentCode | null> {
  return invite.currentParentCode(createSupabaseAdmin(), { childId, actorUserId })
}

/** A signed-in parent (`parentId`) links to the learner whose code they typed: an approved link, and the code is used up. */
export async function linkParentWithCode(parentId: string, code: string): Promise<invite.LinkResult> {
  return invite.linkParentWithCode(createSupabaseAdmin(), { parentId, code })
}
