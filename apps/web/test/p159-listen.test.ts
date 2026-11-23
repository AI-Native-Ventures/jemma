import { describe, expect, it } from 'vitest'
import { barGroups, barHeight, minutesLeft, nextSpeed, SPEEDS, WORDS_PER_SECOND } from '../app/k/learn/_parts/listen'
import { BASE_RATE } from '../app/k/learn/_parts/voice'

// P159: what the player of the Listen tab shows is worked out from the words the voice says for each part, so nothing on it is made up.

describe('the bars of the player', () => {
  it('give each part one bar for about every 35 words, from 1 to 5', () => {
    expect(barGroups([10, 35, 70, 105, 140, 400])).toEqual([1, 1, 2, 3, 4, 5])
  })
  it('give a very long lesson more words to a bar, so the row stays near 40 bars', () => {
    const words = Array.from({ length: 30 }, () => 100)
    const bars = barGroups(words).reduce((a, b) => a + b, 0)
    expect(bars).toBeLessThanOrEqual(60)
    expect(barGroups(words).every((k) => k >= 1)).toBe(true)
  })
  it('draw each part as a small hill: low at its edges, high in its middle, never above 36 px', () => {
    expect(barHeight(0, 5)).toBeLessThan(barHeight(2, 5))
    expect(barHeight(4, 5)).toBe(barHeight(0, 5))
    for (let j = 0; j < 5; j++) expect(barHeight(j, 5)).toBeLessThanOrEqual(36)
  })
})

describe('the time of the player', () => {
  it('is worked out from the words left at the voice pace, never under 1 minute', () => {
    const words = [600, 600]
    const all = Math.round(1200 / (WORDS_PER_SECOND * BASE_RATE) / 60)
    expect(minutesLeft(words, 0, 1)).toBe(all)
    expect(minutesLeft(words, 1, 1)).toBe(Math.round(600 / (WORDS_PER_SECOND * BASE_RATE) / 60))
    expect(minutesLeft([5], 0, 1)).toBe(1)
  })
  it('gets shorter at a faster speed', () => {
    expect(minutesLeft([2000], 0, 1.5)).toBeLessThan(minutesLeft([2000], 0, 1))
  })
})

describe('the speed button', () => {
  it('steps 1, 1.25, 1.5, 0.75 and round again, and an unknown speed goes back to 1', () => {
    expect([...SPEEDS]).toEqual([1, 1.25, 1.5, 0.75])
    expect(nextSpeed(1)).toBe(1.25)
    expect(nextSpeed(1.25)).toBe(1.5)
    expect(nextSpeed(1.5)).toBe(0.75)
    expect(nextSpeed(0.75)).toBe(1)
    expect(nextSpeed(2)).toBe(1)
  })
})
