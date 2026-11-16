import { readEquation, readInequality } from '../meaning'

// P146: how many answers an equation question has. The key of "Solve x^2 - 5x + 6 = 0" is "x = 2 or x = 3": two values, so the learner's screen shows two
// boxes. This is the only thing the screen is told about the key: the count and the letter, never the values (the correct answer never goes to the browser).

export type AnswerCount = {
  /** The number of different values in the key: 2 for "x = 2 or x = 3", 1 for "x = 5", 0 for an inequality (a part of the number line, not a list of values). */
  count: number
  /** The letter of the key ("x"), or null when the key is bare values ("2 or 3"). */
  letter: string | null
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** How many values are different from each other (0,5 and 1/2 are one). */
const distinctCount = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((v, i) => i === 0 || !close(v, sorted[i - 1]!)).length
}

/**
 * The count and the letter of the key of an equation question, read the way the marking reads it (an inequality first, then an equation with its values
 * cut at or, and, ; and a comma that is not a decimal comma, and a plus or minus read as two values). Null when the key does not read: the screen then
 * keeps its one box.
 */
export function answerCountOf(key: string): AnswerCount | null {
  const inequality = readInequality(key, true)
  if (inequality) return { count: 0, letter: inequality.letter }
  const equation = readEquation(key)
  if (!equation) return null
  return { count: distinctCount(equation.values), letter: equation.letter }
}
