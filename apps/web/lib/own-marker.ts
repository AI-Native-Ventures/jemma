// "This login has opened My own": a signed cookie value that lets the switch to My own, the second time, set one cookie and ask the database nothing
// (the private workspace exists, it was made the first time). It is a hint, never a permission: `myChild` looks the private workspace up itself, under
// row level security, whatever the cookie says. The value is `<user id>.<signature>`, signed with the same key as the hand-over cookie under its own
// name, and it is bound to the login so that another learner on the same device is not skipped past the first-time work. No database, no network.

/** The cookie that holds the marker. It lasts as long as the workspace cookie. */
export const OWN_MARKER_COOKIE = 'jemma_own'

async function hmac(value: string): Promise<string> {
  const pepper = process.env.CHILD_PIN_PEPPER
  if (!pepper) throw new Error('CHILD_PIN_PEPPER is not set')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`own-marker:${value}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The marker of a login that has opened My own. */
export async function signOwnMarker(userId: string): Promise<string> {
  return `${userId}.${await hmac(userId)}`
}

/** True when the cookie value is a marker made for this login. Forged, cut, empty or someone else's: false. */
export async function ownMarkerFits(value: string | undefined, userId: string): Promise<boolean> {
  const parts = value?.split('.') ?? []
  if (parts.length !== 2 || parts[0] !== userId) return false
  return (await hmac(userId)) === parts[1]
}

/**
 * Who a session is for, read from the user id (`sub`) in its access token. The token is read, not checked: nothing here lets anyone do anything (a
 * marker still has to be signed by the server for that id), it only says whose marker to look for. Null when there is no token or no id in it.
 */
export function subOfToken(token: string | undefined): string | null {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const sub = (JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub.length > 0 ? sub : null
  } catch {
    return null
  }
}
