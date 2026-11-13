// What a learner practises when nothing is planned for them. One pure function: no database, no clock but the `now` it is given.
// A learner with an open gap never comes here: the planner plans the gap.

import { termOf } from './long-view'
import { canonicalFamily } from './strands'

export type PracticePick = {
  topicName: string
  /** The topic row, when there is one. A strand of the past records has none. */
  topicId: string | null
  /** The topic family, or the strand key for a strand. Empty when the topic is on no map. */
  family: string
  /** `fixed`: a fixed gap kept fixed. `history`: the weakest strand of the past records. `map`: the first topic of the term. */
  why: 'fixed' | 'history' | 'map'
}

export type PracticeInput = {
  now: Date
  /** The learner's gaps in stage `fixed`. */
  fixedGaps: { topicId: string | null; topicName: string; fixedAt: string | null }[]
  /** The sessions the learner finished, with their topic and when. */
  finishedSessions: { topicId: string | null; topicName: string | null; finishedAt: string }[]
  /** The strands of the learner's subject in the order the subject shows them, with their percent by term (null: no marks that term). */
  strands: { subject: string; family: string; label: string; byTerm: { year: number; term: number; percent: number | null }[] }[]
  /** The topics of the approved maps of the learner's classes. */
  mapTopics: { id: string; name: string; family: string; term: number; position: number }[]
}

/** The same name by the rule the planner and the profile use for topic names: trimmed, lower case. */
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()
const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
const time = (iso: string | null): number => (iso ? Date.parse(iso) : -Infinity)

/** A learner's last three terms with marks count, and a strand needs at least one. */
const TERMS_COUNTED = 3

export function pickPractice(input: PracticeInput): PracticePick | null {
  const { now, mapTopics } = input
  const topicOfGap = (g: { topicId: string | null; topicName: string }) =>
    mapTopics.find((t) => g.topicId !== null && t.id === g.topicId) ?? mapTopics.find((t) => same(t.name, g.topicName))

  // a. A fixed gap practised longest ago. A gap not practised since it was fixed counts as the oldest.
  if (input.fixedGaps.length > 0) {
    const practisedAt = (g: PracticeInput['fixedGaps'][number]): number =>
      Math.max(
        -Infinity,
        ...input.finishedSessions
          .filter((s) => (g.topicId !== null && s.topicId === g.topicId) || (s.topicName !== null && same(s.topicName, g.topicName)))
          .map((s) => time(s.finishedAt))
          .filter((t) => t > time(g.fixedAt)),
      )
    const [first] = [...input.fixedGaps].sort(
      (a, b) => practisedAt(a) - practisedAt(b) || time(a.fixedAt) - time(b.fixedAt) || a.topicName.localeCompare(b.topicName),
    )
    const topic = topicOfGap(first!)
    return { topicName: first!.topicName, topicId: first!.topicId ?? topic?.id ?? null, family: topic?.family ?? '', why: 'fixed' }
  }

  // b. The weakest strand: the lowest mean percent over its last three terms with marks.
  const today = isoDay(now)
  const marked = input.strands
    .map((s) => {
      const percents = [...s.byTerm]
        .sort((a, b) => a.year - b.year || a.term - b.term)
        .flatMap((t) => (t.percent === null ? [] : [t.percent]))
        .slice(-TERMS_COUNTED)
      return { strand: s, mean: percents.length ? percents.reduce((sum, p) => sum + p, 0) / percents.length : null }
    })
    .flatMap((m) => (m.mean === null ? [] : [{ strand: m.strand, mean: m.mean }]))
  if (marked.length > 0) {
    const practisedToday = (s: PracticeInput['strands'][number]): boolean =>
      input.finishedSessions.some((f) => {
        if (isoDay(new Date(f.finishedAt)) !== today) return false
        const family = f.topicId !== null ? mapTopics.find((t) => t.id === f.topicId)?.family : undefined
        if (family !== undefined && canonicalFamily(s.subject, family) === s.family) return true
        return f.topicName !== null && (same(f.topicName, s.label) || canonicalFamily(s.subject, f.topicName) === s.family)
      })
    // A strand practised today is skipped when another strand qualifies.
    const fresh = marked.filter((m) => !practisedToday(m.strand))
    const pool = fresh.length > 0 ? fresh : marked
    // `<` keeps the first of a tie: the strand that comes first in the subject.
    const weakest = pool.reduce((best, m) => (m.mean < best.mean ? m : best))
    return { topicName: weakest.strand.label, topicId: null, family: weakest.strand.family, why: 'history' }
  }

  // c. The first topic of the current term (by position), or the first topic of the map when that term has none.
  if (mapTopics.length > 0) {
    const order = [...mapTopics].sort((a, b) => a.term - b.term || a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    const term = termOf(today)
    const first = order.find((t) => t.term === term) ?? order[0]!
    return { topicName: first.name, topicId: first.id, family: first.family, why: 'map' }
  }

  // d. Nothing to practise.
  return null
}
