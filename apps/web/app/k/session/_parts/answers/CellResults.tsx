import type { MissedQuestion } from '../../[sessionId]/logic'
import { FractionText } from '../Frac'
import { blankNumbers } from './TableAnswer'

// P150: the results of a list, an order or a table: each place of the answer on its own, marked right or not right (a tick or a cross, and the words for a screen
// reader: never the colour alone). A fixed order, and every table cell, also shows the right value under a wrong one; an answer in any order shows the right
// answer once as a list, since no place has a value of its own.

type Cell = NonNullable<MissedQuestion['cells']>[number]

const maths = (text: string, size: number) => <FractionText text={text} size={size} rule={2} gap={2} side={3} typeset="all" className="" />

function CellBox({ cell, showRight }: { cell: Cell; showRight: boolean }) {
  return (
    <span
      data-cell={cell.ok ? 'right' : 'wrong'}
      className={`flex min-h-[52px] min-w-[46px] flex-col items-center justify-center gap-0.5 rounded-12 px-2 py-1.5 text-center ${
        cell.ok ? 'border-[1.5px] border-green bg-green-tint' : 'border-[1.5px] border-red bg-card'
      }`}
    >
      <span className="text-[18px] leading-[1.2] font-bold">{cell.wrote ? maths(cell.wrote, 20) : ' '}</span>
      <span aria-hidden="true" className={`text-[12px] leading-none font-bold ${cell.ok ? 'text-green' : 'text-red-text'}`}>{cell.ok ? '✓' : '✗'}</span>
      <span className="sr-only">{cell.ok ? 'Right.' : cell.wrote ? 'Not right.' : 'Nothing written.'}</span>
      {!cell.ok && showRight && cell.right ? <span data-right-value="true" className="text-[12px] leading-[1.2] text-body">Right: {maths(cell.right, 14)}</span> : null}
    </span>
  )
}

/** The answer place by place: a row of boxes (a list or an order), or the table with the learner's values in its empty cells. `showRight` is on a missed card. */
export function CellResults({ m, showRight }: { m: MissedQuestion; showRight: boolean }) {
  const cells = m.cells ?? []
  const place = m.ordered === true
  const numbers = m.table ? blankNumbers(m.table.rows) : []
  return (
    <div data-cells="true" className="flex flex-col gap-2.5 rounded-14 bg-soft-2 px-3.5 py-3">
      <span className="text-[14px] font-semibold text-body">You wrote</span>
      {m.table ? (
        <div className="w-full overflow-x-auto">
          <table className="border-separate border-spacing-1.5 text-center">
            <thead>
              <tr>
                {m.table.columns.map((heading, c) => (
                  <th key={c} scope="col" className="px-1 pb-0.5 text-[13px] leading-[1.2] font-bold text-body">{maths(heading, 15)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((given, c) => {
                    const cell = cells[numbers[r]![c]!]
                    return given === null ? (
                      <td key={c} className="p-0 align-top">{cell ? <CellBox cell={cell} showRight={showRight} /> : null}</td>
                    ) : (
                      <td key={c} className="rounded-12 bg-card px-2.5 py-2 text-[16px] font-bold">{maths(given, 18)}</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cells.map((cell, i) => (
            <CellBox key={i} cell={cell} showRight={showRight && place} />
          ))}
        </div>
      )}
      {showRight && !place && !m.table ? (
        <p data-right-list="true" className="m-0 text-[15px] leading-[1.4] font-semibold">
          Right answer: <span className="font-bold">{m.right}</span>
        </p>
      ) : null}
    </div>
  )
}
