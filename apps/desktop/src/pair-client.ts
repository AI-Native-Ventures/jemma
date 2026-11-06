import { parseCredentials, type Credentials } from './credentials'

export type ClaimOutcome = { ok: true; credentials: Credentials } | { ok: false; reason: 'invalid' | 'rate_limited' | 'unreachable' | 'session_failed' }

/** Swaps the pairing code shown on the web for this user's MCP token and session. */
export async function claimCode(webUrl: string, code: string, doFetch: typeof fetch = fetch): Promise<ClaimOutcome> {
  try {
    const res = await doFetch(`${webUrl.replace(/\/+$/, '')}/api/desktop/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) {
      const credentials = parseCredentials(JSON.stringify(body))
      if (credentials) return { ok: true, credentials }
      return { ok: false, reason: 'session_failed' }
    }
    if (res.status === 429) return { ok: false, reason: 'rate_limited' }
    return { ok: false, reason: body.error === 'session_failed' ? 'session_failed' : 'invalid' }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}
