const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/** "Wednesday" for a `YYYY-MM-DD` day. */
export const weekdayName = (iso: string) => WEEKDAYS[parts(iso).dow]!

/** "2 Oct" from an ISO date or timestamp. */
export function shortDate(iso: string): string {
  const { m, d } = parts(iso)
  return `${d} ${MONTHS[m - 1]}`
}

/** True when `iso` is the same calendar day as `now` (UTC, like the stored timestamps). */
export const isSameDay = (iso: string, now: Date = new Date()) => iso.slice(0, 10) === now.toISOString().slice(0, 10)
