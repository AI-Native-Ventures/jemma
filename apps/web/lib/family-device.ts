import { createClient } from '@supabase/supabase-js'
import type { JemmaDb } from '@jemma/profiling/db'
import { attemptChildSignIn, type ChildSignInResult } from './child-login'
import { supabaseEnv } from './supabase/env'

// "Who's learning?" (P162): one family phone. The parent stays signed in; a child taps their face and types their own PIN, and the phone is handed
// over to that child's own practice (the same hand-over as "Practise at home"). The PIN is checked against the child's login without touching the
// parent's session: a client of its own, with nothing kept, signs in once and signs out. Five wrong tries in 15 minutes lock the code, as on the
// learner's own sign-in.

export type FamilyChild = { id: string; firstName: string; grade: number | null; hasPin: boolean }

/** The parent's children (approved links, the school rows, never the "My own" sides), and whether each has a PIN. */
export async function familyChildren(admin: JemmaDb, parentId: string): Promise<FamilyChild[]> {
  const { data: links } = await admin.from('parent_links').select('child_id').eq('parent_id', parentId).eq('status', 'approved')
  const ids = [...new Set((links ?? []).map((l) => l.child_id))]
  if (ids.length === 0) return []
  const { data: kids } = await admin.from('children').select('id, first_name, grade, private_of').in('id', ids)
  const { data: logins } = await admin.from('child_logins').select('child_id').in('child_id', ids)
  const withPin = new Set((logins ?? []).map((l) => l.child_id))
  return (kids ?? [])
    .filter((k) => !k.private_of)
    .map((k) => ({ id: k.id, firstName: k.first_name, grade: k.grade ?? null, hasPin: withPin.has(k.id) }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName))
}

/** Checks a child's PIN against their login, without signing anyone in on this phone. */
export async function checkChildPin(admin: JemmaDb, childId: string, pin: string): Promise<ChildSignInResult | { ok: false; reason: 'none' }> {
  const { data: login } = await admin.from('child_logins').select('code').eq('child_id', childId).maybeSingle()
  if (!login) return { ok: false, reason: 'none' }
  const { url, anonKey } = supabaseEnv()
  return attemptChildSignIn(admin, async (email, password) => {
    const lone = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { data, error } = await lone.auth.signInWithPassword({ email, password })
    if (error || !data.session) return false
    await lone.auth.signOut()
    return true
  }, login.code, pin)
}
