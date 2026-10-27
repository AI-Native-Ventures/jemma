import type { JemmaDb } from '@jemma/profiling/db'

export type ChildSignInResult = { ok: true } | { ok: false; reason: 'wrong' | 'locked' }

export const MAX_WRONG_TRIES = 5
export const LOCK_WINDOW_MS = 15 * 60_000

// No 0, 1, I, O: codes are read aloud and copied by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function childEmail(code: string): string {
  return `${code.toLowerCase()}@kids.jemma.invalid`
}

/** `hex(HMAC_SHA256(CHILD_PIN_PEPPER, code + ':' + pin))`. Server only. */
export async function childPassword(code: string, pin: string): Promise<string> {
  const pepper = process.env.CHILD_PIN_PEPPER
  if (!pepper) throw new Error('CHILD_PIN_PEPPER is not set')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${code}:${pin}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** Makes the child's auth user, learner profile and child_logins row. Returns the sign-in code. */
export async function createChildLogin(admin: JemmaDb, childId: string, pin: string): Promise<{ code: string }> {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits')
  const child = await admin.from('children').select('first_name, school_id').eq('id', childId).single()
  if (child.error) throw new Error(`child not found: ${child.error.message}`)

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    const taken = await admin.from('child_logins').select('code').eq('code', code).maybeSingle()
    if (taken.data) continue
    const created = await admin.auth.admin.createUser({
      email: childEmail(code),
      password: await childPassword(code, pin),
      email_confirm: true,
    })
    if (created.error || !created.data.user) throw new Error(`could not create child user: ${created.error?.message}`)
    const userId = created.data.user.id
    const steps = [
      () =>
        admin
          .from('profiles')
          .insert({ user_id: userId, role: 'learner', display_name: child.data.first_name, school_id: child.data.school_id }),
      () => admin.from('children').update({ user_id: userId }).eq('id', childId),
      () => admin.from('child_logins').insert({ code, child_id: childId, user_id: userId }),
    ]
    for (const step of steps) {
      const { error } = await step()
      if (error) {
        await admin.auth.admin.deleteUser(userId)
        throw new Error(`could not save child login: ${error.message}`)
      }
    }
    return { code }
  }
  throw new Error('could not find a free sign-in code')
}

/**
 * Checks the lock, then the PIN. `signIn` does the real Supabase password sign-in
 * (and sets the session cookies in the app). Five wrong tries in 15 minutes lock the code.
 */
export async function attemptChildSignIn(
  admin: JemmaDb,
  signIn: (email: string, password: string) => Promise<boolean>,
  rawCode: string,
  pin: string,
): Promise<ChildSignInResult> {
  const code = rawCode.trim().toUpperCase()
  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString()
  const recent = await admin
    .from('child_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('code', code)
    .gte('at', since)
  if ((recent.count ?? 0) >= MAX_WRONG_TRIES) return { ok: false, reason: 'locked' }

  const ok = /^\d{4}$/.test(pin) && (await signIn(childEmail(code), await childPassword(code, pin)))
  if (ok) {
    await admin.from('child_login_attempts').delete().eq('code', code)
    return { ok: true }
  }
  await admin.from('child_login_attempts').insert({ code })
  return { ok: false, reason: 'wrong' }
}
