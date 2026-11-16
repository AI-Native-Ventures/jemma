import type { AnswerShape } from '../../[sessionId]/logic'
import { FractionText } from '../Frac'
import { blankNumbers } from './TableAnswer'

// P150: what the paper sheet draws under a list, an order or a table: N empty boxes, the items to put in order with N empty places, or the table with its empty
// cells. The learner writes on their own paper; the picture shows how many answers there are and where they go.

const blank = 'block h-10 w-12 rounded-12 border-2 border-edge bg-card'
/** P151: a learner of Grade 1 to 6 writes bigger. */
const youngBlank = 'block h-12 w-14 rounded-12 border-2 border-edge bg-card'

/** The empty boxes, numbered when the place matters. */
function Blanks({ count, captions, young = false }: { count: number; captions: (string | null)[]; young?: boolean }) {
  return (
    <div aria-hidden="true" data-paper-blanks={count} className="flex flex-wrap gap-x-2 gap-y-2.5">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="flex flex-col items-center gap-1">
          <span className={young ? youngBlank : blank} />
          {captions[i] ? <span className="max-w-[64px] text-center text-[12px] leading-[1.2] font-semibold text-body">{captions[i]}</span> : null}
        </span>
      ))}
    </div>
  )
}

export function PaperValues({ shape }: { shape: AnswerShape }) {
  if (shape.kind === 'list') {
    return <Blanks count={shape.count} young={shape.young === true} captions={Array.from({ length: shape.count }, (_, i) => shape.labels?.[i] ?? (shape.ordered ? String(i + 1) : null))} />
  }
  if (shape.kind === 'order') {
    return (
      <div className="flex flex-col gap-2.5">
        <ul aria-label="The numbers" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {shape.items.map((item, i) => (
            <li key={i} className="flex min-h-10 items-center rounded-12 border-2 border-edge bg-card px-3 py-1 text-[20px] font-bold">
              <FractionText text={item} size={24} rule={2} gap={3} side={4} typeset="all" className="" />
            </li>
          ))}
        </ul>
        <Blanks count={shape.items.length} young={shape.young === true} captions={shape.items.map((_, i) => String(i + 1))} />
      </div>
    )
  }
  if (shape.kind === 'table') {
    const { columns, rows } = shape.table
    const numbers = blankNumbers(rows)
    return (
      <div data-paper-table="true" className="w-full overflow-x-auto">
        <table className="border-separate border-spacing-1 text-center">
          <thead>
            <tr>
              {columns.map((heading, c) => (
                <th key={c} scope="col" className="px-1 pb-0.5 text-[14px] leading-[1.2] font-bold text-body">
                  <FractionText text={heading} size={16} rule={2} gap={3} side={3} typeset="all" className="" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) =>
                  cell === null ? (
                    <td key={c} className="p-0"><span aria-label={`Empty cell ${numbers[r]![c]! + 1}`} className={`mx-auto block rounded-12 border-2 border-edge bg-card ${shape.young ? 'h-12 w-16' : 'h-10 w-14'}`} /></td>
                  ) : (
                    <td key={c} className="rounded-12 bg-soft-2 px-2.5 py-2 text-[16px] font-bold">
                      <FractionText text={cell} size={20} rule={2} gap={3} side={4} typeset="all" className="" />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return null
}
