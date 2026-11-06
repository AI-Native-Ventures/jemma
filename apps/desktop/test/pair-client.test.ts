import { describe, expect, it } from 'vitest'
import { claimCode } from '../src/pair-client'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
const full = { token: 'jmt_x', refreshToken: 'r', supabaseUrl: 'https://s.test', supabaseAnonKey: 'anon', agentUrl: 'https://agent.test' }

describe('claimCode', () => {
  it('returns the credentials on a right code', async () => {
    expect(await claimCode('https://web.test', 'abc234', reply(200, full))).toEqual({ ok: true, credentials: full })
  })

  it('posts the code to the claim route', async () => {
    let seen: { url: string; body: string } | null = null
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body) }
      return new Response(JSON.stringify(full))
    }) as unknown as typeof fetch
    await claimCode('https://web.test/', 'abc234', f)
    expect(seen).toEqual({ url: 'https://web.test/api/desktop/pair/claim', body: JSON.stringify({ code: 'abc234' }) })
  })

  it('maps wrong, rate limited, no session and offline to plain reasons', async () => {
    expect(await claimCode('https://web.test', 'zzzzzz', reply(400, { error: 'invalid' }))).toEqual({ ok: false, reason: 'invalid' })
    expect(await claimCode('https://web.test', 'zzzzzz', reply(429, { error: 'rate_limited' }))).toEqual({ ok: false, reason: 'rate_limited' })
    expect(await claimCode('https://web.test', 'zzzzzz', reply(502, { error: 'session_failed' }))).toEqual({ ok: false, reason: 'session_failed' })
    expect(await claimCode('https://web.test', 'zzzzzz', reply(200, { token: 'only' }))).toEqual({ ok: false, reason: 'session_failed' })
    const down = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    expect(await claimCode('https://web.test', 'zzzzzz', down)).toEqual({ ok: false, reason: 'unreachable' })
  })
})
