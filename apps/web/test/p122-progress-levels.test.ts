// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LEGEND, levelOfScore, levelWords, progressLabel, summaryLine, summaryOf, type Level } from '../app/k/maths/format'

// P122: the pure pieces behind the progress circles of "My maths". A topic's score becomes one of four levels (the teacher's Long view language:
// full from 80 percent, half from 50 to 79, empty below 50, none when nothing was asked), and a part's circles become one short line. No database.

const score = (right: number, asked: number) => ({ right, asked })

describe('the level of a topic score', () => {
  it('0 of 5 is empty, 2 of 5 is empty, 3 of 5 is half, 4 of 5 is full and 5 of 5 is full', () => {
    expect(levelOfScore(score(0, 5))).toBe('empty')
    expect(levelOfScore(score(2, 5))).toBe('empty')
    expect(levelOfScore(score(3, 5))).toBe('half')
    expect(levelOfScore(score(4, 5))).toBe('full')
    expect(levelOfScore(score(5, 5))).toBe('full')
  })

  it('nothing asked is none, never empty', () => {
    expect(levelOfScore(score(0, 0))).toBe('none')
  })

  it('the edges are the Long view edges: 80 is full, 79 is half, 50 is half, 49 is empty', () => {
    expect(levelOfScore(score(80, 100))).toBe('full')
    expect(levelOfScore(score(79, 100))).toBe('half')
    expect(levelOfScore(score(1, 2))).toBe('half')
    expect(levelOfScore(score(49, 100))).toBe('empty')
    expect(levelOfScore(score(7, 9))).toBe('half')
    expect(levelOfScore(score(8, 10))).toBe('full')
  })
})

describe('what a part says', () => {
  const levels: Level[] = ['full', 'full', 'half', 'empty', 'empty', 'none', 'none', 'none', 'none', 'none']

  it('counts the secure topics (80 or more), the started ones (tried, below 80) and the ones not tried', () => {
    expect(summaryOf(levels)).toEqual({ total: 10, secure: 2, started: 3, untried: 5 })
  })

  it('its line is "2 of 10 secure · 3 started"', () => {
    expect(summaryLine(summaryOf(levels))).toBe('2 of 10 secure · 3 started')
  })

  it('says only the secure count when every tried topic is secure, and "Not started yet" when nothing was tried', () => {
    expect(summaryLine(summaryOf(['full', 'full', 'none']))).toBe('2 of 3 secure')
    expect(summaryLine(summaryOf(['none', 'none', 'none']))).toBe('Not started yet')
    expect(summaryLine(summaryOf(['half', 'none']))).toBe('0 of 2 secure · 1 started')
  })

  it('a screen reader hears the same three numbers in words', () => {
    expect(progressLabel('Algebra', summaryOf(levels))).toBe('Algebra: 2 of 10 topics at 80 percent or more, 3 started, 5 not tried')
  })

  it('has a key of four circles in order: 80% or more, 50 to 79, below 50, not tried', () => {
    expect(LEGEND.map((l) => l.level)).toEqual(['full', 'half', 'empty', 'none'])
    expect(LEGEND.map((l) => l.text)).toEqual(['80% or more', '50 to 79', 'below 50', 'not tried'])
    expect(LEGEND.map((l) => levelWords(l.level))).toEqual(['80 percent or more', '50 to 79 percent', 'below 50 percent', 'not tried yet'])
  })

  it('says no em dash anywhere', () => {
    const all = [summaryLine(summaryOf(levels)), progressLabel('Algebra', summaryOf(levels)), ...LEGEND.map((l) => l.text), ...LEGEND.map((l) => levelWords(l.level))]
    const dash = String.fromCharCode(0x2014)
    for (const text of all) expect(text).not.toContain(dash)
  })
})
