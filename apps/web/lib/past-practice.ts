/** The learner's finished practices as "Your practice" lists them (no database: the rows come in, plain facts go out, so it is tested without one). */

/** How many questions a practice has when the row does not say (the same default the session uses). */
export const DEFAULT_QUESTION_COUNT = 5

export type PracticeSessionRow = {
  id: string
  topic_name: string | null
  finished_at: string | null
  planned_for: string
  right: number | null
  question_count: number | null
}

export type PracticeRow = {
  sessionId: string
  topic: string
  /** The day it was finished, as a learner reads it: "Mon 16 Nov". */
  day: string
  /** "4 of 5 right", or an empty line when the practice has no count saved. */
  score: string
  /** When it was finished (sorting only). */
  at: string
}

/** "4 of 5 right", never a percent. */
export const scoreLine = (right: number | null, total: number): string => (right === null ? '' : `${right} of ${total} right`)

/** "Mon 16 Nov" for an ISO moment, on the clock of the learner's country (the one the other screens use), or '' when it is not a date. */
export function dayStamp(iso: string | null): string {
  if (!iso) return ''
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(when)
  const of = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${of('weekday')} ${of('day')} ${of('month')}`
}

/** The finished practices, newest first. A practice with no finish time counts from the day it was planned for. */
export function practiceRows(rows: PracticeSessionRow[]): PracticeRow[] {
  return rows
    .map((r): PracticeRow => {
      const at = r.finished_at ?? `${r.planned_for}T12:00:00Z`
      return {
        sessionId: r.id,
        topic: r.topic_name?.trim() || 'Practice',
        day: dayStamp(at),
        score: scoreLine(r.right, r.question_count ?? DEFAULT_QUESTION_COUNT),
        at,
      }
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
