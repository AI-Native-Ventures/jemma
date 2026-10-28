import { describe, expect, it } from 'vitest'
import { claimCode } from '../src/pair-client'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch

describe('claimCode', () => {
  it('returns the token on a right code', async () => {
    expect(await claimCode('https://web.test', 'abc234', reply(200, { token: 'jmt_x' }))).toEqual({ ok: true, token: 'jmt_x' })
  })

  it('posts the code to the claim route', async () => {
    let seen: { url: string; body: string } | null = null
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body) }
      return new Response(JSON.stringify({ token: 'jmt_x' }))
    }) as unknown as typeof fetch
    await claimCode('https://web.test/', 'abc234', f)
    expect(seen).toEqual({ url: 'https://web.test/api/desktop/pair/claim', body: JSON.stringify({ code: 'abc234' }) })
  })

  it('maps wrong, rate limited and offline to plain reasons', async () => {
    expect(await claimCode('https://web.test', 'zzzzzz', reply(400, { error: 'invalid' }))).toEqual({ ok: false, reason: 'invalid' })
    expect(await claimCode('https://web.test', 'zzzzzz', reply(429, { error: 'rate_limited' }))).toEqual({ ok: false, reason: 'rate_limited' })
    const down = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    expect(await claimCode('https://web.test', 'zzzzzz', down)).toEqual({ ok: false, reason: 'unreachable' })
  })
})
