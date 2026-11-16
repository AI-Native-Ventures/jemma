import type { TimeStyle } from '@jemma/profiling/logic'

// P148: the line under the boxes of a quantity (what goes in them), for the screen, and the same line for a pencil on the paper sheet. Plain words, short
// sentences. A hint never says whether an answer is right and never holds a number of the key: the examples are fixed ones.

type Extras = { unit?: string; round?: number; signed?: true }

/** "Round it to 2 decimal places." and its two special cases. */
export function roundLine(places: number | undefined): string {
  if (places === undefined) return ''
  if (places === 0) return ' Round it to the nearest whole number.'
  return ` Round it to ${places} decimal ${places === 1 ? 'place' : 'places'}.`
}

/** The line under the box of a number answer. With no unit and no round it is the line it always was. */
export function numberHint({ unit, round }: Extras): string {
  if (!unit && round === undefined) return 'Type a number. It may be negative, like -3.'
  const base = unit === 'R' ? 'Type the amount in rand, like 15386,42.' : unit ? 'Type only the number. The unit is already there.' : 'Type a number. It may be negative, like -3.'
  return base + roundLine(round)
}

/** The line under the box of a whole or a decimal answer that has a unit, a round or a minus key. */
export function plainNumberHint(kind: 'whole' | 'decimal', { unit, round, signed }: Extras): string {
  const base = kind === 'whole' ? 'Type a whole number.' : 'Type a number with a comma, like 0,5.'
  const sign = signed ? ' It may be negative.' : ''
  const unitLine = unit ? (unit === 'R' ? ' Type only the amount.' : ' The unit is already there.') : ''
  return base + sign + unitLine + roundLine(round)
}

export function timeHint(style: TimeStyle, young = false): string {
  // P151: a learner of Grade 1 to 6 reads the line without an example of a 24 hour clock (3:30 is a time they know, 14:30 is not).
  if (young && style === 'clock24') return 'Type the hours and the minutes.'
  if (young && style === 'clock12') return 'Type the hours and the minutes. Then pick am or pm.'
  if (style === 'clock12') return 'Type the hours and the minutes, then pick am or pm.'
  if (style === 'duration') return 'Type the hours and the minutes. You can leave one empty.'
  return 'Type the hours and the minutes, like 14:30.'
}

export function ratioHint(parts: 2 | 3): string {
  return parts === 3 ? 'Type the three numbers of the ratio, like 2 : 3 : 5.' : 'Type the two numbers of the ratio, like 3 : 4.'
}

// ---- The paper sheet ---------------------------------------------------------------------------------------------------------------

export function numberWriteLine({ unit, round }: Extras): string {
  if (!unit && round === undefined) return 'Write a number. It may be negative, like -3.'
  const base = unit === 'R' ? 'Write the amount in rand, like R15 386,42.' : unit ? `Write the number, then the unit (${unit}).` : 'Write a number. It may be negative, like -3.'
  return base + roundLine(round)
}

export function plainNumberWriteLine(kind: 'whole' | 'decimal', { unit, round, signed }: Extras): string {
  const base = kind === 'whole' ? 'Write a whole number.' : 'Write a number with a comma, like 0,5.'
  return base + (signed ? ' It may be negative.' : '') + (unit ? (unit === 'R' ? ' Write the amount in rand.' : ` Write the unit (${unit}) after it.`) : '') + roundLine(round)
}

export function timeWriteLine(style: TimeStyle, young = false): string {
  if (young && style === 'clock24') return 'Write the time in hours and minutes, like 3:30.'
  if (style === 'clock12') return 'Write the time with am or pm, like 2:30 pm.'
  if (style === 'duration') return 'Write the hours and the minutes, like 2 h 15 min.'
  return 'Write the time in hours and minutes, like 14:30.'
}

export function ratioWriteLine(parts: 2 | 3): string {
  return parts === 3 ? 'Write the ratio with a colon, like 2 : 3 : 5.' : 'Write the ratio with a colon, like 3 : 4.'
}
