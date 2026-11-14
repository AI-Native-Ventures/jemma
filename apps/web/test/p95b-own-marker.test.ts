// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

// The marker that says "this login has opened My own" (P95b): a signed cookie value, so that the switch to My own, the second time, sets one cookie
// and asks the database nothing. It is bound to the login (the user id in the session's token) so another learner on the same device is not skipped.
// The sign uses a made-up key set here: no database.

import { ownMarkerFits, signOwnMarker, subOfToken } from '../lib/own-marker'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})

/** A token with a payload only, the way a session's access token looks: three parts, the middle one is the payload. */
const token = (payload: Record<string, unknown>) => {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'ES256' })}.${part(payload)}.signature`
}

describe('the marker', () => {
  it('fits the login it was made for', async () => {
    const marker = await signOwnMarker('user-1')
    expect(await ownMarkerFits(marker, 'user-1')).toBe(true)
  })

  it('does not fit another login on the same device', async () => {
    const marker = await signOwnMarker('user-1')
    expect(await ownMarkerFits(marker, 'user-2')).toBe(false)
  })

  it('a forged, cut or empty marker fits nobody', async () => {
    const marker = await signOwnMarker('user-1')
    const [, sig] = marker.split('.')
    expect(await ownMarkerFits(`user-2.${sig}`, 'user-2')).toBe(false)
    expect(await ownMarkerFits(marker.slice(0, -4), 'user-1')).toBe(false)
    expect(await ownMarkerFits('', 'user-1')).toBe(false)
    expect(await ownMarkerFits('user-1', 'user-1')).toBe(false)
    expect(await ownMarkerFits(undefined, 'user-1')).toBe(false)
  })

  it('a marker is not a hand-over: the two signs do not stand in for each other', async () => {
    const { signHandover } = await import('../lib/handover')
    const handover = await signHandover('own', 'user-1')
    expect(await ownMarkerFits(handover, 'user-1')).toBe(false)
  })

  it('holds the same thing every time for the same login (nothing in it changes by the minute)', async () => {
    expect(await signOwnMarker('user-1')).toBe(await signOwnMarker('user-1'))
  })
})

describe('subOfToken (who the session is for, read from the token, no network)', () => {
  it('reads the user id from a token', () => {
    expect(subOfToken(token({ sub: 'user-1', role: 'authenticated' }))).toBe('user-1')
  })

  it('a missing, cut or unreadable token has no one in it', () => {
    expect(subOfToken(undefined)).toBeNull()
    expect(subOfToken('')).toBeNull()
    expect(subOfToken('one-part-only')).toBeNull()
    expect(subOfToken('a.not-json.c')).toBeNull()
    expect(subOfToken(token({ role: 'authenticated' }))).toBeNull()
    expect(subOfToken(token({ sub: 42 }))).toBeNull()
  })
})
