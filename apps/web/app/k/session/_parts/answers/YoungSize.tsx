import type { ReactNode } from 'react'

// P151: the list, order and table inputs (P150) for a learner of Grade 1 to 6. The inputs are drawn exactly as P150 draws them; this box makes them bigger
// from outside, by the classes of the boxes inside it (the variants below reach every value box and chip by its data attribute), so the three inputs have no
// second set of sizes to keep in step.
//
//   a box of a list or a table   56 px high (a touch target is 44), figures of 24 px; a box of a list 64 px wide (five fit a row at 390 px, three at 360 px)
//   a chip of an order           at least 56 px high and 64 px wide
//
// A table cell keeps the width it had (64 px for a number pad, 76 px for the full keyboard): a young table is 2 columns wide, and a wider one scrolls sideways
// inside its own box, as P150 made it. Nothing here has a fixed width of its own or stops a line wrapping.

export const YOUNG_SIZE = [
  'w-full',
  '[&_[data-value-box]]:h-14 [&_[data-value-box]]:text-[24px]',
  '[&_[data-values=list]_[data-value-box]]:w-16',
  '[&_[data-values=items]_button]:min-h-14 [&_[data-values=items]_button]:min-w-16',
].join(' ')

/**
 * The time boxes (P148): the hours and the minutes are already 64 px high, and the am and pm keys of a 12 hour clock are 34 px, under a touch target of 44. For a
 * young learner they are 48 px high and 64 px wide.
 */
export const YOUNG_TIME_SIZE = ['w-full', '[&_[data-time]_button]:h-12 [&_[data-time]_button]:w-16 [&_[data-time]_button]:text-[20px]'].join(' ')

/** Wraps a list, an order, a table or a time for a young learner; any other learner gets the input as it is (no box at all). */
export function YoungSize({ young, kind = 'values', children }: { young: boolean | undefined; kind?: 'values' | 'time'; children: ReactNode }) {
  if (!young) return <>{children}</>
  return (
    <div data-young="true" className={kind === 'time' ? YOUNG_TIME_SIZE : YOUNG_SIZE}>
      {children}
    </div>
  )
}
