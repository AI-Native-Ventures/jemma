// The pure pieces of the teacher's Topics screens (P139): how the class is doing by part, by topic and by learner, and what the practice answers say.
// No database, no clock. The numbers are the learners' practice: the Try answers of finished sessions (a session says how many it asked and how many
// were right). The screens say "part" and "topic", never "strand" and never "subtopic".

import { canonicalFamily, canonicalSubject, strandLabel, STRENGTH_FROM } from '@jemma/profiling/logic'

export type MapTopic = { id: string; name: string; family: string; term: number; position: number }
export type Learner = { id: string; name: string }
/** A finished practice session. `asked` is the number of questions it had (null when the session does not say). */
export type SessionRow = { id: string; childId: string; topicId: string | null; topicName: string | null; right: number | null; asked: number | null; finishedAt: string | null }
/**
 * A finished session as the database holds it. A practice a learner really did never has its size written (`question_count` is null: only the planner
 * sets it) and may have no `right`, so the size and the score are read from its Try answers (`withSizes`).
 */
export type RawSession = { id: string; childId: string; topicId: string | null; topicName: string | null; right: number | null; questionCount: number | null; finishedAt: string | null }
/** One Try answer of a session, as little as it takes to size it. Warm-up answers are never in this list. */
export type TryMark = { sessionId: string; correct: boolean }

/** True when a session's size or score is not in its row, so its Try answers are needed to read them. */
export const needsTries = (s: RawSession): boolean => s.questionCount === null || s.questionCount <= 0 || s.right === null

/**
 * The sessions with their size and score filled in. The size is `question_count` when the row has one, else the number of Try answers of the session; the
 * score is `right` when the row has one, else the number of right Try answers. A session with no Try answers and no size in its row has no size: it is
 * left out of every number (`counts`). A row that has both is taken as it is (the made-up learners' practice, the planner's own count).
 */
export function withSizes(raw: RawSession[], tries: TryMark[]): SessionRow[] {
  const by = new Map<string, TryMark[]>()
  for (const t of tries) by.set(t.sessionId, [...(by.get(t.sessionId) ?? []), t])
  return raw.map((s) => {
    const mine = by.get(s.id) ?? []
    const sized = s.questionCount !== null && s.questionCount > 0
    return {
      id: s.id,
      childId: s.childId,
      topicId: s.topicId,
      topicName: s.topicName,
      right: s.right ?? (mine.length > 0 ? mine.filter((t) => t.correct).length : null),
      asked: sized ? s.questionCount : mine.length > 0 ? mine.length : null,
      finishedAt: s.finishedAt,
    }
  })
}

/** One Try answer: the question as the AI wrote it (its notes, the right way), and what the learner typed. */
export type ItemRow = { sessionId: string; childId: string; correct: boolean; answer: string; question: unknown }

export type Tally = { right: number; asked: number; learners: number; sessions: number }
export const NO_TALLY: Tally = { right: 0, asked: 0, learners: 0, sessions: 0 }

/** The class average as a whole percent, or null when nothing was asked. */
export const percentOf = (t: { right: number; asked: number }): number | null => (t.asked > 0 ? Math.round((100 * t.right) / t.asked) : null)

/** The same name by the rule the planner uses: trimmed, lower case. */
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A session that counts: finished with a score and a size. A session that does not say how many it asked cannot be averaged, so it is left out. */
const counts = (s: SessionRow): boolean => s.finishedAt !== null && s.right !== null && s.asked !== null && s.asked > 0

/** The topics in the order of the map: term, then position. */
export const inMapOrder = (topics: MapTopic[]): MapTopic[] =>
  [...topics].sort((a, b) => a.term - b.term || a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

/** The one topic of the map a session belongs to: by its id, else by the same name (the first one in map order). Null when it is on no topic of the map. */
export function topicOfSession(topics: MapTopic[], s: SessionRow): MapTopic | null {
  const ordered = inMapOrder(topics)
  return ordered.find((t) => s.topicId !== null && t.id === s.topicId) ?? ordered.find((t) => s.topicName !== null && same(t.name, s.topicName)) ?? null
}

/** The sessions that count, each on its topic of the map: one list for every topic. A session on no topic of the map is not in any list. */
export function sessionsByTopic(topics: MapTopic[], sessions: SessionRow[]): Map<string, SessionRow[]> {
  const by = new Map<string, SessionRow[]>(topics.map((t) => [t.id, []]))
  for (const s of sessions) {
    if (!counts(s)) continue
    const t = topicOfSession(topics, s)
    if (t) by.get(t.id)!.push(s)
  }
  return by
}

/** What a set of sessions says: the answers right out of the answers asked, and how many learners and sessions they come from. */
export function tally(sessions: SessionRow[]): Tally {
  const good = sessions.filter(counts)
  return {
    right: good.reduce((n, s) => n + s.right!, 0),
    asked: good.reduce((n, s) => n + s.asked!, 0),
    learners: new Set(good.map((s) => s.childId)).size,
    sessions: good.length,
  }
}

export type Part = { family: string; label: string; topics: MapTopic[] }

/** The parts of the class's map in the order they first appear in it, each with its topics in map order. The family is the one the learners' My maths uses. */
export function partsOf(subject: string, topics: MapTopic[]): Part[] {
  const s = canonicalSubject(subject)
  const ordered = inMapOrder(topics)
  const families = [...new Set(ordered.map((t) => canonicalFamily(s, t.family)))]
  return families.map((family) => ({ family, label: strandLabel(s, family), topics: ordered.filter((t) => canonicalFamily(s, t.family) === family) }))
}

export type PartLine = { family: string; label: string; topicCount: number; tried: number; tally: Tally; percent: number | null }

/** One line for each part of the class's map: its class average and how many learners practised any topic of it. */
export function partLines(subject: string, topics: MapTopic[], sessions: SessionRow[]): PartLine[] {
  const by = sessionsByTopic(topics, sessions)
  return partsOf(subject, topics).map((p) => {
    const mine = p.topics.flatMap((t) => by.get(t.id) ?? [])
    const t = tally(mine)
    return { family: p.family, label: p.label, topicCount: p.topics.length, tried: p.topics.filter((x) => (by.get(x.id) ?? []).length > 0).length, tally: t, percent: percentOf(t) }
  })
}

export type TopicLine = { topic: MapTopic; tally: Tally; percent: number | null }

/** One line for each topic of a part, in map order. */
export function topicLines(part: Part, topics: MapTopic[], sessions: SessionRow[]): TopicLine[] {
  const by = sessionsByTopic(topics, sessions)
  return part.topics.map((topic) => {
    const t = tally(by.get(topic.id) ?? [])
    return { topic, tally: t, percent: percentOf(t) }
  })
}

export type LearnerResult = {
  childId: string
  name: string
  /** How many practice sessions the learner finished on the topic. */
  tries: number
  /** The latest one, or null when the learner has not tried the topic. */
  last: { right: number; asked: number; percent: number; finishedAt: string } | null
}

/** Every learner of the class with the last result on a topic, in name order. `sessions` are the sessions of the topic. A learner with none has `last: null`. */
export function learnerResults(learners: Learner[], sessions: SessionRow[]): LearnerResult[] {
  const good = sessions.filter(counts)
  return [...learners]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((l) => {
      const mine = good.filter((s) => s.childId === l.id).sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!) || b.id.localeCompare(a.id))
      const last = mine[0]
      return {
        childId: l.id,
        name: l.name,
        tries: mine.length,
        last: last ? { right: last.right!, asked: last.asked!, percent: percentOf({ right: last.right!, asked: last.asked! })!, finishedAt: last.finishedAt! } : null,
      }
    })
}

/** The learners who need help first: the ones who tried and whose last result is under the strong mark (80 percent), the lowest first. At most `limit`. */
export function needHelpFirst(results: LearnerResult[], limit = 3): LearnerResult[] {
  return results
    .filter((r) => r.last !== null && r.last.percent < STRENGTH_FROM)
    .sort((a, b) => a.last!.percent - b.last!.percent || b.tries - a.tries || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export type MissedQuestion = {
  prompt: string
  /** How many different learners got it wrong, and how many tried it. */
  missedBy: number
  triedBy: number
  /** The AI's own note on the mistake and its right way, as it wrote them with the question. Null when the question has none. */
  why: string | null
  rightWay: string | null
  /** What learners wrote most often when they were wrong, and how many wrote it. */
  commonWrong: { answer: string; count: number } | null
}

const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The question's own fields, read safely from the stored question. */
export function questionFields(question: unknown): { prompt: string | null; why: string | null; rightWay: string | null } {
  const q = question && typeof question === 'object' ? (question as Record<string, unknown>) : {}
  return { prompt: textOf(q.prompt), why: textOf(q.why), rightWay: textOf(q.rightWay) }
}

/**
 * The questions the class missed most, from the Try answers of one topic. A question is told by its words. The most learners who got it wrong first,
 * then the most wrong answers, then in alphabetical order. Only a question someone got wrong is listed. Nothing is written here: the notes are the
 * AI's own, stored with the question when the practice was written.
 */
export function mostMissed(items: ItemRow[], limit = 3): MissedQuestion[] {
  const by = new Map<string, ItemRow[]>()
  for (const it of items) {
    const { prompt } = questionFields(it.question)
    if (prompt) by.set(prompt, [...(by.get(prompt) ?? []), it])
  }
  return [...by.entries()]
    .flatMap(([prompt, rows]) => {
      const wrong = rows.filter((r) => !r.correct)
      if (wrong.length === 0) return []
      const fields = questionFields(rows[0]!.question)
      const answers = new Map<string, number>()
      for (const w of wrong) {
        const a = w.answer.trim()
        if (a) answers.set(a, (answers.get(a) ?? 0) + 1)
      }
      const top = [...answers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      return [
        {
          prompt,
          missedBy: new Set(wrong.map((r) => r.childId)).size,
          triedBy: new Set(rows.map((r) => r.childId)).size,
          why: fields.why,
          rightWay: fields.rightWay,
          commonWrong: top ? { answer: top[0], count: top[1] } : null,
          misses: wrong.length,
        },
      ]
    })
    .sort((a, b) => b.missedBy - a.missedBy || b.misses - a.misses || a.prompt.localeCompare(b.prompt))
    .slice(0, limit)
    .map(({ misses: _misses, ...q }) => q)
}

/** What each score line says: "4 of 5 right". */
export const scoreLine = (right: number, asked: number): string => `${right} of ${asked} right`

/** "3 of 6 learners practised", or "No one has practised yet". `of` is the size of the class. */
export function practisedLine(learners: number, of: number): string {
  if (learners === 0) return 'No one has practised yet'
  return `${learners} of ${of} learner${of === 1 ? '' : 's'} practised`
}

/** A day as the teacher reads it: "15 Nov". South African time, so a session finished late in the evening stays on its day. */
export function dayText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })
}

/** The typesetting of a class's maths lines: all of them for Grades 8 to 12, the primary way (the default) for the rest. */
export const typesetFor = (grade: number): 'all' | undefined => (grade >= 8 ? 'all' : undefined)
