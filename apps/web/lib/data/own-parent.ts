import { cache } from 'react'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getOwnOverview, type OwnGrade } from '@/lib/own-workspace'

// What a parent's screens need for a child whose school does not use Jemma (P99): is this child on their own, and what has the child practised. A parent
// cannot read a school under row level security (the parent belongs to none), so the kind of the school is read with the service client, for one school
// id of a child the parent's own client has already been allowed to read. Nothing here writes.

/**
 * The kind of a school, 'school' or 'private' (a personal school made for one child). Read with the service client: a parent's own client cannot see
 * any school. A school that cannot be read counts as a school, so a parent's screen never shows less than it always did. Once for each school in a request.
 */
export const kindOfSchool = cache(async (schoolId: string): Promise<string> => {
  try {
    const { data } = await createSupabaseAdmin().from('schools').select('kind').eq('id', schoolId).maybeSingle()
    return data?.kind ?? 'school'
  } catch {
    return 'school'
  }
})

/** The kind of each school in a list, by school id. A school that cannot be read counts as a school. */
export async function kindsOfSchools(schoolIds: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const ids = [...new Set(schoolIds)]
  if (ids.length === 0) return found
  try {
    const { data } = await createSupabaseAdmin().from('schools').select('id, kind').in('id', ids)
    for (const row of data ?? []) found.set(row.id, row.kind)
  } catch {
    // Every school counts as a school.
  }
  return found
}

export type AloneChild = { id: string; firstName: string; grade: number }

/**
 * The signed-in parent's child when the child is on their own (the child of a personal school, with no school behind it), else null. The child is read
 * with the parent's own client, so a child the parent is not linked to is null, and so is a twin (a parent never sees a private workspace as a child).
 * Wrapped in React's `cache`: the layout and the page of one request both ask, and the second gets the first one's answer.
 */
export const aloneOf = cache(async (childId: string): Promise<AloneChild | null> => {
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('id, first_name, grade, school_id, private_of').eq('id', childId).maybeSingle()
  if (!child || child.private_of) return null
  return (await kindOfSchool(child.school_id)) === 'private' ? { id: child.id, firstName: child.first_name, grade: child.grade } : null
})

export type AloneSummary = AloneChild & {
  /** The classes the child has, lowest grade first: the CAPS class of a grade or an own curriculum, with the child's own count. */
  grades: OwnGrade[]
  /** The sign-in code the parent made for the child, or null when none was made yet. The PIN is never kept. */
  loginCode: string | null
}

/** The child's page for the parent: the child, the grades with the child's own counts and the sign-in code. Null unless the child is on their own. */
export async function getAloneSummary(childId: string): Promise<AloneSummary | null> {
  const child = await aloneOf(childId)
  if (!child) return null
  const admin = createSupabaseAdmin()
  const [grades, login] = await Promise.all([getOwnOverview(child.id), admin.from('child_logins').select('code').eq('child_id', child.id).maybeSingle()])
  return { ...child, grades, loginCode: login.data?.code ?? null }
}
