// The made-up cast of Hillview Primary and the start-stage seed values (from the boards).

export const SCHOOL = { name: 'Hillview Primary', country: 'ZA', region: 'Gauteng', grades: 'Grade R to 7' }
export const CLASS = { name: '6B Mathematics', grade: 6, subject: 'Mathematics' }

/** The empty school (a visitor who starts from nothing): no class, one teacher login. */
export const EMPTY_SCHOOL = { name: 'My made-up school', country: 'ZA', region: 'Gauteng', grades: 'Grade 1 to 12' }
export const EMPTY_TEACHER = { displayName: 'You', emailLocal: 'you' }

export const CHILD_PIN = '1234'

export const CAST = {
  teacher: { displayName: 'Ms Banda', emailLocal: 'ms.banda' },
  parent: { displayName: 'Thandi M', emailLocal: 'thandi', firstName: 'Thandi', relation: 'mum' },
  children: ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi'],
} as const

/** Days (counting back from D, school days only) on which a child was away. Index 0 is the oldest of the 10 days. */
export const AWAY_DAY_INDEX: Record<string, number[]> = {
  Amina: [4],
  Thabo: [2, 8],
  Lerato: [],
  Sipho: [],
  Naledi: [7],
}

export const NOTES = [
  { daysAgo: 5, kind: 'participation', text: 'Works well in a group and explains her thinking clearly.' },
  { daysAgo: 12, kind: 'effort', text: 'Finished the decimals extension task without help.' },
] as const

export const AMINA_ACTIVITIES = [
  { kind: 'sport', name: 'Netball', place: null, days: ['Tue', 'Thu'], since: 'Last term' },
  { kind: 'music', name: 'School choir', place: null, days: ['Fri'], since: 'This term' },
] as const

/** The last 10 school days before `today` (UTC), oldest first, as YYYY-MM-DD. */
export function lastSchoolDays(today: Date, count = 10): string[] {
  const days: string[] = []
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  while (days.length < count) {
    d.setUTCDate(d.getUTCDate() - 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10))
  }
  return days.reverse()
}
