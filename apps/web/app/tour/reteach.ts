import { DELIVERIES, type Delivery } from '../k/learn/_parts/delivery'
import { DEFAULT_YOU } from './outcome'

// Step 4 of the tour, "Teach again", as pure functions: which parts of the lesson library the missed questions point at, which way of learning worked for
// each part, and how the tab remembers it for the teacher's page. No database, no clock, no browser.

/** The part of the library a tour question belongs to: one lesson of the library and the short name the learner and the teacher see. */
export type TourPartTag = { lesson: number; label: string }

/**
 * The tag of each of the five tour questions, in order. Fixed by hand: Question 1 is the quadratic equation, 3 and 5 are two lines that meet (simultaneous
 * equations), 4 is the parabola below the axis (a quadratic inequality), and Question 2 (an equation with fractions) has no lesson in the library yet.
 */
export const TOUR_QUESTION_TAGS: (TourPartTag | null)[] = [
  { lesson: 1, label: 'Quadratic equations' },
  null,
  { lesson: 5, label: 'Simultaneous equations' },
  { lesson: 6, label: 'Quadratic inequalities' },
  { lesson: 5, label: 'Simultaneous equations' },
]

/** One part Jemma teaches again: the lesson it is, and the questions (numbered from 1) that were missed in it. */
export type TeachPart = TourPartTag & { questions: number[] }

/** The missed questions of a lesson, grouped: the parts to teach again and the numbers of the missed questions that have no lesson. */
export type MissedGroups = { parts: TeachPart[]; also: number[] }

/** Groups the missed questions (a false in `correct`) by their tag. Parts with more missed questions come first, then the lesson's place in the library. */
export function groupMissed(correct: boolean[], tags: (TourPartTag | null)[] = TOUR_QUESTION_TAGS): MissedGroups {
  const byLesson = new Map<number, TeachPart>()
  const also: number[] = []
  correct.forEach((right, i) => {
    if (right) return
    const tag = tags[i] ?? null
    if (!tag) return void also.push(i + 1)
    const part = byLesson.get(tag.lesson)
    if (part) part.questions.push(i + 1)
    else byLesson.set(tag.lesson, { ...tag, questions: [i + 1] })
  })
  const parts = [...byLesson.values()].sort((a, b) => b.questions.length - a.questions.length || a.lesson - b.lesson)
  return { parts, also }
}

/** "Question 3" or "Questions 3 and 5" (and "Questions 1, 3 and 5"). */
export function questionWords(numbers: number[]): string {
  if (numbers.length === 1) return `Question ${numbers[0]}`
  return `Questions ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

/** The one line for the missed questions that have no lesson, or null when there are none. */
export function alsoMissedLine(also: number[]): string | null {
  if (also.length === 0) return null
  return `Also missed: ${questionWords(also)}. Jemma teaches ${also.length === 1 ? 'it' : 'them'} in your next practice.`
}

/** What happened with one part: the ways tried, in order, and the one that worked (null when none did, "not yet"). */
export type PartOutcome = { lesson: number; label: string; tried: Delivery[]; worked: Delivery | null }
export type ReteachOutcome = { parts: PartOutcome[] }

/** How a way of learning is said in "Learns best by: ...". */
export const LEARNS_BY: Record<Delivery, string> = { read: 'Reading', pictures: 'Pictures', listen: 'Listening' }

/** The way that worked most often. A tie goes to the way that worked most recently (the later part). Null when nothing worked. */
export function learnsBest(parts: PartOutcome[]): Delivery | null {
  const count = new Map<Delivery, { n: number; last: number }>()
  parts.forEach((p, i) => {
    if (!p.worked) return
    count.set(p.worked, { n: (count.get(p.worked)?.n ?? 0) + 1, last: i })
  })
  let best: Delivery | null = null
  for (const d of DELIVERIES) {
    const c = count.get(d)
    if (!c) continue
    const b = best ? count.get(best)! : null
    if (!b || c.n > b.n || (c.n === b.n && c.last > b.last)) best = d
  }
  return best
}

/** "Learns best by: Listening", or what Jemma says when no way has worked yet. */
export const learnsBestLine = (best: Delivery | null): string => (best ? `Learns best by: ${LEARNS_BY[best]}` : 'Learns best by: not clear yet')

/** The tab remembers what Jemma found, so the teacher's page can show the same a moment later. */
export const TOUR_RETEACH_KEY = 'jemma-tour-reteach'

/** What the teacher's page shows when nothing is saved: the tour gone through as the owner goes through it (DEFAULT_YOU), and both parts learned by listening. */
export const DEFAULT_RETEACH: ReteachOutcome = {
  parts: groupMissed(DEFAULT_YOU).parts.map((p) => ({ lesson: p.lesson, label: p.label, tried: ['listen'], worked: 'listen' })),
}

const isDelivery = (v: unknown): v is Delivery => typeof v === 'string' && (DELIVERIES as readonly string[]).includes(v)
const isPart = (v: unknown): v is PartOutcome => {
  const p = v as Partial<PartOutcome> | null
  return (
    typeof p === 'object' &&
    p !== null &&
    Number.isInteger(p.lesson) &&
    typeof p.label === 'string' &&
    Array.isArray(p.tried) &&
    p.tried.every(isDelivery) &&
    (p.worked === null || isDelivery(p.worked))
  )
}

export function saveReteach(store: Pick<Storage, 'setItem'>, outcome: ReteachOutcome): void {
  try {
    store.setItem(TOUR_RETEACH_KEY, JSON.stringify(outcome))
  } catch {
    // a browser that keeps nothing: the teacher's page shows the default
  }
}

/** A new result of the lesson makes what was saved about teaching it again old: it is taken away. */
export function clearReteach(store: Pick<Storage, 'removeItem'>): void {
  try {
    store.removeItem(TOUR_RETEACH_KEY)
  } catch {
    // nothing to take away
  }
}

/** What Jemma found in this tab, or null when the learner has not been through "Teach again" (or what is saved cannot be read). */
export function savedReteach(store: Pick<Storage, 'getItem'>): ReteachOutcome | null {
  try {
    const raw = store.getItem(TOUR_RETEACH_KEY)
    const parsed = raw === null ? null : (JSON.parse(raw) as { parts?: unknown } | null)
    if (parsed && Array.isArray(parsed.parts) && parsed.parts.every(isPart)) return { parts: parsed.parts }
  } catch {
    // not readable: nothing saved
  }
  return null
}
