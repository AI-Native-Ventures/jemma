// Practice history for made-up learners (P139): finished practice sessions with their five Try answers, so the teacher's Topics screens have
// something to show. Server only for `addMadeUpPractice` (needs the service role client); `buildMadeUpPractice` is pure: no database, no clock but
// the `now` it is given, no random numbers. The same learners and topics always make the same sessions.
//
// The questions are real ones the AI wrote: a committed Grade 11 lesson on Equations and inequalities (`fixtures/lesson-eq11.json`, 15 questions,
// 5 at each level). A made-up learner's Try answers are those questions with answers made up from a strength: some learners are strong, some weak,
// and the same question is the one most learners miss. Only a topic of the class's approved map that a fixture fits gets practice; any other topic
// has none. Never used for real learners: the caller passes only the ids of the children it has just made.
import type { Json, JemmaDb } from '../../packages/profiling/src/db'
import eq11 from './fixtures/lesson-eq11.json' with { type: 'json' }

/** One question as the lesson fixture holds it (and as a session item stores it). */
export type FixtureQuestion = {
  prompt: string
  answer: string
  answerKind?: string
  choices?: string[]
  difficulty: number
  why?: string
  rightWay?: string
  [more: string]: unknown
}
export type PracticeFixture = { topic_name: string; format: 'reading' | 'diagram' | 'audio'; content: { title?: string; minutes?: number; questions: FixtureQuestion[] } }

/** The lessons a topic can be practised from, by the topic's name. */
export const PRACTICE_FIXTURES: PracticeFixture[] = [eq11 as unknown as PracticeFixture]

/** The most topics of a class that get practice. */
export const MAX_PRACTICE_TOPICS = 3
/** Try answers in every session. */
export const TRIES_PER_SESSION = 5

export type MapTopicRef = { id: string; name: string }
export type SessionInsert = {
  id: string
  child_id: string
  status: 'done'
  planned_for: string
  topic_id: string
  topic_name: string
  format: PracticeFixture['format']
  planned_minutes: number
  minutes: number
  question_count: number
  right: number
  created_at: string
  finished_at: string
}
export type ItemInsert = {
  session_id: string
  position: number
  phase: 'try'
  question: NonNullable<Json>
  difficulty: number
  answer: string
  correct: boolean
  seconds: number
}

// ---- Small deterministic helpers -------------------------------------------------------------------------------------------------

/** FNV-1a, 32 bits: the same text always gives the same number. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A UUID-shaped id made from a text: the same text always gives the same id. */
export function idFrom(text: string): string {
  const hex = [0, 1, 2, 3].map((i) => hash(`${i}|${text}`).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const plain = (name: string): string => name.replace(/\s*\(Term\s*\d+\)\s*$/i, '').trim().toLowerCase()

/** The fixture that fits a topic of the map, by name (a second teaching of the topic, "(Term 3)", fits the same one). Null: no practice for this topic. */
export const fixtureFor = (topicName: string): PracticeFixture | null => PRACTICE_FIXTURES.find((f) => plain(f.topic_name) === plain(topicName)) ?? null

/** How strong each learner is on a topic, as a share of the five answers: the order of the class moves from topic to topic. */
const STRENGTH = [0.92, 0.8, 0.68, 0.52, 0.36, 0.2]

/** A wrong answer for a question: always the same one for a question (so a class makes the same mistake), another one now and then. */
export function wrongAnswer(q: FixtureQuestion, variant: boolean): string {
  const right = q.answer.trim()
  if (q.choices && q.choices.length > 1 && /^[A-Z]$/.test(right)) {
    const others = q.choices.map((_, i) => String.fromCharCode(65 + i)).filter((l) => l !== right)
    return others[(hash(q.prompt) + (variant ? 1 : 0)) % others.length]!
  }
  const last = /(\d+)(?!.*\d)/.exec(right)
  if (!last) return 'I am not sure'
  const n = Number(last[1])
  const step = variant ? 2 : hash(q.prompt) % 2 === 0 ? 1 : -1
  const moved = n + step < 0 ? n + 1 : n + step
  return `${right.slice(0, last.index)}${moved}${right.slice(last.index + last[1]!.length)}`
}

// ---- The builder -----------------------------------------------------------------------------------------------------------------

/**
 * Finished practice sessions with their Try answers for the made-up learners `childIds` on up to three of the class's topics that a fixture fits.
 * Every learner has 1 to 3 sessions on a topic, spread over the last two weeks and at least three days old (so the class home does not read them as
 * "last night's lessons"). One learner of the class has not tried each topic, so "not tried" shows. No learner: nothing.
 */
export function buildMadeUpPractice(input: { childIds: string[]; topics: MapTopicRef[]; now: Date }): { sessions: SessionInsert[]; items: ItemInsert[] } {
  const sessions: SessionInsert[] = []
  const items: ItemInsert[] = []
  const n = input.childIds.length
  const day0 = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate())
  const used = new Set<string>()
  const practised = input.topics
    .flatMap((topic) => {
      const fixture = fixtureFor(topic.name)
      return fixture && !used.has(fixture.topic_name) && used.add(fixture.topic_name) ? [{ topic, fixture }] : []
    })
    .slice(0, MAX_PRACTICE_TOPICS)

  practised.forEach(({ topic, fixture }, t) => {
    const qs = fixture.content.questions
    if (qs.length < TRIES_PER_SESSION) return
    const blocks = Math.floor(qs.length / TRIES_PER_SESSION)
    input.childIds.forEach((childId, i) => {
      // One learner has not tried the topic (a different one for each topic), so "not tried" shows.
      if (n > 1 && i === (2 + t) % n) return
      const seed = `${childId}|${topic.id}`
      const tries = 1 + (hash(seed) % 3)
      const strength = STRENGTH[(i + 2 * t) % STRENGTH.length]!
      const first = 13 - (hash(`${seed}|first`) % 3)
      for (let k = 0; k < tries; k++) {
        const key = `${seed}|${k}`
        // Days ago, newest last: never fewer than three.
        const daysAgo = first - Math.round((k * (first - 3)) / tries)
        const at = day0 - daysAgo * 86_400_000 + (13 * 60 + (hash(`${key}|t`) % 150)) * 60_000
        const right = Math.max(0, Math.min(TRIES_PER_SESSION, Math.round(TRIES_PER_SESSION * (strength + 0.06 * k) + [-1, 0, 0, 1][hash(`${key}|n`) % 4]!)))
        const block = (i + k) % blocks
        const picked = qs.slice(block * TRIES_PER_SESSION, (block + 1) * TRIES_PER_SESSION)
        // The questions most learners miss come first in this order, so the same few are wrong again and again.
        const wrong = new Set(
          picked
            .map((q, p) => ({ p, rank: hash(q.prompt) }))
            .sort((a, b) => b.rank - a.rank || a.p - b.p)
            .slice(0, TRIES_PER_SESSION - right)
            .map((x) => x.p),
        )
        const id = idFrom(key)
        sessions.push({
          id,
          child_id: childId,
          status: 'done',
          planned_for: new Date(at).toISOString().slice(0, 10),
          topic_id: topic.id,
          topic_name: topic.name,
          format: fixture.format,
          planned_minutes: fixture.content.minutes ?? 10,
          minutes: 5 + (hash(`${key}|m`) % 8),
          question_count: TRIES_PER_SESSION,
          right,
          created_at: new Date(at - 12 * 60_000).toISOString(),
          finished_at: new Date(at).toISOString(),
        })
        picked.forEach((q, p) => {
          const missed = wrong.has(p)
          items.push({
            session_id: id,
            position: p,
            phase: 'try',
            question: q as unknown as NonNullable<Json>,
            difficulty: q.difficulty,
            answer: missed ? wrongAnswer(q, hash(`${key}|${q.prompt}`) % 4 === 0) : q.answer,
            correct: !missed,
            seconds: 20 + (hash(`${key}|${p}`) % 100),
          })
        })
      }
    })
  })
  return { sessions, items }
}

// ---- Writing it ------------------------------------------------------------------------------------------------------------------

/**
 * Writes the practice history of the made-up learners `childIds` of a class. Best effort: any error is swallowed and the learners stay as they are,
 * a half-written history is taken back out. Returns how many sessions were written.
 */
export async function addMadeUpPractice(admin: JemmaDb, input: { classId: string; childIds: string[]; now?: Date }): Promise<number> {
  try {
    const { data: map } = await admin.from('curriculum_maps').select('id').eq('class_id', input.classId).eq('status', 'approved').order('approved_at', { ascending: false }).limit(1).maybeSingle()
    if (!map) return 0
    const { data: topics } = await admin.from('topics').select('id, name').eq('map_id', map.id).order('term').order('position')
    const built = buildMadeUpPractice({ childIds: input.childIds, topics: topics ?? [], now: input.now ?? new Date() })
    if (built.sessions.length === 0) return 0
    const wrote = await admin.from('sessions').insert(built.sessions)
    if (wrote.error) return 0
    for (let i = 0; i < built.items.length; i += 500) {
      const part = await admin.from('session_items').insert(built.items.slice(i, i + 500))
      if (part.error) {
        await admin.from('sessions').delete().in('id', built.sessions.map((s) => s.id))
        return 0
      }
    }
    return built.sessions.length
  } catch {
    return 0
  }
}
