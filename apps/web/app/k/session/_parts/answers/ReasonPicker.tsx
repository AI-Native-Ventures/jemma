'use client'

import { useId, useState } from 'react'
import { GEOMETRY_REASONS, filterReasons } from '@jemma/profiling/logic'

/**
 * The reason for a step of a geometry proof (P149), picked from the fixed list of CAPS reasons (`GEOMETRY_REASONS`, the one list the lesson prompt and the
 * marking read too). On a phone the list is long, so the learner types a word to cut it down ("same segment"); tapping a reason picks it and the list is
 * replaced by the reason as a chip, with a button to change it. A question that also asks for the value of the step (angle B = 40) has a number box above.
 *
 * The state lives in the question screen (`reason` and `value`), which builds the answer from them (`composeReasonAnswer`) and keeps Next off until it is complete.
 */

/** The longest value of a step the box takes: with the longest reason (44 characters) and "; " the answer stays under the 60 characters the server takes. */
export const REASON_VALUE_MAX = 10

/** What may be typed in the value box: digits and a comma or a point. */
export const reasonValueText = (s: string): string => s.replace(/[^\d.,]/g, '').slice(0, REASON_VALUE_MAX)

export type ReasonPickerProps = {
  /** The reason picked, or '' when none is. */
  reason: string
  onReason: (reason: string) => void
  /** The question asks for a value as well: the number box above the list. */
  withValue: boolean
  value: string
  onValue: (value: string) => void
}

export function ReasonPicker({ reason, onReason, withValue, value, onValue }: ReasonPickerProps) {
  const [search, setSearch] = useState('')
  const id = useId()
  const found = filterReasons(search)
  return (
    <div className="flex w-full flex-col gap-4">
      {withValue ? (
        <div className="flex flex-col items-center gap-2">
          <label htmlFor={`${id}-value`} className="text-[16px] font-semibold text-ink">1. The value</label>
          <input
            id={`${id}-value`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onValue(reasonValueText(e.target.value))}
            className="block h-[64px] w-40 rounded-18 border-[3px] border-coral bg-card text-center text-[30px] font-bold text-ink outline-none"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-[16px] font-semibold text-ink">{withValue ? '2. The reason' : 'The reason'}</p>
        {reason ? (
          <div className="flex items-center justify-between gap-3 rounded-18 border-[3px] border-ink bg-soft-2 px-4 py-3" data-reason-chip="true">
            <span className="min-w-0 text-[18px] leading-[1.3] font-bold text-ink">{reason}</span>
            <button
              type="button"
              onClick={() => onReason('')}
              className="flex min-h-11 flex-none cursor-pointer items-center justify-center rounded-14 border-2 border-edge bg-card px-4 py-2 text-center text-[15px] font-semibold text-ink"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <label htmlFor={`${id}-search`} className="sr-only">Type a word to find a reason</label>
            <input
              id={`${id}-search`}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              placeholder="Type a word to find a reason"
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 40))}
              className="block h-[52px] w-full rounded-14 border-2 border-edge bg-card px-4 text-[17px] text-ink outline-none"
            />
            <ul aria-label="Reasons" className="m-0 flex max-h-[264px] list-none flex-col gap-1.5 overflow-y-auto p-0">
              {found.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => {
                      onReason(item)
                      setSearch('')
                    }}
                    className="flex min-h-12 w-full cursor-pointer items-center rounded-14 border-2 border-edge bg-card px-4 py-2.5 text-left text-[17px] leading-[1.3] font-semibold text-ink"
                  >
                    {item}
                  </button>
                </li>
              ))}
              {found.length === 0 ? <li className="px-1 py-2 text-[16px] text-body">No reason has that word. Try another word.</li> : null}
            </ul>
          </>
        )}
      </div>
      <p className="m-0 text-center text-[16px] leading-[1.4] text-body">{withValue ? 'Type the value, then pick the reason.' : 'Pick the reason for this step.'}</p>
    </div>
  )
}

/** The reasons of the list, closed until opened, for the paper sheet: a learner writing a reason with a pencil sees the same words the screen lists. */
export function ReasonList() {
  return (
    <details className="rounded-14 border-2 border-edge px-4 py-2">
      <summary className="min-h-11 cursor-pointer py-2.5 text-[16px] font-semibold text-ink">See the list of reasons</summary>
      <ul aria-label="Reasons" className="m-0 flex list-none flex-col gap-1 p-0 pb-2 text-[16px] leading-[1.35] text-body">
        {GEOMETRY_REASONS.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </details>
  )
}
