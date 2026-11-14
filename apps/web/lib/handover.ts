/** Parent hands the phone to the child for one session: a signed, short-lived cookie that `/k/session/[id]` and `/k/done` honour. */

/** Http-only cookie `/k/session/[id]` honours until the session ends: `sessionId.childId.expiresAt.signature`. */
export const HANDOVER_COOKIE = 'jemma_handover'
export const HANDOVER_TTL_SECONDS = 60 * 90

async function hmac(value: string): Promise<string> {
  const pepper = process.env.CHILD_PIN_PEPPER
  if (!pepper) throw new Error('CHILD_PIN_PEPPER is not set')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`handover:${value}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signHandover(sessionId: string, childId: string, now = Date.now()): Promise<string> {
  const body = `${sessionId}.${childId}.${now + HANDOVER_TTL_SECONDS * 1000}`
  return `${body}.${await hmac(body)}`
}

/** The session and child the cookie covers, or null when it is forged or expired. */
export async function verifyHandover(value: string | undefined, now = Date.now()): Promise<{ sessionId: string; childId: string } | null> {
  const parts = value?.split('.') ?? []
  if (parts.length !== 4) return null
  const [sessionId, childId, expires, sig] = parts as [string, string, string, string]
  if (Number(expires) < now || (await hmac(`${sessionId}.${childId}.${expires}`)) !== sig) return null
  return { sessionId, childId }
}

/**
 * True when the cookie covers this path: the session it was signed for, the hand-back screen, or the learner's upload route (the child may answer
 * on paper on the parent's phone: `snapPractice` checks the child and the session itself).
 */
export async function handoverAllows(cookie: string | undefined, pathname: string): Promise<{ sessionId: string; childId: string } | null> {
  const h = await verifyHandover(cookie)
  if (!h) return null
  if (pathname === '/k/done' || pathname.startsWith('/k/done/')) return h
  if (pathname === '/k/upload') return h
  if (pathname === `/k/session/${h.sessionId}` || pathname.startsWith(`/k/session/${h.sessionId}/`)) return h
  return null
}
