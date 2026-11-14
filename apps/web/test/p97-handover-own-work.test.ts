// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

// A parent who handed the phone over for "Practise at home" acts for the child, so the parent reaches "Add your own work" too (P97): /k/own and
// every screen under it (the camera of a marked test, one test, the own curriculum, its draft). Nothing else of the hand-over changes: a
// hand-over of one session still opens only that session, the hand-back screen and the paper upload. The sign uses a made-up key set here: no database.

import { handoverAllows, OWN_HANDOVER, signHandover } from '../lib/handover'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})

const OWN_WORK = ['/k/own', '/k/own/test', '/k/own/test/0b2c6e0e-1111-4222-8333-444455556666', '/k/own/curriculum', '/k/own/curriculum/0b2c6e0e-1111-4222-8333-444455556666']

describe('a hand-over of the learner\'s own practice', () => {
  it('opens Add your own work and every screen under it, and the upload route that sends the photos and the files', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    for (const path of [...OWN_WORK, '/k/upload']) expect(await handoverAllows(cookie, path), path).toEqual({ sessionId: OWN_HANDOVER, childId: 'child-1' })
  })

  it('does not open a path that only starts with the same letters', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    for (const path of ['/k/ownx', '/k/owner', '/k/own-work', '/k/me', '/p/child-1']) expect(await handoverAllows(cookie, path), path).toBeNull()
  })

  it('a forged or an expired cookie does not open it', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    expect(await handoverAllows(cookie.replace('child-1', 'child-2'), '/k/own')).toBeNull()
    expect(await handoverAllows(await signHandover(OWN_HANDOVER, 'child-1', Date.now() - 1000 * 60 * 60 * 3), '/k/own')).toBeNull()
    expect(await handoverAllows(undefined, '/k/own')).toBeNull()
  })
})

describe('a hand-over of one session is as it always was', () => {
  it('does not open Add your own work: it opens that session, the hand-back screen and the paper upload only', async () => {
    const cookie = await signHandover('s-1', 'child-1')
    for (const path of OWN_WORK) expect(await handoverAllows(cookie, path), path).toBeNull()
    for (const path of ['/k/session/s-1', '/k/done', '/k/upload']) expect(await handoverAllows(cookie, path), path).toEqual({ sessionId: 's-1', childId: 'child-1' })
  })
})
