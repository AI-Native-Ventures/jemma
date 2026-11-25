'use client'

import { useState, type ReactNode } from 'react'
import { blankLabels, graphAnswer } from '@jemma/profiling/logic'
import type { AnswerShape } from '../../[sessionId]/logic'
import { DataGraph } from './DataGraph'

// P167: the answer of a graph question. The learner draws on the graph (drags the empty bars up, or adds pictures), or types the numbers instead in the boxes
// the same answer has without its graph. Either way the text sent is the values of the empty bars, in order ("6", or "6; 3"), or nothing while one is empty.

type GraphShape = Extract<AnswerShape, { kind: 'graph' }>

const textButton = 'flex min-h-11 cursor-pointer items-center self-center border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'

/** The line under the graph: what to do with it. It never says whether an answer is right. */
export function graphHint(shape: GraphShape): string {
  const names = blankLabels(shape.graph)
  if (shape.graph.kind === 'pictures') return 'Tap + to add a picture. Tap a picture to take it off.'
  return names.length === 1 ? `Drag the handle of the ${names[0]} bar up.` : 'Drag each empty bar up to its number.'
}

export type GraphAnswerProps = {
  shape: GraphShape
  /** Called with the whole answer as one text, or '' while a bar is still empty. */
  onChange: (text: string) => void
  /** The boxes of the same answer typed instead (they write to the same answer). */
  typed: ReactNode
}

export function GraphAnswer({ shape, onChange, typed }: GraphAnswerProps) {
  const count = blankLabels(shape.graph).length
  const [typing, setTyping] = useState(false)
  const [values, setValues] = useState<(number | null)[]>(() => Array.from({ length: count }, () => null))
  const set = (k: number, v: number | null) => {
    const next = values.map((old, i) => (i === k ? v : old))
    setValues(next)
    onChange(graphAnswer(next))
  }
  // A switch starts the answer again: the boxes and the bars never hold two different answers.
  const toggle = () => {
    setTyping(!typing)
    setValues(Array.from({ length: count }, () => null))
    onChange('')
  }
  return (
    <div data-answer="graph" className="flex w-full flex-col items-center gap-3.5">
      {typing ? (
        <>
          <DataGraph graph={shape.graph} values={[]} mode="paper" />
          {typed}
          <button type="button" onClick={toggle} className={textButton}>
            Or draw it on the graph instead
          </button>
        </>
      ) : (
        <>
          <DataGraph graph={shape.graph} values={values} mode="answer" onSet={set} />
          <p className="m-0 text-center text-[16px] leading-[1.4] text-body">{graphHint(shape)}</p>
          <button type="button" onClick={toggle} className={textButton}>
            {count === 1 ? 'Or type the number instead' : 'Or type the numbers instead'}
          </button>
        </>
      )}
    </div>
  )
}
