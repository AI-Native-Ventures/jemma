// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

// The hand-over of "Practise at home" (P95): the parent hands the phone over with no session to start. The cookie is signed for the learner
// and a marker instead of a session, and it opens the learner's own screens (home, My maths, the grade page, a session, the hand-back screen,
// the paper upload) and nothing else. A hand-over of one session is as it always was. The sign uses a made-up key set here: no database.

import { handoverAllows, isOwnHandover, OWN_HANDOVER, signHandover, verifyHandover } from '../lib/handover'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})

const OPEN = ['/k', '/k/maths', '/k/maths/fractions', '/k/maths/grades', '/k/gaps', '/k/session/s-1', '/k/session/s-1/anything', '/k/done', '/k/upload']
const SHUT = ['/k/me', '/k/sign-in', '/k/mathsx', '/kx', '/k/gapsx', '/p', '/p/child-1', '/t', '/t/class-1', '/demo/switch', '/']

describe('a hand-over of the learner\'s own practice', () => {
  it('is signed for the learner and the marker, and reads back as such', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    const h = await verifyHandover(cookie)
    expect(h).toEqual({ sessionId: OWN_HANDOVER, childId: 'child-1' })
    expect(isOwnHandover(h)).toBe(true)
  })

  it('opens the learner\'s own screens', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    for (const path of OPEN) expect(await handoverAllows(cookie, path), path).toEqual({ sessionId: OWN_HANDOVER, childId: 'child-1' })
  })

  it('opens nothing else: not the account page, not the sign-in, not the parent\'s or the teacher\'s screens', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    for (const path of SHUT) expect(await handoverAllows(cookie, path), path).toBeNull()
  })

  it('a forged or an expired cookie opens nothing', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    const forged = cookie.replace('child-1', 'child-2')
    expect(await handoverAllows(forged, '/k')).toBeNull()
    const old = await signHandover(OWN_HANDOVER, 'child-1', Date.now() - 1000 * 60 * 60 * 3)
    expect(await handoverAllows(old, '/k')).toBeNull()
    expect(await handoverAllows(undefined, '/k')).toBeNull()
    expect(await handoverAllows('own.child-1', '/k')).toBeNull()
  })
})

describe('a hand-over of one session is as it always was', () => {
  it('opens that session, the hand-back screen and the paper upload, and not the home or My maths', async () => {
    const cookie = await signHandover('s-1', 'child-1')
    const h = await verifyHandover(cookie)
    expect(isOwnHandover(h)).toBe(false)
    for (const path of ['/k/session/s-1', '/k/session/s-1/x', '/k/done', '/k/done/x', '/k/upload']) expect(await handoverAllows(cookie, path), path).toEqual({ sessionId: 's-1', childId: 'child-1' })
    for (const path of ['/k', '/k/maths', '/k/maths/grades', '/k/gaps', '/k/session/s-2', '/k/session', '/k/me']) expect(await handoverAllows(cookie, path), path).toBeNull()
  })

  it('a session id that merely starts with the marker is a session, not the marker', async () => {
    const cookie = await signHandover('own-session-id', 'child-1')
    expect(isOwnHandover(await verifyHandover(cookie))).toBe(false)
    expect(await handoverAllows(cookie, '/k')).toBeNull()
  })
})
