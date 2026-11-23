'use client'

import { useState } from 'react'
import type { AnswerShape } from '../../[sessionId]/logic'
import { FractionText } from '../Frac'
import { Hint } from './ListAnswer'
import { joined, ValueBox } from './ValueBox'
import { valuesHint } from './values-hints'

// P150: a small table (up to 4 columns and 6 rows) with some cells given and some empty. The learner fills the empty cells. The given cells are in the question
// anyway, so the whole table is sent, with each empty cell as null; the values of the empty cells never are. The text sent is the empty cells' values, left to right
// and top to bottom, with a semicolon between them, or nothing until every empty cell has one. A table wider than the screen scrolls sideways inside its own box.

type TableShape = Extract<AnswerShape, { kind: 'table' }>

/** The number of each empty cell, in reading order, by row and column: -1 for a cell that is given. */
export function blankNumbers(rows: (string | null)[][]): number[][] {
  let next = 0
  return rows.map((row) => row.map((cell) => (cell === null ? next++ : -1)))
}

export function TableAnswer({ shape, onChange }: { shape: TableShape; onChange: (text: string) => void }) {
  const { columns, rows, plain } = shape.table
  const numbers = blankNumbers(rows)
  const count = numbers.flat().filter((n) => n >= 0).length
  const [values, setValues] = useState<string[]>(() => Array.from({ length: count }, () => ''))
  const set = (n: number, v: string) => {
    const next = values.map((old, k) => (k === n ? v : old))
    setValues(next)
    onChange(joined(next))
  }
  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      <div data-values="table" className="w-full overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-1.5 text-center">
          <thead>
            <tr>
              {columns.map((heading, c) => (
                <th key={c} scope="col" className="px-1 pb-1 text-[15px] leading-[1.2] font-bold text-body">
                  <FractionText text={heading} size={18} rule={2} gap={3} side={3} typeset="all" className="" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const n = numbers[r]![c]!
                  return cell === null ? (
                    <td key={c} className="p-0">
                      <ValueBox
                        id={`cell-${r}-${c}`}
                        label={`Row ${r + 1}, ${columns[c] ?? `column ${c + 1}`}`}
                        value={values[n] ?? ''}
                        onChange={(v) => set(n, v)}
                        plain={plain}
                        className={`mx-auto h-11 border-[3px] border-green px-0 text-[18px] ${plain ? 'w-[64px]' : 'w-[76px]'}`}
                      />
                    </td>
                  ) : (
                    <td key={c} className="rounded-12 bg-soft-2 px-2.5 py-2 text-[18px] font-bold text-ink">
                      <FractionText text={cell} size={22} rule={2} gap={3} side={4} typeset="all" className="" />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint>{valuesHint(shape)}</Hint>
    </div>
  )
}
