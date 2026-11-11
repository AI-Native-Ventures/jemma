// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { isPublicPath } from '../lib/public-paths'

// A learner has no session until the code and PIN are typed, so /k/sign-in must be open to a signed-out person. Nothing else is.

describe('isPublicPath', () => {
  test('the learner sign-in screen is open, with or without a trailing slash', () => {
    expect(isPublicPath('/k/sign-in')).toBe(true)
    expect(isPublicPath('/k/sign-in/')).toBe(true)
  })

  test('every other screen of the three spaces needs a session', () => {
    for (const path of ['/k', '/k/session', '/k/me', '/k/sign-in/extra', '/k/sign-in-now', '/t', '/t/abc', '/p', '/p/abc/settings']) {
      expect(isPublicPath(path), path).toBe(false)
    }
  })
})
