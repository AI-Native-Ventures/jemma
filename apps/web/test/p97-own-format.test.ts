import { describe, expect, it } from 'vitest'
import {
  MAX_PAGES,
  NOT_OWN,
  dayLabel,
  homeTestLine,
  leftOutOf,
  ownTestState,
  rightLine,
  wrongLine,
} from '../app/k/own/format'

// The pure words and rules of "Add your own work" (P97): no database, no clock, no browser.

describe('ownTestState: what the screen of one marked test shows', () => {
  it('a marked paper is marked, whatever its event says', () => {
    expect(ownTestState({ paper: 'marked', event: null })).toBe('marked')
    expect(ownTestState({ paper: 'marked', event: 'failed' })).toBe('marked')
  })

  it('a failed paper is failed', () => {
    expect(ownTestState({ paper: 'failed', event: null })).toBe('failed')
    expect(ownTestState({ paper: 'failed', event: 'queued' })).toBe('failed')
  })

  it('a paper still being read is reading, until its event has failed: then it is failed (the agent never read it)', () => {
    for (const paper of ['queued', 'reading', 'needs_you']) {
      for (const event of [null, 'queued', 'running', 'done'] as const) expect(ownTestState({ paper, event })).toBe('reading')
      expect(ownTestState({ paper, event: 'failed' })).toBe('failed')
      expect(ownTestState({ paper, event: 'cancelled' })).toBe('failed')
    }
  })
})

describe('the words', () => {
  it('the result is "{right} of {n} right." and the home line says "Marked test: {right} of {n} right"', () => {
    expect(rightLine(6, 8)).toBe('6 of 8 right.')
    expect(rightLine(0, 5)).toBe('0 of 5 right.')
    expect(homeTestLine(6, 8)).toBe('Marked test: 6 of 8 right')
  })

  it('a topic with one wrong answer says "1 wrong in this test", more say how many', () => {
    expect(wrongLine(1)).toBe('1 wrong in this test')
    expect(wrongLine(2)).toBe('2 wrong in this test')
  })

  it('one switch line for a learner who is in My school, and up to 4 pages', () => {
    expect(NOT_OWN).toBe('Switch to My own to add your own work.')
    expect(MAX_PAGES).toBe(4)
  })

  it('no word of them holds an em dash', () => {
    for (const text of [NOT_OWN, rightLine(1, 2), homeTestLine(1, 2), wrongLine(3)]) expect(text).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('leftOutOf: how many questions Jemma left out, read from the line the save tool wrote', () => {
  it('reads the count the tool writes ("Read your marked test: 6 of 8 right, 3 left out")', () => {
    expect(leftOutOf('Read your marked test: 6 of 8 right, 3 left out')).toBe(3)
    expect(leftOutOf('Read your marked test: 10 of 12 right, 1 left out')).toBe(1)
  })

  it('is 0 when none were left out, when there is no line, and for any other words', () => {
    expect(leftOutOf('Read your marked test: 6 of 8 right')).toBe(0)
    expect(leftOutOf(null)).toBe(0)
    expect(leftOutOf('')).toBe(0)
    expect(leftOutOf('Saved the map you approved: 24 topics')).toBe(0)
  })
})

describe('dayLabel', () => {
  it('says the day in UTC, so it never shifts with the server time zone', () => {
    expect(dayLabel('2026-11-13T23:30:00Z')).toBe('Fri 13 Nov')
    expect(dayLabel('2026-11-14')).toBe('Sat 14 Nov')
  })

  it('is empty for a value that is not a date', () => {
    expect(dayLabel('')).toBe('')
    expect(dayLabel('soon')).toBe('')
  })
})
