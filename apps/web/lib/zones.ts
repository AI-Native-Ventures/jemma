// The day and the month of a learner's practice allowance (P161) are those of the learner's country: "2 a day" starts again at midnight there, and
// a family's pool at the start of the month there. A country with more than one time zone uses its main one (the US: New York). Pure.

const ZONES: Record<string, string> = {
  ZA: 'Africa/Johannesburg',
  US: 'America/New_York',
  KE: 'Africa/Nairobi',
  NG: 'Africa/Lagos',
  GH: 'Africa/Accra',
  UG: 'Africa/Kampala',
  TZ: 'Africa/Dar_es_Salaam',
  RW: 'Africa/Kigali',
  ZM: 'Africa/Lusaka',
  ZW: 'Africa/Harare',
  BW: 'Africa/Gaborone',
  NA: 'Africa/Windhoek',
  ET: 'Africa/Addis_Ababa',
}

export const zoneOf = (country: string | null | undefined): string => ZONES[(country ?? '').toUpperCase()] ?? 'UTC'

type Parts = { y: number; m: number; d: number; hh: number; mm: number; ss: number }

function partsIn(at: Date, zone: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const get = (type: string) => Number(f.formatToParts(at).find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour') % 24, mm: get('minute'), ss: get('second') }
}

/** The zone's offset from UTC at an instant, in ms (Johannesburg: +2 h). */
function offsetAt(at: Date, zone: string): number {
  const p = partsIn(at, zone)
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(at.getTime() / 1000) * 1000
}

/** The instant of a wall-clock time in a zone (midnight of a day, say). */
function instantOf(y: number, m: number, d: number, zone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d))
  return new Date(guess.getTime() - offsetAt(guess, zone))
}

/** Midnight at the start of today in the zone, and at the start of tomorrow. */
export function dayWindow(now: Date, zone: string): { from: Date; to: Date } {
  const p = partsIn(now, zone)
  return { from: instantOf(p.y, p.m, p.d, zone), to: instantOf(p.y, p.m, p.d + 1, zone) }
}

/** Midnight at the start of this month in the zone, and at the start of next month. */
export function monthWindow(now: Date, zone: string): { from: Date; to: Date } {
  const p = partsIn(now, zone)
  return { from: instantOf(p.y, p.m, 1, zone), to: instantOf(p.y, p.m + 1, 1, zone) }
}

/** "1 Dec": the first day of the next window, as the screens say it. */
export function shortDate(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'short' }).format(at)
}

/** "23 Nov 2027" */
export function longDate(at: Date, zone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' }).format(at)
}
