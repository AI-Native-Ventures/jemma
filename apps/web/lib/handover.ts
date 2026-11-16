/** Parent hands the phone to the child for one session: a signed, short-lived cookie that `/k/session/[id]` and `/k/done` honour. */

/** Http-only cookie `/k/session/[id]` honours until the session ends: `sessionId.childId.expiresAt.signature`. */
export const HANDOVER_COOKIE = 'jemma_handover'
export const HANDOVER_TTL_SECONDS = 60 * 90

/**
 * What the cookie holds in place of a session id when the parent hands the phone over for the learner's own practice ("Practise at home"): there is
 * no session to start, the child lands on the home of "My own" and chooses. It is not a session id (those are uuids), so it can never be taken for one.
 */
export const OWN_HANDOVER = 'own'

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

/** True when the hand-over is the one for the learner's own practice, not for one session. */
export const isOwnHandover = (h: { sessionId: string } | null): boolean => h?.sessionId === OWN_HANDOVER

/**
 * The learner's own screens a hand-over of the learner's own practice opens: the home, My maths (and the grade page), the lessons of a topic (P144), the gaps, a session, the
 * hand-back screen, the paper upload and "Add your own work" (`/k/own` and what is under it: a parent who acts for the child may add a marked test
 * or a curriculum for them). Not the account page, not the sign-in, not a screen of the parent or the teacher.
 */
const OWN_SCREENS = ['/k/maths', '/k/learn', '/k/gaps', '/k/session', '/k/done', '/k/own']
const underOwn = (pathname: string) => pathname === '/k' || pathname === '/k/upload' || OWN_SCREENS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/**
 * True when the cookie covers this path. A hand-over of one session covers the session it was signed for, the hand-back screen, or the learner's
 * upload route (the child may answer on paper on the parent's phone: `snapPractice` checks the child and the session itself). A hand-over of the
 * learner's own practice covers the learner's own screens (`OWN_SCREENS`); the session page checks that a session is the learner's own.
 */
export async function handoverAllows(cookie: string | undefined, pathname: string): Promise<{ sessionId: string; childId: string } | null> {
  const h = await verifyHandover(cookie)
  if (!h) return null
  if (isOwnHandover(h)) return underOwn(pathname) ? h : null
  if (pathname === '/k/done' || pathname.startsWith('/k/done/')) return h
  if (pathname === '/k/upload') return h
  if (pathname === `/k/session/${h.sessionId}` || pathname.startsWith(`/k/session/${h.sessionId}/`)) return h
  return null
}
