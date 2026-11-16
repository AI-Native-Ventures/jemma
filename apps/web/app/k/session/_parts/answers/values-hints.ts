import type { AnswerShape } from '../../[sessionId]/logic'

// P150: the line under the boxes of a list, an order and a table (a screen), and the line under the question of the paper sheet (a pencil). Plain words.

type Values = Extract<AnswerShape, { kind: 'list' | 'order' | 'table' }>

/** "Round each answer to 1 decimal place." for a question that asks for a rounded answer, or '' when it does not. */
export function roundLine(round: number | undefined): string {
  if (round === undefined) return ''
  if (round === 0) return ' Round each answer to a whole number.'
  return ` Round each answer to ${round} decimal place${round === 1 ? '' : 's'}.`
}

/** The line under the boxes on the screen. It never says whether an answer was right. */
export function valuesHint(shape: Values): string {
  switch (shape.kind) {
    case 'list':
      return `${shape.labels ? 'Type each answer in its box.' : shape.ordered ? 'Type each answer in its box, in order.' : 'Type each answer in a box. Any order is fine.'}${roundLine(shape.round)}`
    case 'order':
      return 'Tap the numbers in order, one place at a time. Tap one again to take it back.'
    case 'table':
      return `Fill in the empty boxes of the table.${roundLine(shape.round)}`
  }
}

/** The line under the question of the paper sheet. A semicolon between the values is how the photo is read, so it is asked for. */
export function paperValuesLine(shape: Values): string {
  switch (shape.kind) {
    case 'list':
      return `Write the answers with a semicolon between them, like 3; 5; 7.${shape.labels ? ' Keep them in the order of the labels.' : shape.ordered ? ' Keep them in order.' : ' Any order is fine.'}${roundLine(shape.round)}`
    case 'order':
      return 'Write the numbers in order, with a semicolon between them, like 1/4; 1/2; 3/4.'
    case 'table':
      return `Write the missing numbers in order, left to right and then top to bottom, with a semicolon between them.${roundLine(shape.round)}`
  }
}
