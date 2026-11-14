import { cookies } from 'next/headers'
import { HOMES, type Role } from '@/components/blocks/nav'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Where a signed-in person with no profile yet goes to pick a role. The same address `verifySignInCode` in lib/auth.ts uses. */
const ROLE_PATH = '/role'

/**
 * Where "/" sends a person, or null when "/" shows the landing page. Only a visitor who is not signed in sees the landing page. A signed-in
 * person goes where sign-in sends them: their home, or the role picker when they have no profile yet.
 */
export function destinationFor(signedIn: boolean, role: Role | null): string | null {
  if (!signedIn) return null
  return role ? HOMES[role] : ROLE_PATH
}

/** The Supabase session cookie (`sb-<project>-auth-token`, in chunks `.0`, `.1` when it is long). Not the PKCE `...-code-verifier` cookie. */
export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
}

/**
 * The home to send the current person to, or null to show the landing page. A visitor with no session cookie is never looked up, so the
 * landing page does not wait for the database. If the lookup fails, the landing page is shown rather than an error: it is the front door.
 */
export async function signedInDestination(): Promise<string | null> {
  const store = await cookies()
  if (!hasSessionCookie(store.getAll().map((c) => c.name))) return null
  try {
    const supabase = await createSupabaseServer()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return null
    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
    return destinationFor(true, profile?.role ?? null)
  } catch {
    return null
  }
}
