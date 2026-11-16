import type { AnswerShape } from '../../[sessionId]/logic'

// P147: the lines that say how to type, or write, an equation answer that is an inequality, an interval or a pair. The screen knows only the SHAPE of the key
// (the server sends `answerShape: 'inequality'` or 'pair'), never the key. Plain words, one example of each way to write it.

/** The line under the box for an inequality or an interval (a domain or a range too). */
export const INEQUALITY_HINT = 'Type the answer, like x < 4 or -2 ≤ x < 3.'
/** The same line for a pencil, on the paper sheet. */
export const INEQUALITY_WRITE_LINE = 'Write the answer, like x < 4 or -2 ≤ x < 3.'
/** Two letters with a value each: both are one answer, joined with a comma (there is no "or" between them). */
export const PAIR_HINT = 'Type both answers, like x = 2, y = 3.'
export const PAIR_WRITE_LINE = 'Write both answers, like x = 2, y = 3.'

/**
 * The line under the box of an equation answer: the inequality line when the key is an inequality or an interval, the pair line when it is a pair, otherwise
 * `otherwise` (the line it always had).
 */
export function equationShapeHint(shape: AnswerShape, otherwise: string): string {
  if (shape.kind !== 'equation') return otherwise
  return shape.inequality ? INEQUALITY_HINT : shape.pair ? PAIR_HINT : otherwise
}
