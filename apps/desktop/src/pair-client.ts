export type ClaimOutcome = { ok: true; token: string } | { ok: false; reason: 'invalid' | 'rate_limited' | 'unreachable' }

/** Swaps the pairing code shown on the web for this user's MCP token. */
export async function claimCode(webUrl: string, code: string, doFetch: typeof fetch = fetch): Promise<ClaimOutcome> {
  try {
    const res = await doFetch(`${webUrl.replace(/\/+$/, '')}/api/desktop/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = (await res.json().catch(() => ({}))) as { token?: unknown }
    if (res.ok && typeof body.token === 'string') return { ok: true, token: body.token }
    return { ok: false, reason: res.status === 429 ? 'rate_limited' : 'invalid' }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}
