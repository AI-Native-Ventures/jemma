// "My maths": what a learner sees of their own work in a subject. One pure function: no database, no clock but the `now` it is given.
//
// A score is `{ right, asked }`, the learner's OWN answers: never a percent, never a grade, never anything about another learner.
// What counts: the learner's marked answers in class tests the teacher has shared (a paper of no test counts too; a paper still being read
// or waiting in Needs you does not), and the Try answers of the sessions the learner finished (never the warm-up). Past years' records count
// nowhere: they belong to the Long view, which the learner never sees. They are an input only to pick a suggestion (`history`).

import { orderOpenGaps, pickPractice } from './practice'
import type { PracticeInput, PracticePick } from './practice'
import { canonicalFamily, canonicalSubject, strandLabel, strandOrder } from './strands'
import type { Stage } from './types'

export type Score = { right: number; asked: number }

/** What a screen says for a score: "No score yet" when nothing was asked, else "5 of 6 right". */
export const scoreText = (s: Score): string => (s.asked === 0 ? 'No score yet' : `${s.right} of ${s.asked} right`)

export type MyMathsInput = {
  now: Date
  /** The subject of the learner's class. */
  subject: string
  /** The grade of the learner's class. A senior class (Mathematics, Grades 7 to 12) with an approved map lists the families of that map. Not known: the list as it always was. */
  grade?: number | null
  /** The topics of this year's approved maps of the classes the learner is in. */
  topics: { id: string; name: string; family: string; term: number; position: number; prerequisiteIds: string[] }[]
  /** The learner's gaps, open and fixed. */
  gaps: { topicId: string | null; topicName: string; stage: Stage; createdAt: string; fixedAt: string | null }[]
  /** The learner's marked answers, each with the state of its paper and whether its test is still held (null: the paper has no test). */
  answers: { topicId: string | null; topicName: string; family: string | null; correct: boolean; paperStatus: string; testHeld: boolean | null }[]
  /** The learner's sessions with their items (every phase: only `try` counts). Only a session with status `done` counts. */
  sessions: { topicId: string | null; topicName: string | null; family: string | null; status: string; finishedAt: string | null; items: { phase: string; correct: boolean }[] }[]
  /** The strands of the past records by term (the Long view's table). Used only to pick a suggestion when the learner has no gap. */
  history: PracticeInput['strands']
}

export type MyMathsTopic = { id: string; name: string; family: string; term: number; position: number; score: Score; gap: Stage | null }
export type MyMathsStrand = { family: string; label: string; score: Score; topics: MyMathsTopic[] }
export type MyMathsGap = { topicId: string | null; topicName: string; family: string | null; stage: Stage; score: Score }
export type MyMathsSuggestion = {
  topicId: string | null
  topicName: string
  family: string
  why: 'new' | 'practising' | 'fixed' | 'history' | 'map'
  /** The reason in plain words. */
  reason: 'To fix' | 'Practising' | 'Keep it fixed' | 'A good next step'
  score: Score
}
export type MyMaths = { subject: string; strands: MyMathsStrand[]; gaps: MyMathsGap[]; suggestions: MyMathsSuggestion[] }

/** The most the screen suggests. */
const MAX_SUGGESTIONS = 3

/** A senior class: Mathematics, Grades 7 to 12. Its map has algebra, functions, trigonometry and the like, not the six strands of primary school. */
const SENIOR_GRADES = { from: 7, to: 12 }

/** The same name by the rule the planner and the profile use for topic names: trimmed, lower case. */
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

type Row = { topicId: string | null; topicName: string; family: string | null; right: number }

export function buildMyMaths(input: MyMathsInput): MyMaths {
  const { now } = input
  const subject = canonicalSubject(input.subject)
  const topics = [...input.topics].sort((a, b) => a.term - b.term || a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const familyOf = (t: { family: string }) => canonicalFamily(subject, t.family)

  // Every answer that counts is one row: one asked, and one right when it was right.
  const rows: Row[] = [
    ...input.answers
      .filter((a) => a.paperStatus === 'marked' && a.testHeld !== true)
      .map((a) => ({ topicId: a.topicId, topicName: a.topicName, family: a.family, right: a.correct ? 1 : 0 })),
    ...input.sessions
      .filter((s) => s.status === 'done')
      .flatMap((s) => s.items.filter((i) => i.phase === 'try').map((i) => ({ topicId: s.topicId, topicName: s.topicName ?? '', family: s.family, right: i.correct ? 1 : 0 }))),
  ]
  const total = (of: Row[]): Score => ({ right: of.reduce((n, r) => n + r.right, 0), asked: of.length })

  // A row belongs to one topic of the map: by id, else by the same name. A row on no map topic lands in a strand through its family or its name.
  const topicOfRow = (r: Row) => topics.find((t) => r.topicId !== null && t.id === r.topicId) ?? topics.find((t) => same(t.name, r.topicName)) ?? null
  const assigned = rows.map((r) => ({ r, topic: topicOfRow(r) }))
  const mapFamilies = topics.map(familyOf)
  const keys = [...strandOrder(subject), ...mapFamilies.filter((f, i) => !strandOrder(subject).includes(f) && mapFamilies.indexOf(f) === i)]
  const strandOfLooseRow = (r: Row): string | null => {
    const byFamily = r.family ? canonicalFamily(subject, r.family) : ''
    if (byFamily && keys.includes(byFamily)) return byFamily
    const byName = r.topicName ? canonicalFamily(subject, r.topicName) : ''
    return byName && keys.includes(byName) ? byName : null
  }

  // A gap on a topic: found by id or by the same name. An open gap wins over a fixed one.
  const gapOn = (t: { id: string; name: string }): Stage | null => {
    const mine = input.gaps.filter((g) => (g.topicId !== null && g.topicId === t.id) || same(g.topicName, t.name))
    return (mine.find((g) => g.stage !== 'fixed') ?? mine[0])?.stage ?? null
  }
  const scoreOfTopic = (t: { id: string }): Score => total(assigned.filter((a) => a.topic?.id === t.id).map((a) => a.r))

  const strands: MyMathsStrand[] = keys.map((family) => {
    const own = topics.filter((t) => familyOf(t) === family)
    const mine = assigned.filter((a) => (a.topic ? familyOf(a.topic) === family : strandOfLooseRow(a.r) === family)).map((a) => a.r)
    return {
      family,
      label: strandLabel(subject, family),
      score: total(mine),
      topics: own.map((t) => ({ id: t.id, name: t.name, family, term: t.term, position: t.position, score: scoreOfTopic(t), gap: gapOn(t) })),
    }
  })

  // The learner's gaps: open ones in the order the planner takes them, then fixed ones, the newest fixed first.
  const prerequisitesOf = (id: string) => topics.find((t) => t.id === id)?.prerequisiteIds ?? []
  const open = orderOpenGaps(
    input.gaps.filter((g) => g.stage !== 'fixed').map((g) => ({ topic_id: g.topicId, stage: g.stage, created_at: g.createdAt, gap: g })),
    prerequisitesOf,
  ).map((w) => w.gap)
  const fixed = input.gaps
    .filter((g) => g.stage === 'fixed')
    .sort((a, b) => (b.fixedAt ?? '').localeCompare(a.fixedAt ?? '') || a.topicName.localeCompare(b.topicName))
  const topicOfGap = (g: { topicId: string | null; topicName: string }) => topics.find((t) => (g.topicId !== null && t.id === g.topicId) || same(t.name, g.topicName)) ?? null
  const scoreOfGap = (g: { topicId: string | null; topicName: string }): Score =>
    total(rows.filter((r) => (g.topicId !== null && r.topicId === g.topicId) || same(r.topicName, g.topicName)))
  const toGap = (g: MyMathsInput['gaps'][number]): MyMathsGap => {
    const topic = topicOfGap(g)
    return { topicId: g.topicId ?? topic?.id ?? null, topicName: g.topicName, family: topic ? familyOf(topic) : null, stage: g.stage, score: scoreOfGap(g) }
  }
  const gaps = [...open, ...fixed].map(toGap)

  // Suggested for you, at most three: the open gaps in the planner's order, then the fixed gap pickPractice would pick, and only when the
  // learner has no gap at all, the weakest strand of the past records or the first topic of the term.
  const suggestions: MyMathsSuggestion[] = open.slice(0, MAX_SUGGESTIONS).map((g) => {
    const gap = toGap(g)
    return { topicId: gap.topicId, topicName: gap.topicName, family: gap.family ?? '', why: g.stage === 'new' ? 'new' : 'practising', reason: g.stage === 'new' ? 'To fix' : 'Practising', score: gap.score }
  })
  const practice: PracticeInput = {
    now,
    fixedGaps: fixed.map((g) => ({ topicId: g.topicId, topicName: g.topicName, fixedAt: g.fixedAt })),
    finishedSessions: input.sessions.flatMap((s) => (s.status === 'done' && s.finishedAt ? [{ topicId: s.topicId, topicName: s.topicName, finishedAt: s.finishedAt }] : [])),
    strands: input.history,
    mapTopics: topics.map((t) => ({ id: t.id, name: t.name, family: t.family, term: t.term, position: t.position })),
  }
  const fromPick = (pick: PracticePick): MyMathsSuggestion => {
    const score =
      pick.why === 'history'
        ? (strands.find((s) => s.family === pick.family)?.score ?? { right: 0, asked: 0 })
        : pick.why === 'map'
          ? (strands.flatMap((s) => s.topics).find((t) => t.id === pick.topicId)?.score ?? { right: 0, asked: 0 })
          : scoreOfGap({ topicId: pick.topicId, topicName: pick.topicName })
    return { topicId: pick.topicId, topicName: pick.topicName, family: pick.family, why: pick.why, reason: pick.why === 'fixed' ? 'Keep it fixed' : 'A good next step', score }
  }
  if (suggestions.length < MAX_SUGGESTIONS && fixed.length > 0) {
    const pick = pickPractice(practice)
    if (pick?.why === 'fixed') suggestions.push(fromPick(pick))
  }
  if (input.gaps.length === 0) {
    const pick = pickPractice({ ...practice, fixedGaps: [] })
    if (pick) suggestions.push(fromPick(pick))
  }

  // A senior class (Mathematics, Grades 7 to 12) whose class has an approved map: "All of Mathematics" lists the families of that map, in the order
  // they first appear in it (term, then position), and then any of the six primary strands that holds a score of the learner. A primary strand with
  // no topic in the map and no score is left out. Everyone else has the list above: the six strands, then any other family of the map.
  const senior =
    subject === 'Mathematics' && typeof input.grade === 'number' && input.grade >= SENIOR_GRADES.from && input.grade <= SENIOR_GRADES.to && topics.length > 0
  if (!senior) return { subject, strands, gaps, suggestions }
  const ownFamilies = mapFamilies.filter((f, i) => mapFamilies.indexOf(f) === i)
  const shown = [
    ...ownFamilies.map((family) => strands.find((s) => s.family === family)!),
    ...strands.filter((s) => strandOrder(subject).includes(s.family) && !ownFamilies.includes(s.family) && s.score.asked > 0),
  ]
  return { subject, strands: shown, gaps, suggestions }
}
