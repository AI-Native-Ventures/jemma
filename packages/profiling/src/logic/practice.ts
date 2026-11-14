// What a learner practises when nothing is planned for them. One pure function: no database, no clock but the `now` it is given.
// A learner with an open gap never comes here: the planner plans the gap.

import { termOf } from './long-view'
import { canonicalFamily, canonicalSubject, strandLabel, strandOrder } from './strands'
import type { Stage } from './types'

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

/**
 * The open gaps in the order the planner takes them: lowest stage first (new, then practising), then the oldest; the first is the
 * basic it needs when that is a gap too (and so on down the prerequisites). The planner plans the first. `prerequisitesOf` gives the topic
 * ids a topic needs. Fixed gaps are not open: leave them out before asking.
 */
export function orderOpenGaps<G extends { topic_id: string | null; stage: Stage; created_at: string }>(open: G[], prerequisitesOf: (topicId: string) => readonly string[]): G[] {
  const rank: Record<Stage, number> = { new: 0, practising: 1, fixed: 2 }
  const gaps = [...open].sort((a, b) => rank[a.stage] - rank[b.stage] || a.created_at.localeCompare(b.created_at))
  const gapAt = (id: string | null) => (id ? gaps.find((g) => g.topic_id === id) : undefined)
  let first = gaps[0]
  for (const seen = new Set<string>(); first && first.topic_id && !seen.has(first.topic_id); ) {
    seen.add(first.topic_id)
    const basic = prerequisitesOf(first.topic_id).map(gapAt).find((g) => g)
    if (!basic) break
    first = basic
  }
  return first ? [first, ...gaps.filter((g) => g !== first)] : []
}

/** What a learner asks to practise: a topic of the map by id or name, a gap by name, or a strand by its label. */
export type PracticeChoice = { topicId?: string | null; topicName: string }

/** The choice as the planner plans it, in the words of what it found (never the words the learner typed). */
export type ChosenTopic = { topicName: string; topicId: string | null; family: string; kind: 'map' | 'gap' | 'strand' }

export type ChoiceRules = {
  /** The topics of the approved maps of the classes the learner is in. */
  mapTopics: { id: string; name: string; family: string }[]
  /** The learner's gaps, open or fixed. */
  gaps: { topicId: string | null; topicName: string }[]
  /** The subject of the learner's class, or null when there is none. */
  subject: string | null
}

/**
 * Whether a choice is the learner's to make, and what it is: a topic of an approved map of a class the learner is in (by id, or by name),
 * or the name of one of the learner's gaps, or the label of a strand of the learner's subject. Anything else, and an empty name, is
 * refused (null). The planner and the server action that asks for a practice both use it, so they refuse the same things.
 */
export function resolveChoice(choice: PracticeChoice, rules: ChoiceRules): ChosenTopic | null {
  const name = choice.topicName.trim()
  if (!name) return null
  const byName = (t: { name: string }) => same(t.name, name)
  const mapTopic = (rules.mapTopics.find((t) => !!choice.topicId && t.id === choice.topicId) ?? rules.mapTopics.find(byName)) ?? null
  if (mapTopic) return { topicName: mapTopic.name, topicId: mapTopic.id, family: mapTopic.family, kind: 'map' }
  const gap = rules.gaps.find((g) => same(g.topicName, name))
  if (gap) {
    const topic = rules.mapTopics.find((t) => (gap.topicId !== null && t.id === gap.topicId) || same(t.name, gap.topicName))
    return { topicName: gap.topicName, topicId: gap.topicId ?? topic?.id ?? null, family: topic?.family ?? '', kind: 'gap' }
  }
  if (rules.subject) {
    const subject = canonicalSubject(rules.subject)
    const family = strandOrder(subject).find((f) => same(strandLabel(subject, f), name))
    if (family) return { topicName: strandLabel(subject, family), topicId: null, family, kind: 'strand' }
  }
  return null
}
