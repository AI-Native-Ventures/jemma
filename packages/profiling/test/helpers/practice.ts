import { MemoryStore } from '../../src/ai'
import type { Question } from '../../src/schemas'
import type { ToolContext } from '../../src/tools/context'
import { memoryDb, type MemoryDb } from './memory-db'

/**
 * One learner, one session with a written lesson, and one `practice.snapped` event whose photo is in storage, all in memory. For the tests of
 * the two tools and the job behind a practice answered on paper. No database, no network, no model.
 */

export const SCHOOL = '11111111-1111-4111-8111-111111111111'
export const OTHER_SCHOOL = '99999999-9999-4999-8999-999999999999'
export const CHILD = '33333333-3333-4333-8333-333333333333'
export const SESSION = '55555555-5555-4555-8555-555555555555'
export const LESSON = '77777777-7777-4777-8777-777777777777'
export const EVENT = '88888888-8888-4888-8888-888888888888'
export const NOW = new Date('2026-11-14T15:00:00.000Z')
export const PATH = `${SCHOOL}/${CHILD}/practice/${SESSION}-1763132400000.jpg`
/** The first bytes of a JPEG: enough to be a file in storage. */
export const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
export const PHOTO_BASE64 = Buffer.from(PHOTO).toString('base64')

type Level = 1 | 2 | 3
const q = (difficulty: Level, prompt: string, answer: string, over: Partial<Question> = {}): Question => ({
  prompt,
  render: 'text',
  answer,
  answerKind: 'fraction',
  difficulty,
  why: `why ${prompt}`,
  rightWay: `right way ${prompt}`,
  ...over,
})

/**
 * A lesson as `LessonSchema` wants it: 15 questions, 5 at each level, in this order. The five that go on paper (`paperQuestions`) are
 * 0, 1, 5, 6 and 10: a sum, a sum, a number missing from a fraction (key "9/15"), a choice (key "B") and a decimal.
 */
export const QUESTIONS: Question[] = [
  q(1, '1/2 + 1/4', '3/4'),
  q(1, '1/3 + 1/3', '2/3'),
  ...[2, 3, 4].map((i) => q(1, `1/${i + 2} + 1/${i + 2}`, `2/${i + 2}`)),
  q(2, 'Complete: 3/5 = ?/15', '9/15'),
  q(2, 'Which is bigger: 1/2 or 1/4?', 'B', { answerKind: 'choice', choices: ['1/4', '1/2', 'the same', 'none'] }),
  ...[7, 8, 9].map((i) => q(2, `2/${i} + 1/${i}`, `3/${i}`)),
  q(3, '0,5 + 0,25', '0,75', { answerKind: 'decimal' }),
  ...[11, 12, 13, 14].map((i) => q(3, `${i}/10 + 1/10`, `${i + 1}/10`)),
]
export const ON_PAPER = [0, 1, 5, 6, 10]

type Row = Record<string, unknown>

export function practiceWorld(over: Record<string, Row[]> = {}, files: Record<string, Record<string, Uint8Array>> = { papers: { [PATH]: PHOTO } }): MemoryDb {
  return memoryDb(
    {
      children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina', grade: 6 }],
      sessions: [{ id: SESSION, child_id: CHILD, status: 'in_progress', lesson_id: LESSON, topic_id: null, topic_name: 'Equivalent fractions', planned_for: '2026-11-14' }],
      lessons: [{ id: LESSON, child_id: CHILD, topic_name: 'Equivalent fractions', content: { questions: QUESTIONS } }],
      events: [{ id: EVENT, school_id: SCHOOL, type: 'practice.snapped', status: 'running', created_at: '2026-11-14T14:50:00.000Z', payload: { sessionId: SESSION, path: PATH, questions: ON_PAPER } }],
      session_items: [],
      enrolments: [],
      ...over,
    },
    files,
  )
}

export const ctxFor = (db: MemoryDb, over: Partial<ToolContext> = {}): ToolContext => ({
  db,
  schoolId: SCHOOL,
  eventId: EVENT,
  env: { replayStore: new MemoryStore() },
  now: () => NOW,
  ...over,
})

/** What a model read from a sheet that holds these answers, each sure of itself. */
export const readOf = (answers: [n: number, text: string, confidence?: number][], over: Record<string, unknown> = {}) => ({
  nameAsWritten: null,
  nameConfidence: 0,
  pageUsable: true,
  answers: answers.map(([n, answerAsRead, confidence = 0.95]) => ({ n, answerAsRead, confidence })),
  ...over,
})

/** The five right answers of `QUESTIONS` at `ON_PAPER`, as a learner writes them (the missing number alone, a letter for the choice). */
export const FIVE_RIGHT: [number, string][] = [[1, '3/4'], [2, '2/3'], [3, '9'], [4, 'B'], [5, '0,75']]
