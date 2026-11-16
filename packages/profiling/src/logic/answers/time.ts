/**
 * P148: the answer kind `time`. A time of day (14:30, 2:30 pm, 14h30) or a length of time (2 h 15 min, 135 min, 2:15, 1,5 h) is read as a number of minutes,
 * and two answers are the same when they are the same number of minutes. So 14:30 and 2:30 pm are the same time, and 2 h 15 min, 135 min and 2:15 are the
 * same length. A point between the hours and the minutes is read as a colon (14.30 is 14:30), as South African clocks are written. The 12 hour clock needs its am or pm: 2:30 is not 2:30 pm. Nothing here reads a date, a second or a time zone.
 */

import type { Mark } from './quantity'

/** How the screen asks for it: the hours and the minutes of a 24 hour clock, of a 12 hour clock (with am and pm), or of a length of time. */
export type TimeStyle = 'clock24' | 'clock12' | 'duration'
export type TimeReading = { minutes: number; style: TimeStyle }

const NUM = '\\d+(?:[.,]\\d+)?'
/** "a.m." and "pm": the last letters of a 12 hour time. */
const AMPM = /^(.*?)\s*([ap])\.?\s?m\.?$/
const CLOCK_12 = /^(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?$/
const CLOCK_24 = /^(\d{1,2})\s*[:h.]\s*(\d{2})$/
/** 2 h 15 min, 2 hours and 15 minutes, 135 min, 1,5 h, 2h 15m. */
const DURATION = new RegExp(`^(?:(${NUM})\\s*(?:hours?|hrs?|h)\\.?)?(?:\\s*(?:and|,)?\\s*)?(?:(${NUM})\\s*(?:minutes?|mins?|m)\\.?)?$`)

const number = (text: string) => Number(text.replace(',', '.'))

/** The time a text holds, or null when it is not one (a bare number, a minute of 60 or more, 13:00 pm, a word). */
export function readTime(text: string): TimeReading | null {
  const raw = text.replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!raw || raw.length > 40) return null

  const ap = AMPM.exec(raw)
  if (ap) {
    const found = CLOCK_12.exec(ap[1]!.trim())
    if (!found) return null
    const hour = Number(found[1])
    const minute = found[2] === undefined ? 0 : Number(found[2])
    if (hour < 1 || hour > 12 || minute > 59) return null
    return { minutes: ((hour % 12) + (ap[2] === 'p' ? 12 : 0)) * 60 + minute, style: 'clock12' }
  }

  const clock = CLOCK_24.exec(raw)
  if (clock) {
    const minute = Number(clock[2])
    return minute > 59 ? null : { minutes: Number(clock[1]) * 60 + minute, style: 'clock24' }
  }

  const length = DURATION.exec(raw)
  if (length && (length[1] || length[2])) {
    const minutes = (length[1] ? number(length[1]) * 60 : 0) + (length[2] ? number(length[2]) : 0)
    return { minutes: Math.round(minutes * 1e6) / 1e6, style: 'duration' }
  }
  return null
}

/** How to ask for the answer a key holds, or null when the key is not a time. It says nothing of the key's value. */
export const timeStyleOf = (key: string): TimeStyle | null => readTime(key)?.style ?? null

/** Two times are the same when they are the same number of minutes. A key or an answer that is not a time is not readable, so it is not right. */
export function markTime(key: string, answer: string): Mark {
  const k = readTime(key)
  const a = readTime(answer)
  if (!k || !a) return { correct: false, comparable: false }
  return { correct: Math.abs(k.minutes - a.minutes) < 1e-6, comparable: true }
}
