import { describe, expect, test } from 'vitest'
import { primaryAnswerBlock, type PrimaryKit } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { finishAnswer } from '../src/logic/meaning'
import { ANSWER_KINDS, LessonSchema, type Lesson, type Question } from '../src/schemas/lesson'
import { PRIMARY_EXTRA_ANSWER_KINDS, PrimaryExtraLessonSchema } from '../src/schemas/primary-extra'
import { answerProblem, badQuestions } from '../src/tools/save/save-lesson'

// P151: the keys the primary prompt tells the model to write are keys the save gate takes and the marking reads. The prompt lines name the kinds and show a key
// for each; these tests take each of those keys through the same gate and the same marking a lesson meets, so a line of the prompt cannot drift from the code
// that reads it. They need the kinds of P148 (time, unit) and P150 (list, order, table). No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
const base = { prompt: 'p', render: 'text' as const, difficulty: 1 as const, why: 'w', rightWay: 'r' }
const q = (over: Partial<Question>): Question => ({ ...base, answer: '1', answerKind: 'whole', ...over })

describe('the kinds the primary lessons may use are kinds every reader of a lesson has', () => {
  test('each extra kind is one of the wide schema, so a reply that uses it is read and saved', () => {
    for (const kind of PRIMARY_EXTRA_ANSWER_KINDS) expect(ANSWER_KINDS as readonly string[], kind).toContain(kind)
  })

  // P166: a kit whose topic has a picture also has a `diagram` line, (P167) the data kit a `graph` line, (P168) addition and subtraction a `columns` line and
  // (P169) place value a `blocks` line: each names a field of the question, not an answer kind.
  test('the lines of every kit only name kinds that exist', () => {
    const named = new Set<string>()
    for (const kit of ['time', 'measure', 'order', 'patterns', 'data', 'money', 'place', 'addsub', 'fractions', 'numbers', 'shapes', 'multiply'] as const)
      for (const grade of [1, 4]) for (const m of primaryAnswerBlock(kit, klass(grade)).matchAll(/^- `(\w+)`/gm)) named.add(m[1]!)
    for (const kind of named) expect([...ANSWER_KINDS, 'unit', 'diagram', 'graph', 'columns', 'blocks', 'groups', 'shade'] as string[], kind).toContain(kind)
  })
})

/** For each kit and grade band: a question as the prompt teaches it, and the key as the line shows it (the key must be in the line, so the two stay in step). */
type Example = { kit: PrimaryKit; grade: number; shows: string; question: Question; right: string[]; wrong: string[] }
const EXAMPLES: Example[] = [
  { kit: 'time', grade: 2, shows: '`3:30`', question: q({ answerKind: 'time', answer: '3:30' }), right: ['3:30', '3.30', '03:30'], wrong: ['3:03', '3:00', '4:30'] },
  { kit: 'time', grade: 2, shows: '`2 h`', question: q({ answerKind: 'time', answer: '2 h' }), right: ['2 h', '2h', '120 min'], wrong: ['3 h', '2 h 30 min'] },
  { kit: 'time', grade: 5, shows: '`3:15`', question: q({ answerKind: 'time', answer: '3:15' }), right: ['3:15'], wrong: ['3:45', '3:51', '15:15'] },
  { kit: 'time', grade: 5, shows: '`2 h 15 min`', question: q({ answerKind: 'time', answer: '2 h 15 min' }), right: ['2 h 15 min', '135 min', '2:15'], wrong: ['2 h 45 min', '2 h 51 min'] },
  { kit: 'time', grade: 5, shows: '`2:30 pm`', question: q({ answerKind: 'time', answer: '2:30 pm' }), right: ['2:30 pm', '14:30'], wrong: ['2:30', '2:30 am', '3:30 pm'] },
  { kit: 'measure', grade: 2, shows: '`12`', question: q({ answerKind: 'whole', answer: '12', unit: 'cm' }), right: ['12', '12 cm'], wrong: ['13', '12 m', '21'] },
  { kit: 'measure', grade: 5, shows: '`12`', question: q({ answerKind: 'decimal', answer: '1,5', unit: 'kg' }), right: ['1,5', '1.5', '1,5 kg'], wrong: ['1,6', '15', '1,5 g'] },
  { kit: 'patterns', grade: 2, shows: '`10; 12; 14`', question: q({ answerKind: 'list', answer: '10; 12; 14', ordered: true }), right: ['10; 12; 14'], wrong: ['12; 10; 14', '10; 12', '10; 12; 16'] },
  { kit: 'patterns', grade: 5, shows: '`19; 23; 27`', question: q({ answerKind: 'list', answer: '19; 23; 27', ordered: true }), right: ['19; 23; 27'], wrong: ['23; 19; 27', '19; 23'] },
  { kit: 'order', grade: 2, shows: '`9; 18; 45; 72`', question: q({ answerKind: 'order', answer: '9; 18; 45; 72' }), right: ['9; 18; 45; 72'], wrong: ['72; 45; 18; 9', '18; 9; 45; 72'] },
  { kit: 'order', grade: 5, shows: '`0,25; 0,5; 0,75`', question: q({ answerKind: 'order', answer: '0,25; 0,5; 0,75' }), right: ['0,25; 0,5; 0,75', '1/4; 1/2; 3/4'], wrong: ['0,5; 0,25; 0,75'] },
  { kit: 'data', grade: 2, shows: '`3; 5; 7`', question: q({ answerKind: 'list', answer: '3; 5; 7', ordered: false }), right: ['3; 5; 7', '7; 5; 3'], wrong: ['3; 5; 8', '3; 5'] },
  {
    kit: 'data',
    grade: 2,
    shows: '`null`',
    question: q({ answerKind: 'table', answer: '4; 7', table: { columns: ['Fruit', 'How many'], rows: [['Apples', '3'], ['Pears', null], ['Plums', null]] } }),
    right: ['4; 7'],
    wrong: ['7; 4', '4; 8', '4'],
  },
  { kit: 'money', grade: 3, shows: '`2,5; 5; 10`', question: q({ answerKind: 'order', answer: '2,5; 5; 10' }), right: ['2,5; 5; 10', '2.5; 5; 10'], wrong: ['5; 2,5; 10'] },
  { kit: 'money', grade: 3, shows: '`R12,50`', question: q({ answerKind: 'money', answer: 'R12,50' }), right: ['R12,50', 'R12.50', 'R12,5'], wrong: ['R12,05', 'R1,25', 'R13'] },
  { kit: 'place', grade: 3, shows: '`300; 40; 5`', question: q({ answerKind: 'list', answer: '300; 40; 5', ordered: true }), right: ['300; 40; 5'], wrong: ['5; 40; 300', '300; 4; 5'] },
  { kit: 'place', grade: 5, shows: '`1205; 1250; 2105`', question: q({ answerKind: 'order', answer: '1205; 1250; 2105' }), right: ['1205; 1250; 2105'], wrong: ['1250; 1205; 2105'] },
]

describe('a key the prompt shows is a key the save gate takes and the marking reads', () => {
  test.each(EXAMPLES.map((e) => [`${e.kit} grade ${e.grade}: ${e.question.answerKind} ${e.question.answer}`, e] as const))('%s', (_name, e) => {
    expect(primaryAnswerBlock(e.kit, klass(e.grade, 'ZA')), `the ${e.kit} lines for Grade ${e.grade} show ${e.shows}`).toContain(e.shows)
    expect(answerProblem(e.question)).toBeNull()
    for (const typed of e.right) expect(finishAnswer(e.question, typed).correct, `"${typed}" is right`).toBe(true)
    for (const typed of e.wrong) expect(finishAnswer(e.question, typed).correct, `"${typed}" is wrong`).toBe(false)
  })
})

describe('a key that cannot be marked is refused by the save gate, so a bad line of the model costs one question and not the lesson', () => {
  test.each([
    ['a time that is no time', q({ answerKind: 'time', answer: 'half past three' })],
    ['a time of 75 minutes past the hour', q({ answerKind: 'time', answer: '3:75' })],
    ['a list of one value', q({ answerKind: 'list', answer: '5', ordered: true })],
    ['a list that is words', q({ answerKind: 'list', answer: 'red; blue', ordered: false })],
    ['an order with one item', q({ answerKind: 'order', answer: '5' })],
    ['a table with no empty cell', q({ answerKind: 'table', answer: '1', table: { columns: ['a'], rows: [['1']] } })],
    ['a table with more empty cells than values', q({ answerKind: 'table', answer: '4', table: { columns: ['a', 'b'], rows: [['1', null], ['2', null]] } })],
    ['a unit that is far too long', q({ answerKind: 'whole', answer: '5', unit: 'a very long unit name' })],
  ])('%s', (_name, question) => {
    expect(answerProblem(question)).not.toBeNull()
  })
})

describe('a whole reply of a gated lesson', () => {
  const reply = (kind: (n: number) => Partial<Question>): Lesson => ({
    format: 'reading',
    title: 'Time',
    minutes: 12,
    cards: [{ heading: 'h', body: 'b' }],
    warmup: [],
    questions: ([1, 2, 3] as const).flatMap((difficulty) =>
      [0, 1, 2, 3, 4].map((i) => ({ ...base, prompt: `Q${difficulty}.${i}`, difficulty, answer: '3', answerKind: 'whole' as const, ...kind(i) })),
    ),
  })
  const mixed = reply((i) =>
    i === 0 ? { answerKind: 'time', answer: '3:30' }
    : i === 1 ? { answerKind: 'list', answer: '10; 12; 14', ordered: true }
    : i === 2 ? { answerKind: 'order', answer: '9; 18; 45' }
    : i === 3 ? { answerKind: 'table', answer: '4', table: { columns: ['a', 'b'], rows: [['x', '1'], ['y', null]] } }
    : { answerKind: 'whole', answer: '12', unit: 'cm' },
  )

  test('is asked for with the gated schema and read with the wide one, and its questions pass the save gate', () => {
    expect(PrimaryExtraLessonSchema.safeParse(mixed).success).toBe(true)
    expect(LessonSchema.safeParse(mixed).success).toBe(true)
    expect(badQuestions(mixed)).toEqual({ warmup: [], questions: [] })
  })

  test('a senior kind is refused by the schema the model is handed (a young learner has no expression box)', () => {
    expect(PrimaryExtraLessonSchema.safeParse(reply(() => ({ answerKind: 'expression', answer: '2x + 3' }))).success).toBe(false)
    expect(PrimaryExtraLessonSchema.safeParse(reply(() => ({ answerKind: 'equation', answer: 'x = 2' }))).success).toBe(false)
  })
})
