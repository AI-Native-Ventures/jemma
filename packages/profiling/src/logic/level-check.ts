// P163: the level check. A learner new to Jemma answers 12 questions, 2 on each of 6 topics of their grade, and Jemma finds where to start: the topics
// the learner is solid on, the topics to start with, and the ones where it is too early to tell. Pure functions: no database, no clock.

/** Topics in one level check, questions on each, and the questions in all. */
export const LEVEL_TOPICS = 6
export const LEVEL_PER_TOPIC = 2
export const LEVEL_QUESTIONS = LEVEL_TOPICS * LEVEL_PER_TOPIC

/** What a level check finds for one topic: solid (every question right), start (none right: a new gap) or unsure (too early to tell). */
export type LevelVerdict = 'solid' | 'start' | 'unsure'

export type LevelTopic = { topicId: string | null; topicName: string; family: string }

/** One answered question of a check: its topic, whether it was right, and whether the learner tapped "I don't know yet". */
export type LevelAnswer = { topicId: string | null; topicName: string; correct: boolean; skipped?: boolean }

export type LevelTopicResult = { topicId: string | null; topicName: string; right: number; of: number; verdict: LevelVerdict }

type MapTopic = { id: string; name: string; family: string; term: number; position: number }

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * The topics a level check asks about, from the learner's map of their grade: in the order of the year (term, then place in the term), one topic of
 * each family in turn, so the check covers as many parts of the grade as it can (numbers, patterns, shapes, measures, data...). A name that is on the
 * map twice counts once. Fewer than `count` when the map has fewer topics.
 */
export function pickLevelTopics(mapTopics: MapTopic[], count: number = LEVEL_TOPICS): LevelTopic[] {
  const ordered = [...mapTopics].sort((a, b) => a.term - b.term || a.position - b.position || a.name.localeCompare(b.name))
  const unique: MapTopic[] = []
  for (const t of ordered) if (t.name.trim() && !unique.some((u) => sameName(u.name, t.name))) unique.push(t)
  const families: string[] = []
  for (const t of unique) if (!families.includes(t.family)) families.push(t.family)
  const queues = families.map((f) => unique.filter((t) => t.family === f))
  const picked: MapTopic[] = []
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift()
      if (next && picked.length < count) picked.push(next)
    }
  }
  // Back in the order of the year, so the check goes from the start of the grade to its end.
  return picked
    .sort((a, b) => a.term - b.term || a.position - b.position)
    .map((t) => ({ topicId: t.id, topicName: t.name, family: t.family }))
}

/** The verdict for one topic: every question right is solid, none right is where to start, anything else (or a single question) is too early to tell. */
export function levelVerdict(right: number, of: number): LevelVerdict {
  if (of < LEVEL_PER_TOPIC) return 'unsure'
  if (right >= of) return 'solid'
  if (right <= 0) return 'start'
  return 'unsure'
}

/** The result of each topic, in the order the topics were first asked. "I don't know yet" counts as not right. */
export function levelResults(answers: LevelAnswer[]): LevelTopicResult[] {
  const out: LevelTopicResult[] = []
  for (const a of answers) {
    let row = out.find((r) => (a.topicId !== null && r.topicId === a.topicId) || sameName(r.topicName, a.topicName))
    if (!row) {
      row = { topicId: a.topicId, topicName: a.topicName, right: 0, of: 0, verdict: 'unsure' }
      out.push(row)
    }
    row.of += 1
    if (a.correct && !a.skipped) row.right += 1
  }
  return out.map((r) => ({ ...r, verdict: levelVerdict(r.right, r.of) }))
}

/** The topic to learn first: the first topic to start with, else the first that is too early to tell. Null when every topic is solid. */
export function firstToLearn(results: LevelTopicResult[]): LevelTopicResult | null {
  return results.find((r) => r.verdict === 'start') ?? results.find((r) => r.verdict === 'unsure') ?? null
}

const lowerFirst = (s: string): string => (s.length > 1 && s[1] === s[1]!.toLowerCase() ? s[0]!.toLowerCase() + s.slice(1) : s)

/** The parent's one-line answer, with the learner's name and never he or she: what the learner is solid on, and where to start. */
export function levelHeadline(name: string, results: LevelTopicResult[]): string {
  const solid = results.filter((r) => r.verdict === 'solid')
  const start = results.find((r) => r.verdict === 'start')
  if (results.length === 0) return `${name} has not done the level check yet.`
  if (solid.length === results.length) return `${name} is solid on all ${results.length} topics of the check.`
  if (solid.length > 0 && start) return `${name} is solid on ${lowerFirst(solid[0]!.topicName)}. ${start.topicName} is where to start.`
  if (start) return `${start.topicName} is where ${name} starts.`
  if (solid.length > 0) return `${name} is solid on ${lowerFirst(solid[0]!.topicName)}. Jemma checks the rest in the lessons.`
  return `Too early to tell. Jemma checks again in ${name}'s lessons.`
}
