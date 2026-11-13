import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartedAt, startedSentence } from '../app/demo/StartedAt'

// "Your copy started today at 06:03." must be the judge's own clock. The server renders without a time (it does not know the judge's time
// zone, and React keeps the server's text on hydration), and the browser fills the time in after it has mounted.

const ORIGINAL_TZ = process.env.TZ
const START = '2026-11-13T04:03:00Z'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T04:30:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('what the server sends', () => {
  it('holds no clock time and no day, whatever the time zone of the server', () => {
    for (const tz of ['UTC', 'Africa/Johannesburg', 'America/Los_Angeles']) {
      process.env.TZ = tz
      const html = renderToString(<StartedAt iso={START} />)
      expect(html).toContain('Your copy started.')
      expect(html).not.toMatch(/\d{1,2}:\d{2}/)
      expect(html).not.toMatch(/today/)
    }
  })

  it('the sentence without a clock is the same text for every start time', () => {
    expect(startedSentence(START, null)).toBe('Your copy started.')
    expect(startedSentence('2026-11-01T10:00:00Z', null)).toBe('Your copy started.')
  })
})

describe('after the browser has mounted', () => {
  it('shows the time on the browser clock: 06:03 in South Africa for a copy that started at 04:03 UTC', () => {
    process.env.TZ = 'Africa/Johannesburg'
    render(<StartedAt iso={START} />)
    expect(screen.getByText(/^Your copy started /).textContent).toBe('Your copy started today at 06:03.')
  })

  it('a judge abroad reads their own clock, not South Africa\'s', () => {
    process.env.TZ = 'America/New_York'
    render(<StartedAt iso={START} />)
    // 04:03 UTC is 23:03 the evening before in New York, and the browser's today is that same evening (04:30 UTC is 23:30 there).
    expect(screen.getByText(/^Your copy started /).textContent).toBe('Your copy started today at 23:03.')
  })

  it('a judge in Tokyo reads Tokyo time: 13:03 for a copy that started at 04:03 UTC', () => {
    process.env.TZ = 'Asia/Tokyo'
    render(<StartedAt iso={START} />)
    expect(screen.getByText(/^Your copy started /).textContent).toBe('Your copy started today at 13:03.')
  })

  it('has a time of the form HH:MM', () => {
    process.env.TZ = 'Africa/Johannesburg'
    render(<StartedAt iso={START} />)
    expect(screen.getByText(/^Your copy started /).textContent).toMatch(/ at \d{2}:\d{2}\.$/)
  })

  it('a copy from another day says the day with the time', () => {
    process.env.TZ = 'Africa/Johannesburg'
    expect(startedSentence('2026-11-11T09:14:00Z', new Date('2026-11-13T04:30:00Z'))).toBe('Your copy started 11 Nov at 11:14.')
  })
})
