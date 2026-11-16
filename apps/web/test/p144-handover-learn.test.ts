// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

// P144: a parent who handed the phone over for "Practise at home" acts for the learner, so the Learn button on My maths opens the lessons of the topic
// (/k/learn and what is under it). A hand-over of ONE session is as it always was: that session, the hand-back screen and the paper upload only, so the
// Learn step of such a session shows no lessons (the session page checks it). The sign uses a made-up key set here: no database.

import { handoverAllows, OWN_HANDOVER, signHandover } from '../lib/handover'

beforeAll(() => {
  vi.stubEnv('CHILD_PIN_PEPPER', 'a-made-up-key-for-this-test')
})

const LESSONS = ['/k/learn/0b2c6e0e-1111-4222-8333-444455556666', '/k/learn/0b2c6e0e-1111-4222-8333-444455556666/2']

describe('a hand-over of the learner\'s own practice', () => {
  it('opens the lesson list and the lessons of a topic', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    for (const path of LESSONS) expect(await handoverAllows(cookie, path), path).toEqual({ sessionId: OWN_HANDOVER, childId: 'child-1' })
  })

  it('does not open a path that only starts with the same letters', async () => {
    const cookie = await signHandover(OWN_HANDOVER, 'child-1')
    for (const path of ['/k/learnx', '/k/learner', '/k/learn-more']) expect(await handoverAllows(cookie, path), path).toBeNull()
  })
})

describe('a hand-over of one session', () => {
  it('does not open the lessons', async () => {
    const cookie = await signHandover('s-1', 'child-1')
    for (const path of LESSONS) expect(await handoverAllows(cookie, path), path).toBeNull()
    expect(await handoverAllows(cookie, '/k/session/s-1')).toEqual({ sessionId: 's-1', childId: 'child-1' })
  })
})
