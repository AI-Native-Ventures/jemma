'use client'

import type { AnswerShape } from '../../[sessionId]/logic'
import { ListAnswer } from './ListAnswer'
import { OrderAnswer } from './OrderAnswer'
import { TableAnswer } from './TableAnswer'

// P150: the input of a list, an order and a table, chosen by the shape of the answer. The one dispatch line of QuestionScreen.

/** True for the three shapes that are several values. */
export const isValuesShape = (shape: AnswerShape): shape is Extract<AnswerShape, { kind: 'list' | 'order' | 'table' }> =>
  shape.kind === 'list' || shape.kind === 'order' || shape.kind === 'table'

/** `onChange` gets the whole answer as one text (values with a semicolon between them), or '' while a box or a place is still empty. */
export function ValuesAnswer({ shape, onChange }: { shape: Extract<AnswerShape, { kind: 'list' | 'order' | 'table' }>; onChange: (text: string) => void }) {
  switch (shape.kind) {
    case 'list':
      return <ListAnswer shape={shape} onChange={onChange} />
    case 'order':
      return <OrderAnswer shape={shape} onChange={onChange} />
    case 'table':
      return <TableAnswer shape={shape} onChange={onChange} />
  }
}
