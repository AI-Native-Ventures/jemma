'use client'

import { useState } from 'react'
import type { AnswerShape } from '../../[sessionId]/logic'
import { FractionText } from '../Frac'
import { Hint } from './ListAnswer'
import { valuesHint } from './values-hints'

// P150: the learner puts the items of the question in order. The items are chips (numbers, fractions, decimals); a tap puts a chip in the next free place, a tap
// on a placed chip takes it back. No dragging (a thumb on a phone), no arrows. The places are numbered 1, 2, 3. The text sent is the items in the order they
// were placed, with a semicolon between them, or nothing until every place has one.

type OrderShape = Extract<AnswerShape, { kind: 'order' }>

const chip = 'flex min-h-12 min-w-[56px] cursor-pointer items-center justify-center rounded-14 px-3.5 py-2 text-center text-[22px] font-bold'

function Item({ text, color }: { text: string; color: string }) {
  return <FractionText text={text} size={26} rule={3} gap={4} side={5} color={color} className="" typeset="all" />
}

export function OrderAnswer({ shape, onChange }: { shape: OrderShape; onChange: (text: string) => void }) {
  // The indexes of the items, in the order they were placed.
  const [placed, setPlaced] = useState<number[]>([])
  const update = (next: number[]) => {
    setPlaced(next)
    onChange(next.length === shape.items.length ? next.map((i) => shape.items[i]!).join('; ') : '')
  }
  const free = shape.items.map((text, i) => ({ text, i })).filter(({ i }) => !placed.includes(i))
  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      <ol data-values="order" aria-label="Your order" className="m-0 flex w-full list-none flex-wrap gap-2 p-0">
        {shape.items.map((_, place) => {
          const at = placed[place]
          const text = at === undefined ? null : shape.items[at]!
          return (
            <li key={place} className="flex min-w-[64px] flex-1 basis-[64px] flex-col items-center gap-1">
              {text === null ? (
                <span aria-label={`Place ${place + 1}, empty`} className="flex min-h-14 w-full items-center justify-center rounded-14 border-2 border-dashed border-edge bg-soft-2" />
              ) : (
                <button
                  type="button"
                  aria-label={`Place ${place + 1}: ${text}. Tap to take it back.`}
                  onClick={() => update(placed.filter((_, k) => k !== place))}
                  className={`${chip} min-h-14 w-full border-[3px] border-ink bg-ink text-white`}
                >
                  <Item text={text} color="#FFFFFF" />
                </button>
              )}
              <span aria-hidden="true" className="text-[13px] font-semibold text-body">{place + 1}</span>
            </li>
          )
        })}
      </ol>
      <div data-values="items" role="group" aria-label="Numbers to put in order" className="flex w-full flex-wrap justify-center gap-2">
        {free.map(({ text, i }) => (
          <button
            key={i}
            type="button"
            aria-label={`${text}. Tap to put it in place ${placed.length + 1}.`}
            onClick={() => update([...placed, i])}
            className={`${chip} border-2 border-edge bg-card text-ink`}
          >
            <Item text={text} color="#1F1D36" />
          </button>
        ))}
      </div>
      {placed.length > 0 ? (
        <button
          type="button"
          onClick={() => update([])}
          className="flex min-h-11 cursor-pointer items-center justify-center border-0 bg-transparent text-[16px] font-semibold text-ink underline underline-offset-[3px]"
        >
          Start again
        </button>
      ) : null}
      <Hint>{valuesHint(shape)}</Hint>
    </div>
  )
}
