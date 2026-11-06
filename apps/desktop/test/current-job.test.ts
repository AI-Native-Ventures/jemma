import { describe, expect, it } from 'vitest'
import { parseRetryAt } from '../src/current-job'

describe('parseRetryAt', () => {
  const now = new Date('2026-10-28T10:00:00')
  it('reads a unix time after "limit reached|"', () => {
    expect(parseRetryAt('Claude usage limit reached|1793000000', now)).toBe(1793000000 * 1000)
  })
  it('reads clock times today or tomorrow', () => {
    expect(new Date(parseRetryAt('limit resets at 5pm', now)!).getHours()).toBe(17)
    expect(new Date(parseRetryAt('try again at 17:30', now)!).getMinutes()).toBe(30)
    const nine = new Date(parseRetryAt('resets 9am', now)!)
    expect(nine.getDate()).toBe(29)
  })
  it('gives null when the agent gave no time', () => {
    expect(parseRetryAt('usage limit reached', now)).toBeNull()
  })
})
