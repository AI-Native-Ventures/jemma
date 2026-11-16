import { MAX_STEPS, MIN_STEPS } from '../schemas/lesson'

/** The longest a line of worked steps may be. A step is a line of maths, not a paragraph. */
export const MAX_STEP_CHARS = 160

/**
 * The worked steps of a question (P127) as they are saved, or `undefined` when they cannot be used. A line is trimmed and an empty one is left out.
 * What is left must be 2 to 6 lines, none longer than `MAX_STEP_CHARS`; otherwise none are kept (a cut-off working is worse than none). The question
 * itself always stays: a missing or unusable `steps` never refuses a lesson, and the results screen shows "How to get there" only when there are steps.
 */
export function cleanSteps(steps: readonly string[] | undefined): string[] | undefined {
  if (!steps) return undefined
  const lines = steps.map((line) => line.trim()).filter((line) => line.length > 0)
  if (lines.length < MIN_STEPS || lines.length > MAX_STEPS) return undefined
  if (lines.some((line) => line.length > MAX_STEP_CHARS)) return undefined
  return lines
}
