import type { AnswerShape } from '../../[sessionId]/logic'

// P150: the line under the boxes of a list, an order and a table (a screen), and the line under the question of the paper sheet (a pencil). Plain words.

type Values = Extract<AnswerShape, { kind: 'list' | 'order' | 'table' }>

/** "Round each answer to 1 decimal place." for a question that asks for a rounded answer, or '' when it does not. */
export function roundLine(round: number | undefined): string {
  if (round === undefined) return ''
  if (round === 0) return ' Round each answer to a whole number.'
  return ` Round each answer to ${round} decimal place${round === 1 ? '' : 's'}.`
}

/** The line under the boxes on the screen. It never says whether an answer was right. A learner of Grade 1 to 6 (P151) reads simpler words. */
export function valuesHint(shape: Values): string {
  if (shape.young) return youngValuesHint(shape)
  switch (shape.kind) {
    case 'list':
      return `${shape.labels ? 'Type each answer in its box.' : shape.ordered ? 'Type each answer in its box, in order.' : 'Type each answer in a box. Any order is fine.'}${roundLine(shape.round)}`
    case 'order':
      return 'Tap the numbers in order, one place at a time. Tap one again to take it back.'
    case 'table':
      return `Fill in the empty boxes of the table.${roundLine(shape.round)}`
  }
}

/** P151: the same lines for a learner of Grade 1 to 6, in the words of a young reader. */
function youngValuesHint(shape: Values): string {
  switch (shape.kind) {
    case 'list':
      return `${shape.labels ? 'Type each answer in its box.' : shape.ordered ? 'Type one number in each box, in order.' : 'Type one number in each box. Any order is fine.'}${roundLine(shape.round)}`
    case 'order':
      return 'Tap the numbers in the order the question asks for. Tap a number again to take it back.'
    case 'table':
      return `Fill in the empty boxes.${roundLine(shape.round)}`
  }
}

/** P151: the line under the question of the paper sheet for a learner of Grade 1 to 6. */
function youngPaperLine(shape: Values): string {
  switch (shape.kind) {
    case 'list':
      return `Write the numbers with a semicolon between them, like 3; 5; 7.${shape.labels ? ' Keep them in the order of the labels.' : shape.ordered ? ' Keep them in order.' : ' Any order is fine.'}${roundLine(shape.round)}`
    case 'order':
      return 'Write the numbers in the order the question asks for, with a semicolon between them, like 3; 5; 7.'
    case 'table':
      return `Write the missing numbers one after the other, with a semicolon between them.${roundLine(shape.round)}`
  }
}

/** The line under the question of the paper sheet. A semicolon between the values is how the photo is read, so it is asked for. */
export function paperValuesLine(shape: Values): string {
  if (shape.young) return youngPaperLine(shape)
  switch (shape.kind) {
    case 'list':
      return `Write the answers with a semicolon between them, like 3; 5; 7.${shape.labels ? ' Keep them in the order of the labels.' : shape.ordered ? ' Keep them in order.' : ' Any order is fine.'}${roundLine(shape.round)}`
    case 'order':
      return 'Write the numbers in order, with a semicolon between them, like 1/4; 1/2; 3/4.'
    case 'table':
      return `Write the missing numbers in order, left to right and then top to bottom, with a semicolon between them.${roundLine(shape.round)}`
  }
}
