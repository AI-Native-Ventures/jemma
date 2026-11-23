import type { BlockForChild } from '@/lib/teaching'
import { speechOf } from './delivery'
import { BASE_RATE } from './voice'

// The player of the Listen tab (P159). Everything it shows is worked out here from the words the voice says for each part of the lesson, so nothing on
// it is made up: the bars are the parts, the count is the part being read, and the time is said as "about" because it comes from a count of words.
// Pure: no browser, no database.

/** The speeds the player steps through, in the order of the taps (the audio memo of a practice has the same four). */
export const SPEEDS = [1, 1.25, 1.5, 0.75] as const

/** The words a voice says in a second at the browser's own pace (the figure the audio memo uses for its clock). */
export const WORDS_PER_SECOND = 2.6

/** How many words the voice says for a part. */
export const wordsOf = (block: BlockForChild): number => speechOf(block).trim().split(/\s+/).filter(Boolean).length

/**
 * The thin bars of each part in the player: one for about every 35 words the voice says for it, from 1 to 5, so a long part is a wide group of bars.
 * A very long lesson has more words to a bar, so the row never holds much more than 40 bars and they stay wide enough to see.
 */
export function barGroups(words: number[]): number[] {
  const total = words.reduce((a, b) => a + b, 0)
  const perBar = Math.max(35, total / 40)
  return words.map((w) => Math.max(1, Math.min(5, Math.round(w / perBar))))
}

/** The height in px of bar `j` of a group of `k`: each part is a small hill, lowest at its edges and 36 px at its top. */
export const barHeight = (j: number, k: number): number => Math.round(14 + 22 * Math.sin((Math.PI * (j + 0.5)) / k))

/** About how many minutes of listening are left from part `from` on, at a speed. Worked out from the words, never under 1. */
export function minutesLeft(words: number[], from: number, speed: number): number {
  const left = words.slice(Math.max(0, from)).reduce((a, b) => a + b, 0)
  return Math.max(1, Math.round(left / (WORDS_PER_SECOND * BASE_RATE * speed) / 60))
}

/** The speed after this one: 1, 1.25, 1.5, 0.75 and round again. A speed that is not one of the four goes back to 1. */
export function nextSpeed(speed: number): number {
  const at = (SPEEDS as readonly number[]).indexOf(speed)
  return at === -1 ? 1 : SPEEDS[(at + 1) % SPEEDS.length]!
}
