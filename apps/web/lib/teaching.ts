// The teaching library as the learner's side holds it (P144). Pure: no database, no clock, no router, so it is tested without any of them.
//
// A lesson is stored whole, answers and all (`TeachingLesson`). The browser never gets the answers of the questions the learner is asked: `forChild` takes
// them out before a lesson leaves the server, and the answer is marked on the server (`markLessonQuestion`) when the learner sends it. The worked examples
// are shown, never typed, so they go as they are.

import { finishAnswer } from '@jemma/profiling/logic'
import { libraryKey, type Question, type TeachingBlock, type TeachingLesson } from '@jemma/profiling/schemas'
import { answerText, stripQuestion, type QuestionForChild } from '@/app/k/session/[sessionId]/logic'

/** One lesson of a topic in the lesson list: what the learner sees before opening it. `done` and `started` are for the signed-in learner. */
export type LibraryEntry = { id: string; position: number; title: string; minutes: number; done: boolean; started: boolean }

/** A stored lesson row as the list needs it. A topic has one row for each lesson and each version of it. */
export type LessonRow = { id: string; position: number; version: number; title: string; minutes: number }

/** The learner's progress row of a lesson. */
export type ProgressRow = { topic_lesson_id: string; started_at: string; finished_at: string | null }

/**
 * A question as the browser may hold it before the learner answers: the words, the kind of answer, the choices (text, or a picture: P149), whether a reason also
 * asks for a value, and the picture. Never the answer. It is what `stripQuestion` hands a session question, without where it stands in a run.
 */
export type StrippedQuestion = Omit<QuestionForChild, 'position' | 'phase' | 'index' | 'of'>

/** A block as the browser holds it: a `try` block has a stripped question. Every other kind is as it was stored. */
export type BlockForChild = Exclude<TeachingBlock, { kind: 'try' }> | { kind: 'try'; question: StrippedQuestion; hint: string; speech: string }

/** The lesson as the learner's screen may hold it: no answer, no steps, no why and no right way of any question the learner is asked. */
export type TeachingLessonForChild = Omit<TeachingLesson, 'blocks' | 'practice'> & { blocks: BlockForChild[]; practice: StrippedQuestion[] }

/** The question without its answer. The same fields `stripQuestion` hands a session question, without where it stands in a run. */
export function stripLessonQuestion(q: Question): StrippedQuestion {
  const { position: _p, phase: _ph, index: _i, of: _o, ...rest } = stripQuestion(q, { position: 0, phase: 'try', index: 0, of: 0 })
  return rest
}

/** A stripped question as the question screen of a practice takes it: numbered, inside a run of `of` questions (index is 1-based). */
export const forScreen = (q: StrippedQuestion, index: number, of: number): QuestionForChild => ({ ...q, position: index, phase: 'try', index, of })

/** The lesson as the browser may hold it. The blocks keep their places, so an answer is sent as "block 6", and the server finds the question. */
export function forChild(lesson: TeachingLesson): TeachingLessonForChild {
  return {
    ...lesson,
    blocks: lesson.blocks.map((b): BlockForChild => (b.kind === 'try' ? { ...b, question: stripLessonQuestion(b.question) } : b)),
    practice: lesson.practice.map(stripLessonQuestion),
  }
}

/** Which question an answer is for: the question of a try block (by the place of the block), or a practice question (by its number from 0). */
export type LessonWhere = { kind: 'try'; block: number } | { kind: 'practice'; index: number }

/** The stored question an answer is for, or null when there is none there (a block that is not a try block, a number out of range). */
export function questionAt(lesson: TeachingLesson, where: LessonWhere): Question | null {
  if (where.kind === 'try') {
    const block = Number.isInteger(where.block) ? lesson.blocks[where.block] : undefined
    return block?.kind === 'try' ? block.question : null
  }
  return Number.isInteger(where.index) ? (lesson.practice[where.index] ?? null) : null
}

/** What the learner is told once an answer is in: whether it was right, the right answer, the steps and the right way. Only sent after the answer. */
export type LessonAnswerResult = { correct: boolean; answer: string; steps?: string[]; rightWay: string; why: string }

/** The worked steps a question carries, only the lines that are words (the field is optional and a lesson may hold anything). */
function stepsOf(q: Question): string[] {
  const raw = (q as { steps?: unknown }).steps
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
}

/** Marks one answer the way a practice session does (`finishAnswer`: the four typed kinds by meaning, every other kind as it always was). */
export function markLessonQuestion(q: Question, typed: string): LessonAnswerResult {
  const { correct } = finishAnswer(q, typed)
  const steps = stepsOf(q)
  return { correct, answer: answerText(q, q.answer), ...(steps.length > 0 ? { steps } : {}), rightWay: q.rightWay, why: q.why }
}

/** True when a topic row's name finds lessons: the name without " (Term N)" is a name the library holds. */
export const inLibrary = (names: ReadonlySet<string>, topicName: string): boolean => names.has(libraryKey(topicName))

/**
 * The rows that are the lessons of a topic: the newest version of each lesson, in teaching order. A topic whose first lesson is not ready has no
 * library at all (it keeps today's flow); one whose later lesson is missing keeps the lessons that passed.
 */
export function readyLessons<T extends { position: number; version: number }>(rows: T[]): T[] {
  const newest = new Map<number, T>()
  for (const r of rows) {
    const have = newest.get(r.position)
    if (!have || r.version > have.version) newest.set(r.position, r)
  }
  if (!newest.has(1)) return []
  return [...newest.values()].sort((a, b) => a.position - b.position)
}

/** The lesson list of one learner: the ready lessons with a tick for each one finished and a mark on one begun. */
export function buildEntries(rows: LessonRow[], progress: ProgressRow[]): LibraryEntry[] {
  const byLesson = new Map(progress.map((p) => [p.topic_lesson_id, p]))
  return readyLessons(rows).map((r) => {
    const p = byLesson.get(r.id)
    return { id: r.id, position: r.position, title: r.title, minutes: r.minutes, done: !!p?.finished_at, started: !!p }
  })
}

/** The lesson of the list to open next: the first not finished, else the first (a learner who finished them all starts again). Null for an empty list. */
export function nextEntry(entries: LibraryEntry[]): LibraryEntry | null {
  return entries.find((e) => !e.done) ?? entries[0] ?? null
}

/** The address a credit line links to: a full web address as it is, a Siyavula reader path ("/read/za/...") on their site, anything else no link. */
export function sourceHref(address: string | undefined): string | null {
  if (!address) return null
  if (/^https?:\/\//i.test(address)) return address
  if (address.startsWith('/read/')) return `https://www.siyavula.com${address}`
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** True for an id the way the database writes one. An address that holds anything else is not looked up. */
export const isUuid = (value: string | undefined | null): value is string => typeof value === 'string' && UUID.test(value)

/** What the button that opens a lesson of the list says: start it, go on with it, or read it again when it is done. */
export const entryButton = (e: LibraryEntry): string => (e.done ? `Read lesson ${e.position} again` : e.started ? `Continue lesson ${e.position}` : `Start lesson ${e.position}`)
