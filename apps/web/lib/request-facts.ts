import { cookies, headers } from 'next/headers'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// Small reads of the request and of a person's sign-up facts (P161) that never stop a page: a page drawn outside a request (a test, a build) or a
// database that cannot be read gives nothing, and the page uses its defaults.

/** The country Cloudflare saw for this request (CF-IPCountry), or null. */
export async function seenCountry(): Promise<string | null> {
  try {
    return (await headers()).get('cf-ipcountry')
  } catch {
    return null
  }
}

/** The tags of an ad link Jemma kept in its own cookie (TagKeeper), or none. */
export async function keptTags(): Promise<URLSearchParams> {
  try {
    return new URLSearchParams(decodeURIComponent((await cookies()).get('jemma_tags')?.value ?? ''))
  } catch {
    return new URLSearchParams()
  }
}

/** A person's sign-up facts (the country they picked, and in the US whether they are 13 or older), or null. */
export async function signupOf(userId: string): Promise<{ country: string | null; over_13: boolean | null } | null> {
  try {
    const { data } = await createSupabaseAdmin().from('signups').select('country, over_13').eq('user_id', userId).maybeSingle()
    return data ?? null
  } catch {
    return null
  }
}
