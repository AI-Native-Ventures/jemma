import { capsMapOf, type CapsMap } from '../../../packages/profiling/src/curriculum/caps-map'
import type { Json } from '../../../packages/profiling/src/db'
import { LessonSchema, type Lesson, type Question } from '../../../packages/profiling/src/schemas'
import { AMINA_LESSON, SESSION_DONE, SESSION_TRY, SESSION_WARMUP } from './marked-state'

// What Amina's own workspace ("My own") has in every Hillview demo copy, so a visitor who walks through as a learner sees real counts at once:
// a personal school, Amina's private twin, a class for Grade 6 and one for Grade 7 (each with the approved CAPS map of that grade, the same rows
// a learner gets when they add the grade), and two finished practice sessions in Grade 6, one on a fractions topic and one on a whole numbers
// topic, each with its lesson, its two warm-up answers and five Try answers (some right, some wrong). Pure: no database, no clock but the `now`
// it is given. The seed writes the rows; nothing here touches the school child, its class or its school.

const DAY = 24 * 60 * 60_000
const json = (v: unknown) => v as NonNullable<Json>

/** The grades Amina's own workspace starts with: her own grade and the next one. */
export const OWN_PRELOADED_GRADES = [6, 7] as const

export type OwnPractice = {
  /** The topic of the Grade 6 CAPS map the session is on (its exact name). */
  topicName: string
  family: 'fractions' | 'whole_numbers'
  lesson: Lesson
  format: Lesson['format']
  plannedMinutes: number
  minutes: number
  /** How many days before the copy was made the session was finished. */
  finishedDaysAgo: number
  warmup: { q: Question; answer: string; correct: boolean; seconds: number }[]
  tries: { q: Question; answer: string; correct: boolean; seconds: number; difficulty: 1 | 2 | 3; adapted: 'easier' | 'harder' | null }[]
}

const whole = (prompt: string, answer: number, difficulty: 1 | 2 | 3, why: string, rightWay: string): Question => ({
  prompt, render: 'text', answer: String(answer), answerKind: 'whole', difficulty, why, rightWay,
})

/** `a + b` or `a - b` on whole numbers, as a question with the way to do it. */
const sum = (a: number, b: number, d: 1 | 2 | 3): Question =>
  whole(`${a} + ${b}`, a + b, d, 'a place value was added in the wrong column.', `Line the numbers up by place value, ones under ones. Add from the right: ${a} + ${b} = ${a + b}.`)
const take = (a: number, b: number, d: 1 | 2 | 3): Question =>
  whole(`${a} - ${b}`, a - b, d, 'a number was taken away from the wrong place.', `Line the numbers up by place value. Subtract from the right, borrowing when you need to: ${a} - ${b} = ${a - b}.`)

const POOL: Question[] = [
  ...[[12, 35], [48, 21], [63, 14], [27, 52], [34, 45]].map(([a, b]) => sum(a!, b!, 1)),
  ...[[245, 318], [502, 267], [418, 356], [623, 189], [374, 458]].map(([a, b]) => sum(a!, b!, 2)),
  ...[[83210, 45678], [64002, 28915], [90500, 37246], [75331, 48609], [52184, 19876]].map(([a, b]) => take(a!, b!, 3)),
]

const WHOLE_WARMUP: Question[] = [sum(20, 15, 1), take(50, 18, 1)]

/** Whole numbers, addition and subtraction: a reading lesson with 15 questions, 5 at each level, and two warm-up questions. */
function wholeNumbersLesson(): Lesson {
  return LessonSchema.parse({
    format: 'reading',
    title: 'Adding and taking away big numbers',
    minutes: 10,
    cards: [
      { heading: 'Line them up', body: 'Write the numbers one under the other. Ones go under ones, tens under tens, and so on.' },
      { heading: 'Start on the right', body: 'Add or take away the ones first, then the tens, then the hundreds. When a column is too big, carry. When it is too small, borrow.' },
      { heading: 'Check it makes sense', body: 'Round the numbers and do a quick sum in your head. Your answer should be close to it.' },
    ],
    warmup: WHOLE_WARMUP,
    questions: POOL,
  })
}

/** The wrong answer a learner might write for a whole number question: out by one place value. */
const slip = (q: Question): string => String(Number(q.answer) + (q.difficulty === 3 ? 1000 : 10))

/** Two finished practice sessions in Grade 6. The fractions one is the lesson and the five Try answers of the demo's own finished session. */
export function ownPractice(): OwnPractice[] {
  const lesson = LessonSchema.parse(AMINA_LESSON)
  const fractions: OwnPractice = {
    topicName: 'Common fractions',
    family: 'fractions',
    lesson,
    format: lesson.format,
    plannedMinutes: lesson.minutes,
    minutes: SESSION_DONE.minutes,
    finishedDaysAgo: 2,
    warmup: SESSION_WARMUP.map((w) => ({ ...w })),
    tries: SESSION_TRY.map((t) => ({ q: t.q, answer: t.answer, correct: t.correct, seconds: t.seconds, difficulty: t.difficulty as 1 | 2 | 3, adapted: t.adapted })),
  }
  const numbers = wholeNumbersLesson()
  // Five Try answers: the next level up after a right answer, one down after a wrong one. Three right, two wrong.
  const picks: { q: Question; correct: boolean; seconds: number; adapted: 'easier' | 'harder' | null }[] = [
    { q: numbers.questions[5]!, correct: true, seconds: 70, adapted: null },
    { q: numbers.questions[6]!, correct: true, seconds: 85, adapted: null },
    { q: numbers.questions[10]!, correct: false, seconds: 140, adapted: 'harder' },
    { q: numbers.questions[0]!, correct: true, seconds: 40, adapted: 'easier' },
    { q: numbers.questions[7]!, correct: false, seconds: 110, adapted: null },
  ]
  const wholeNumbers: OwnPractice = {
    topicName: 'Whole numbers: addition and subtraction (5-digit numbers)',
    family: 'whole_numbers',
    lesson: numbers,
    format: numbers.format,
    plannedMinutes: numbers.minutes,
    minutes: 9,
    finishedDaysAgo: 1,
    warmup: numbers.warmup.map((q, i) => ({ q, answer: q.answer, correct: true, seconds: 25 + i * 10 })),
    tries: picks.map((p) => ({ q: p.q, answer: p.correct ? p.q.answer : slip(p.q), correct: p.correct, seconds: p.seconds, difficulty: p.q.difficulty, adapted: p.adapted })),
  }
  return [fractions, wholeNumbers]
}

/** The CAPS map of each preloaded grade, as a learner gets it by adding the grade. */
export function ownMaps(): CapsMap[] {
  return OWN_PRELOADED_GRADES.map((grade) => {
    const map = capsMapOf(grade)
    if (!map) throw new Error(`demo seed: no CAPS map for Grade ${grade}`)
    return map
  })
}

// ---- The rows ---------------------------------------------------------------------------------

/** The personal school: tied to the sandbox like every school made inside it, so the clean-up takes it. */
export const ownSchoolRow = (home: { country: string; region: string | null; grades: string | null }, sandboxId: string) => ({
  name: "Amina's own", country: home.country, region: home.region, grades: home.grades, kind: 'private' as const, sandbox_id: sandboxId,
})

/** Amina's twin: her name, her grade, her login and her mum's name, in the personal school. */
export const ownTwinRow = (input: { schoolId: string; aminaId: string; learnerId: string; grade: number; parent: { firstName: string; relation: string } }) => ({
  school_id: input.schoolId, first_name: 'Amina', last_name: null, grade: input.grade, user_id: input.learnerId, private_of: input.aminaId,
  parent_first_name: input.parent.firstName, parent_relation: input.parent.relation,
})

/** One private Mathematics class for each preloaded grade, owned by Amina's login (the learner owns the workspace). */
export const ownClassRows = (input: { schoolId: string; learnerId: string; year: number; code: () => string }) =>
  OWN_PRELOADED_GRADES.map((grade) => ({
    school_id: input.schoolId, teacher_id: input.learnerId, name: `Grade ${grade} (my own)`, grade, year: input.year, subject: 'Mathematics', join_code: input.code(),
  }))

export const ownLessonRow = (p: OwnPractice, ids: { childId: string; topicId: string }) => ({
  child_id: ids.childId, topic_id: ids.topicId, topic_name: p.topicName, format: p.format, content: json(p.lesson),
})

export const ownSessionRow = (p: OwnPractice, ids: { childId: string; lessonId: string; topicId: string }, now: Date) => {
  const finished = new Date(now.getTime() - p.finishedDaysAgo * DAY)
  return {
    child_id: ids.childId, lesson_id: ids.lessonId, status: 'done' as const, planned_for: finished.toISOString().slice(0, 10), warmup: json(p.lesson.warmup),
    right: p.tries.filter((t) => t.correct).length, minutes: p.minutes, finished_at: finished.toISOString(), created_at: new Date(finished.getTime() - 30 * 60_000).toISOString(),
    topic_id: ids.topicId, topic_name: p.topicName, format: p.format, planned_minutes: p.plannedMinutes, question_count: p.tries.length,
  }
}

export const ownItemRows = (p: OwnPractice, sessionId: string) => [
  ...p.warmup.map((w, i) => ({
    session_id: sessionId, position: i + 1, phase: 'warmup' as const, question: json(w.q), difficulty: w.q.difficulty, answer: w.answer, correct: w.correct, seconds: w.seconds, adapted: null,
  })),
  ...p.tries.map((t, i) => ({
    session_id: sessionId, position: i + 1, phase: 'try' as const, question: json(t.q), difficulty: t.difficulty, answer: t.answer, correct: t.correct, seconds: t.seconds, adapted: t.adapted,
  })),
]

// ---- The marked test ----------------------------------------------------------------------------

/**
 * One test Amina got back marked, already read (P97): 8 questions on two topics of the Grade 6 map, 6 ticks and 2 crosses, the two crosses on the
 * same fractions topic. The topics are not the two the practices above count (3 of 5 in "Common fractions" and in the whole numbers topic), so
 * those counts stay as they are. The answers that are wrong are the kind a learner writes (the tops added, the bottoms added).
 */
export type OwnMarkedResult = { prompt: string; answer: string; correct: boolean; topicName: string; confidence: number }
export type OwnMarkedTest = { results: OwnMarkedResult[]; /** The topic of the two wrong answers: the topic of the one open gap. */ gapTopicName: string }

const FRACTIONS = 'Common fractions (Term 4)'
const DECIMALS = 'Decimal fractions'

export function ownMarkedTest(): OwnMarkedTest {
  const q = (n: number, words: string, answer: string, correct: boolean, topicName: string, confidence: number): OwnMarkedResult => ({ prompt: `${n}. ${words}`, answer, correct, topicName, confidence })
  return {
    gapTopicName: FRACTIONS,
    results: [
      q(1, 'Simplify 6/8', '3/4', true, FRACTIONS, 0.95),
      q(2, 'Write 2/3 with 9 as the bottom number', '6/9', true, FRACTIONS, 0.92),
      q(3, 'Add 1/2 and 1/3', '2/5', false, FRACTIONS, 0.9),
      q(4, 'Add 3/4 and 1/8', '4/12', false, FRACTIONS, 0.88),
      q(5, 'Write 3/10 as a decimal', '0,3', true, DECIMALS, 0.94),
      q(6, 'Write 0,25 as a fraction', '1/4', true, DECIMALS, 0.93),
      q(7, 'Which is bigger, 0,4 or 0,35?', '0,4', true, DECIMALS, 0.9),
      q(8, 'Round 3,68 to one decimal place', '3,7', true, DECIMALS, 0.91),
    ],
  }
}

/** The paper: the twin's own, no test, marked, the ticks as its total (the whole numbers `papers.total` holds), read 3 days before the copy was made. */
export const ownPaperRow = (childId: string, now: Date) => ({
  test_id: null,
  child_id: childId,
  owner: 'parent' as const,
  kind: 'test' as const,
  status: 'marked' as const,
  name_read: null,
  total: ownMarkedTest().results.filter((r) => r.correct).length,
  error: null,
  created_at: new Date(now.getTime() - 3 * DAY).toISOString(),
})

/** One `question_results` row for each question, numbered 1 to 8 in the order read: a tick is mark 1, a cross mark 0. The topic id comes from the Grade 6 map. */
export const ownResultRows = (test: OwnMarkedTest, ids: { paperId: string; childId: string; topicIdOf: (topicName: string) => string }) =>
  test.results.map((r, i) => ({
    paper_id: ids.paperId,
    child_id: ids.childId,
    n: i + 1,
    prompt: r.prompt,
    answer_read: r.answer,
    read_confidence: r.confidence,
    correct: r.correct,
    mark: r.correct ? 1 : 0,
    crop: null,
    topic_id: ids.topicIdOf(r.topicName),
    topic_name: r.topicName,
    misconception: null,
  }))

/** The one open private gap: the topic of the wrong answers, with those answers as its evidence. */
export const ownGapRow = (input: { childId: string; topicId: string; topicName: string; wrongResultIds: string[] }) => ({
  child_id: input.childId,
  topic_id: input.topicId,
  topic_name: input.topicName,
  stage: 'new' as const,
  evidence: input.wrongResultIds,
})

/** The line of "What Jemma did" the reader writes for this test (none left out), so the copy reads the same as one the reader made. */
export const ownTestLogRow = (input: { schoolId: string; childId: string; at: string }) => {
  const results = ownMarkedTest().results
  return {
    school_id: input.schoolId,
    child_id: input.childId,
    class_id: null,
    at: input.at,
    text: `Read your marked test: ${results.filter((r) => r.correct).length} of ${results.length} right`,
    tool: 'save_own_test_results',
  }
}
