import { capsMapOf, type CapsMap } from '../../../packages/profiling/src/curriculum/caps-map'
import { capsClassName } from '../../../packages/profiling/src/own-class-names'
import { LessonSchema, type Lesson, type Question } from '../../../packages/profiling/src/schemas'
import { INDEPENDENT_FAMILY } from './hillview'
import type { OwnMarkedTest, OwnPractice } from './own-workspace'

// The family whose child's school does not use Jemma (P99), in every Hillview demo copy: Zanele M and her son Kagiso, on his own, in Grade 8. Kagiso is ONE
// children row in a personal school (`schools.kind 'private'`, `private_of` null), with the Grade 8 CAPS class (approved map) and Grade 9 added, two finished
// practice sessions in Grade 8 (each with its lesson, its two warm-up answers and five Try answers) and one marked test already read. The rows are the same
// ones Amina's own workspace gets (`own-workspace.ts`: lessons, sessions, session items, the paper, its results, the gap and the line of the log), written
// for a child that has no school workspace. Zanele is linked from the start by an approved link, as the app writes it when a parent adds a child alone.
// Pure: no database, no clock but the `now` it is given. The seed writes the rows; nothing here touches Hillview.

/** The grades Kagiso's workspace starts with: his own grade and the next one. */
export const INDEPENDENT_GRADES = [INDEPENDENT_FAMILY.grade, INDEPENDENT_FAMILY.grade + 1] as const

const whole = (prompt: string, answer: number, difficulty: 1 | 2 | 3, why: string, rightWay: string): Question => ({
  prompt, render: 'text', answer: String(answer), answerKind: 'number', difficulty, why, rightWay,
})

/** `a op b` on whole numbers that may be negative, as a question with the way to do it. */
const sum = (prompt: string, answer: number, d: 1 | 2 | 3): Question =>
  whole(prompt, answer, d, 'the sign of a number was lost on the way.', `Take it one step at a time and watch the signs: ${prompt} = ${answer}.`)

const expr = (prompt: string, answer: string, d: 1 | 2 | 3, why: string): Question => ({
  prompt, render: 'text', answer, answerKind: 'expression', difficulty: d, why, rightWay: `Gather the like terms, and multiply every term inside a bracket: ${prompt.replace(/^(Simplify|Expand and simplify|Expand) /, '')} = ${answer}.`,
})

const INTEGER_POOL: Question[] = [
  sum('-3 + 8', 5, 1), sum('5 - 9', -4, 1), sum('-6 - 2', -8, 1), sum('7 + (-10)', -3, 1), sum('-4 + 4', 0, 1),
  sum('-12 + 7', -5, 2), sum('15 - 23', -8, 2), sum('-9 - (-4)', -5, 2), sum('-6 x 4', -24, 2), sum('-20 / 5', -4, 2),
  sum('-8 x (-7)', 56, 3), sum('-3 - (-12) + (-5)', 4, 3), sum('(-6)(4) + 10', -14, 3), sum('-48 / (-6)', 8, 3), sum('5 - (-3) x 4', 17, 3),
]
const INTEGER_WARMUP: Question[] = [sum('-2 + 9', 7, 1), sum('8 - 11', -3, 1)]

const ALGEBRA_WHY = 'a term inside a bracket was left out, or two unlike terms were joined.'
const ALGEBRA_POOL: Question[] = [
  expr('Simplify 3x + 5x', '8x', 1, ALGEBRA_WHY), expr('Simplify 7a - 2a', '5a', 1, ALGEBRA_WHY), expr('Simplify 4b + b', '5b', 1, ALGEBRA_WHY),
  expr('Simplify 6y - 6y + 2', '2', 1, ALGEBRA_WHY), expr('Simplify 2m + 3m + 4', '5m + 4', 1, ALGEBRA_WHY),
  expr('Simplify 3x + 4y + 2x - y', '5x + 3y', 2, ALGEBRA_WHY), expr('Expand 3(x + 4)', '3x + 12', 2, ALGEBRA_WHY), expr('Expand 2(3a - 5)', '6a - 10', 2, ALGEBRA_WHY),
  expr('Simplify 5p - 2q - 3p + 6q', '2p + 4q', 2, ALGEBRA_WHY), expr('Expand 4(2m + 1) - 3', '8m + 1', 2, ALGEBRA_WHY),
  expr('Expand and simplify 2(x + 3) + 3(x - 1)', '5x + 3', 3, ALGEBRA_WHY), expr('Expand and simplify 4(2a - 1) - 2(a + 5)', '6a - 14', 3, ALGEBRA_WHY),
  expr('Expand -3(x - 2)', '-3x + 6', 3, ALGEBRA_WHY), expr('Expand and simplify (x + 2)(x + 3)', 'x^2 + 5x + 6', 3, ALGEBRA_WHY),
  expr('Expand and simplify 5(y - 2) - (y - 4)', '4y - 6', 3, ALGEBRA_WHY),
]
const ALGEBRA_WARMUP: Question[] = [expr('Simplify 2x + x', '3x', 1, ALGEBRA_WHY), expr('Simplify 9a - 4a', '5a', 1, ALGEBRA_WHY)]

function integersLesson(): Lesson {
  return LessonSchema.parse({
    format: 'reading',
    title: 'Adding, taking away, times and divide with negative numbers',
    minutes: 10,
    cards: [
      { heading: 'Watch the sign', body: 'A minus in front of a number says it is below zero. Taking away a negative number is the same as adding.' },
      { heading: 'Times and divide', body: 'Two numbers with the same sign give a positive answer. Two numbers with different signs give a negative answer.' },
      { heading: 'Check on a number line', body: 'Draw a number line and walk the sum. If your answer is on the wrong side of zero, look at the signs again.' },
    ],
    warmup: INTEGER_WARMUP,
    questions: INTEGER_POOL,
  })
}

function algebraLesson(): Lesson {
  return LessonSchema.parse({
    format: 'reading',
    title: 'Gathering like terms and expanding brackets',
    minutes: 9,
    cards: [
      { heading: 'Like terms', body: 'Only terms with the same letter can be joined. 3x and 5x make 8x. 3x and 5y stay apart.' },
      { heading: 'Brackets', body: 'Multiply every term inside the bracket by the number outside it. 3(x + 4) is 3x + 12.' },
      { heading: 'A minus in front', body: 'A minus in front of a bracket changes the sign of every term inside it.' },
    ],
    warmup: ALGEBRA_WARMUP,
    questions: ALGEBRA_POOL,
  })
}

/** The wrong answer a learner might write for an integer question: the sign is lost. */
const slipSign = (q: Question): string => (Number(q.answer) === 0 ? '1' : String(-Number(q.answer)))

/** Two finished practice sessions in Grade 8: integers, and gathering like terms. Each has 5 Try answers, three right and two wrong, from its own lesson. */
export function independentPractice(): OwnPractice[] {
  const integers = integersLesson()
  const algebra = algebraLesson()
  const integersPicks: { q: Question; correct: boolean; seconds: number; adapted: 'easier' | 'harder' | null }[] = [
    { q: integers.questions[5]!, correct: true, seconds: 55, adapted: null },
    { q: integers.questions[6]!, correct: true, seconds: 70, adapted: null },
    { q: integers.questions[10]!, correct: false, seconds: 130, adapted: 'harder' },
    { q: integers.questions[0]!, correct: true, seconds: 35, adapted: 'easier' },
    { q: integers.questions[8]!, correct: false, seconds: 100, adapted: null },
  ]
  const algebraPicks: { q: Question; answer: string; correct: boolean; seconds: number; adapted: 'easier' | 'harder' | null }[] = [
    { q: algebra.questions[5]!, answer: algebra.questions[5]!.answer, correct: true, seconds: 80, adapted: null },
    { q: algebra.questions[6]!, answer: algebra.questions[6]!.answer, correct: true, seconds: 60, adapted: null },
    { q: algebra.questions[11]!, answer: '6a - 6', correct: false, seconds: 150, adapted: 'harder' },
    { q: algebra.questions[1]!, answer: algebra.questions[1]!.answer, correct: true, seconds: 45, adapted: 'easier' },
    { q: algebra.questions[13]!, answer: 'x^2 + 6', correct: false, seconds: 120, adapted: null },
  ]
  return [
    {
      topicName: 'Integers',
      family: 'integers_and_exponents',
      lesson: integers,
      format: integers.format,
      plannedMinutes: integers.minutes,
      minutes: 9,
      finishedDaysAgo: 2,
      warmup: integers.warmup.map((q, i) => ({ q, answer: q.answer, correct: true, seconds: 20 + i * 10 })),
      tries: integersPicks.map((p) => ({ q: p.q, answer: p.correct ? p.q.answer : slipSign(p.q), correct: p.correct, seconds: p.seconds, difficulty: p.q.difficulty, adapted: p.adapted })),
    },
    {
      topicName: 'Algebraic expressions',
      family: 'algebra',
      lesson: algebra,
      format: algebra.format,
      plannedMinutes: algebra.minutes,
      minutes: 8,
      finishedDaysAgo: 1,
      warmup: algebra.warmup.map((q, i) => ({ q, answer: q.answer, correct: true, seconds: 25 + i * 10 })),
      tries: algebraPicks.map((p) => ({ q: p.q, answer: p.answer, correct: p.correct, seconds: p.seconds, difficulty: p.q.difficulty, adapted: p.adapted })),
    },
  ]
}

/** The CAPS map of each of Kagiso's grades, as a parent gets it by adding the child (Grade 8) and the child by adding a grade (Grade 9). */
export function independentMaps(): CapsMap[] {
  return INDEPENDENT_GRADES.map((grade) => {
    const map = capsMapOf(grade)
    if (!map) throw new Error(`demo seed: no CAPS map for Grade ${grade}`)
    return map
  })
}

/**
 * One test Kagiso got back marked, already read: 8 questions on two topics of the Grade 8 map, 6 ticks and 2 crosses, the two crosses on the same equations
 * topic. The topics are not the two the practices above count (Integers, Algebraic expressions), so those counts stay as they are.
 */
const EQUATIONS = 'Algebraic equations'
const EXPONENTS = 'Exponents'

export function independentMarkedTest(): OwnMarkedTest {
  const q = (n: number, words: string, answer: string, correct: boolean, topicName: string, confidence: number) => ({ prompt: `${n}. ${words}`, answer, correct, topicName, confidence })
  return {
    gapTopicName: EQUATIONS,
    results: [
      q(1, 'Solve 2x + 3 = 11', 'x = 4', true, EQUATIONS, 0.95),
      q(2, 'Solve 5x = 35', 'x = 7', true, EQUATIONS, 0.93),
      q(3, 'Solve 3x - 5 = 10', 'x = 5/3', false, EQUATIONS, 0.9),
      q(4, 'Solve 4x + 6 = 2', 'x = 2', false, EQUATIONS, 0.88),
      q(5, 'Write 2^3 x 2^2 as one power', '2^5', true, EXPONENTS, 0.94),
      q(6, 'Calculate 3^4', '81', true, EXPONENTS, 0.95),
      q(7, 'Simplify (x^2)^3', 'x^6', true, EXPONENTS, 0.91),
      q(8, 'Calculate 5^0', '1', true, EXPONENTS, 0.92),
    ],
  }
}

// ---- The rows ---------------------------------------------------------------------------------

/** The personal school: tied to the sandbox like every school made inside it, so the clean-up takes it. As the app writes it: no region and no grades. */
export const independentSchoolRow = (country: string, sandboxId: string) => ({
  name: `${INDEPENDENT_FAMILY.child}'s own`, country, region: null, grades: null, kind: 'private' as const, sandbox_id: sandboxId,
})

/** Kagiso: one row, his own record. No login yet (his mum makes the sign-in code), no school child behind him, and his mum's name for the hand-back screen. */
export const independentChildRow = (input: { schoolId: string; parent: { firstName: string; relation: string } }) => ({
  school_id: input.schoolId, first_name: INDEPENDENT_FAMILY.child, last_name: null, grade: INDEPENDENT_FAMILY.grade, user_id: null, private_of: null,
  parent_first_name: input.parent.firstName, parent_relation: input.parent.relation,
})

/** One private Mathematics CAPS class for each of his grades (named by the one rule, `capsClassName`), owned by his mum (the person who added him). */
export const independentClassRows = (input: { schoolId: string; parentId: string; year: number; code: () => string }) =>
  INDEPENDENT_GRADES.map((grade) => ({
    school_id: input.schoolId, teacher_id: input.parentId, name: capsClassName(grade), grade, year: input.year, subject: 'Mathematics', join_code: input.code(),
  }))

/** Zanele's approved link, as the app writes it when a parent adds a child alone: her own consent is the act of adding him, and the class is his Grade 8 class. */
export const independentLinkRow = (input: { parentId: string; childId: string; classId: string; at: string }) => ({
  parent_id: input.parentId, child_id: input.childId, class_id: input.classId, status: 'approved' as const,
  consent: { guardian: true, teach: true, improve: false }, decided_at: input.at,
})
