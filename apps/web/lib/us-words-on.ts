import { cache } from 'react'
import { familyCountry } from '@/lib/allowance'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// P164: whether the screens of a space are shown in US English: the country of the family (a parent), of the learner's space (a learner) or of the
// school (a teacher) is the US. A read that fails answers no, so a screen never waits on it or breaks for it.

const isUs = (country: string | null | undefined) => (country ?? '').trim().toUpperCase() === 'US'

/** The country of a school (a learner's own space has a private school of its own, with the family's country). */
export const countryOfSchool = cache(async (schoolId: string): Promise<string | null> => {
  try {
    const { data } = await createSupabaseAdmin().from('schools').select('country').eq('id', schoolId).maybeSingle()
    return data?.country ?? null
  } catch {
    return null
  }
})

/** A learner's screens: the country of the school of the learner's space. */
export async function usForLearner(child: { school_id: string } | null): Promise<boolean> {
  return child ? isUs(await countryOfSchool(child.school_id)) : false
}

/** A parent's screens: the family's country (said at sign-up, else the first child's), else where Cloudflare saw the request. */
export async function usForParent(userId: string, seen: string | null): Promise<boolean> {
  try {
    return isUs(await familyCountry(createSupabaseAdmin(), userId, seen))
  } catch {
    return false
  }
}

/** A teacher's screens: the country of the teacher's school. */
export async function usForTeacher(userId: string): Promise<boolean> {
  try {
    const { data } = await createSupabaseAdmin().from('profiles').select('school_id').eq('user_id', userId).maybeSingle()
    return data?.school_id ? isUs(await countryOfSchool(data.school_id)) : false
  } catch {
    return false
  }
}

/** A screen before sign-in: where Cloudflare saw the request. */
export const usForVisitor = (seen: string | null): boolean => isUs(seen)
