import type { ClockSpec } from '../../schemas/lesson'
import type { Mark } from './quantity'
import { readTime } from './time'

/**
 * P177: a clock the learner sets by dragging its hands, from the "Move the clock hands" board ("Show half past 4 on the clock."). The clock starts at 12
 * o'clock. The long hand stops every `step` minutes; the short hand stops on the hours and sits between them by itself, as far as the minutes have gone. The
 * answer is the time the clock shows, written as a `time` (`4:30`), so a learner who types the time instead is marked the same way. A clock face has no am
 * or pm, so two times twelve hours apart are the same answer (16:30 is half past 4). Pure.
 */

/** The minutes the long hand may stop at. */
export const CLOCK_STEPS = [1, 5, 15, 30] as const
export const clockStep = (c: ClockSpec): number => c.step ?? 5

export type ClockTime = { hour: number; minute: number }

/** The time a clock starts at: 12 o'clock, both hands up. */
export const CLOCK_START: ClockTime = { hour: 12, minute: 0 }

/** Why a clock to set cannot be used, or null. */
export function clockProblem(c: ClockSpec): string | null {
  return (CLOCK_STEPS as readonly number[]).includes(clockStep(c)) ? null : `the long hand stops every ${CLOCK_STEPS.join(', ')} minutes (step)`
}

/** The time on a clock face a text holds (1:00 to 12:59, a 24 hour time and am or pm read on a face of 12 hours), or null when it is not a time of day. */
export function clockOf(text: string): ClockTime | null {
  const t = readTime(text)
  if (!t || t.style === 'duration') return null
  const minutes = ((Math.round(t.minutes) % 720) + 720) % 720
  return { hour: Math.floor(minutes / 60) || 12, minute: minutes % 60 }
}

/** Why the key of a clock to set is not a time it can show, or null: a 12 hour time with no am or pm, on a stop of the long hand, and not 12:00 (the start). */
export function clockKeyProblem(q: { answer: string; answerKind: string; clock: ClockSpec }): string | null {
  if (q.answerKind !== 'time') return 'a clock to set has a time answer'
  const t = readTime(q.answer)
  if (!t || t.style !== 'clock24') return 'the answer is the time on the clock face, written like 4:30, with no am or pm'
  const hour = Math.floor(t.minutes / 60)
  const minute = t.minutes % 60
  if (hour < 1 || hour > 12) return 'the answer is a time on the clock face, from 1:00 to 12:59'
  if (minute % clockStep(q.clock) !== 0) return `the long hand stops every ${clockStep(q.clock)} minutes, so the minutes of the answer are a multiple of ${clockStep(q.clock)}`
  if (hour === 12 && minute === 0) return 'the clock starts at 12:00, so the answer is another time'
  return null
}

/** Marks a clock (set or typed): right when it is the key's time on a clock face, twelve hours apart or not. `comparable` is false when it is not a time of day. */
export function markClock(key: string, answer: string): Mark {
  const k = clockOf(key)
  const a = clockOf(answer)
  if (!k || !a) return { correct: false, comparable: false }
  return { correct: k.hour === a.hour && k.minute === a.minute, comparable: true }
}

/** The answer a clock gives (`4:30`). */
export const clockAnswer = (t: ClockTime): string => `${t.hour}:${String(t.minute).padStart(2, '0')}`

/** A time as it is said: 4 o'clock, half past 4, quarter to 5, 20 past 4, 25 to 5, 13 minutes past 4. */
export function clockWords(t: ClockTime): string {
  const next = (t.hour % 12) + 1
  if (t.minute === 0) return `${t.hour} o'clock`
  if (t.minute === 15) return `quarter past ${t.hour}`
  if (t.minute === 30) return `half past ${t.hour}`
  if (t.minute === 45) return `quarter to ${next}`
  const past = t.minute < 30
  const n = past ? t.minute : 60 - t.minute
  return `${n}${n % 5 === 0 ? '' : n === 1 ? ' minute' : ' minutes'} ${past ? 'past' : 'to'} ${past ? t.hour : next}`
}

/** Where the hands point, in degrees from 12 going round: the long hand by the minutes, the short hand by the hour and as far again as the minutes have gone. */
export const handAngles = (t: ClockTime): { hour: number; minute: number } => ({ hour: ((t.hour % 12) * 30 + t.minute * 0.5) % 360, minute: (t.minute * 6) % 360 })

/** The minute the long hand stops at for an angle (degrees from 12), on a stop of `step` minutes. */
export function minuteAt(angle: number, step: number): number {
  const m = Math.round((((angle % 360) + 360) % 360) / 6 / step) * step
  return m % 60
}

/** The hour the short hand stops at for an angle, when the long hand is on `minute` (the short hand is that far past its hour). */
export function hourAt(angle: number, minute: number): number {
  const h = Math.round((((angle - minute * 0.5) % 360) + 360) % 360 / 30) % 12
  return h === 0 ? 12 : h
}
