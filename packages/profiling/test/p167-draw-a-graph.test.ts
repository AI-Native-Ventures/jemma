import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { primaryAnswerBlock, withPrimaryAnswers } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { blankBars, blankLabels, graphAnswer, graphKeyProblem, graphProblem, graphValues, snapGraphValue, tidyGraph } from '../src/logic/answers/graph'
import { finishAnswer, readNumber } from '../src/logic/meaning'
import { LessonSchema, PrimaryLessonSchema, SeniorLessonSchema, type DataGraphSpec, type Question } from '../src/schemas/lesson'
import { PrimaryExtraLessonSchema, PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem, badQuestions } from '../src/tools/save/save-lesson'
import { askedFor, CHILD_INFO } from './helpers/write-lesson-world'

// P167: a graph the learner draws (the "Draw a graph of data" board): a bar graph whose empty bars the learner drags up, or a picture graph whose empty rows
// they fill with pictures. The empty bars are the answer, marked as a whole number (one bar) or an ordered list (more). Asked of a Grade 1 to 6 data topic only.
// No database, no network, no live model.

const state = vi.hoisted(() => ({ topic: 'Data handling' }))
vi.mock('../src/tools/read/get-child-context', () => ({
  getChildContext: { run: vi.fn(async () => ({ ...CHILD_INFO, session: { ...CHILD_INFO.session, topicName: state.topic } })) },
}))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const pets: DataGraphSpec = {
  kind: 'bars',
  counts: 'children',
  bars: [{ label: 'Cats', value: 4 }, { label: 'Dogs', value: null }, { label: 'Fish', value: 2 }, { label: 'Birds', value: 5 }],
  yMax: 8,
}
const cars: DataGraphSpec = {
  kind: 'bars',
  counts: 'cars',
  bars: [{ label: 'Mon', value: null }, { label: 'Tue', value: null }, { label: 'Wed', value: 15 }],
  yMax: 20,
  step: 5,
}
const fruit: DataGraphSpec = {
  kind: 'pictures',
  counts: 'children',
  bars: [{ label: 'Apples', value: null }, { label: 'Bananas', value: 6 }, { label: 'Oranges', value: 10 }],
  per: 2,
}

const question = (over: Partial<Question> = {}): Question => ({
  prompt: "Lindiwe's class voted for their best pet. 6 children chose a dog. Draw the bar for Dogs.",
  render: 'text',
  answer: '6',
  answerKind: 'whole',
  graph: pets,
  difficulty: 1,
  why: 'Each line on the scale is 1 child.',
  rightWay: 'Find 6 on the scale, then drag the bar up to it.',
  ...over,
})

describe('the schemas', () => {
  test('a Grade 1 to 6 data question may carry a graph to draw, and the wide schema reads it', () => {
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
    const lesson = {
      format: 'reading',
      title: 'Graphs',
      minutes: 12,
      cards: [{ heading: 'h', body: 'b' }],
      warmup: [],
      questions: ([1, 2, 3] as const).flatMap((difficulty) => [0, 1, 2, 3, 4].map((i) => question({ prompt: `Q${difficulty}.${i}`, difficulty }))),
    }
    expect(PrimaryExtraLessonSchema.safeParse(lesson).success).toBe(true)
    const read = LessonSchema.safeParse(lesson)
    expect(read.success && read.data.questions[0]!.graph).toEqual(pets)
    expect(read.success && badQuestions(read.data)).toEqual({ warmup: [], questions: [] })
  })

  test('the demo schema and the senior schema have no graph', () => {
    for (const schema of [PrimaryLessonSchema, SeniorLessonSchema]) expect(JSON.stringify(z.toJSONSchema(schema))).not.toContain('"pictures"')
    expect(JSON.stringify(z.toJSONSchema(PrimaryExtraLessonSchema))).toContain('"pictures"')
  })
})

describe('a graph that can be drawn', () => {
  test.each([['a bar graph', pets], ['a bar graph with a step of 5', cars], ['a picture graph', fruit]] as const)('%s is fine', (_name, g) => {
    expect(graphProblem(g)).toBeNull()
  })

  test.each([
    ['one bar', { ...pets, bars: [{ label: 'Dogs', value: null }] }, '2 to 8 bars'],
    ['nine bars', { ...pets, bars: Array.from({ length: 9 }, (_, i) => ({ label: `B${i}`, value: i === 0 ? null : 1 })) }, '2 to 8 bars'],
    ['a bar with no name', { ...pets, bars: [{ label: ' ', value: null }, { label: 'Cats', value: 2 }] }, 'a name'],
    ['a long name', { ...pets, bars: [{ label: 'The children in Grade 4', value: null }, { label: 'Cats', value: 2 }] }, 'a name'],
    ['nothing to draw', { ...pets, bars: [{ label: 'Cats', value: 4 }, { label: 'Dogs', value: 6 }] }, 'at least one bar'],
    ['no top to the scale', { ...pets, yMax: undefined }, 'yMax'],
    ['a top that is not a line', { ...cars, yMax: 22 }, 'whole number of steps'],
    ['too many lines', { ...pets, yMax: 30 }, 'at most 20 lines'],
    ['a step of a half', { ...pets, step: 0.5 }, 'step is a whole number'],
    ['a given bar between two lines', { ...cars, bars: [{ label: 'Mon', value: null }, { label: 'Tue', value: 7 }] }, 'on a line'],
    ['a given bar over the top', { ...pets, bars: [{ label: 'Cats', value: 9 }, { label: 'Dogs', value: null }] }, 'on a line'],
    ['a row of half a picture', { ...fruit, bars: [{ label: 'Apples', value: null }, { label: 'Pears', value: 3 }] }, 'whole number of pictures'],
    ['a row of 9 pictures', { ...fruit, bars: [{ label: 'Apples', value: null }, { label: 'Pears', value: 18 }] }, 'whole number of pictures'],
  ] as [string, DataGraphSpec, string][])('%s is refused', (_name, g, why) => {
    expect(graphProblem(g)).toContain(why)
    expect(answerProblem(question({ graph: g }))).toContain('graph:')
  })
})

describe('the key of a graph question', () => {
  test('one bar to draw is a whole number on the scale; more are a list, one value for each, in order', () => {
    expect(graphKeyProblem({ answer: '6', answerKind: 'whole', graph: pets }, readNumber)).toBeNull()
    expect(graphKeyProblem({ answer: '10; 5', answerKind: 'list', graph: cars }, readNumber)).toBeNull()
    expect(graphKeyProblem({ answer: '8', answerKind: 'whole', graph: fruit }, readNumber)).toBeNull()
  })

  test.each([
    ['a list for one bar', { answer: '6; 2', answerKind: 'list', graph: pets }, 'whole answer'],
    ['a whole for two bars', { answer: '10', answerKind: 'whole', graph: cars }, 'list answer'],
    ['too few values', { answer: '10; 5; 15', answerKind: 'list', graph: cars }, '3 values for 2 bars'],
    ['a value between two lines', { answer: '10; 7', answerKind: 'list', graph: cars }, 'on a line of the scale'],
    ['a value over the top', { answer: '9', answerKind: 'whole', graph: pets }, 'on a line of the scale'],
    ['a value of 0', { answer: '0', answerKind: 'whole', graph: pets }, 'above 0'],
    ['half a picture', { answer: '7', answerKind: 'whole', graph: fruit }, 'whole pictures'],
    ['9 pictures', { answer: '18', answerKind: 'whole', graph: fruit }, 'whole pictures'],
    ['a word', { answer: 'six', answerKind: 'whole', graph: pets }, 'a number'],
  ] as const)('%s is refused', (_name, q, why) => {
    expect(graphKeyProblem(q, readNumber)).toContain(why)
  })

  test('the save gate refuses a graph question with another picture or with choices', () => {
    expect(answerProblem(question({ diagram: { kind: 'bar_chart', bars: [{ label: 'A', value: 1 }], yMax: 5 } }))).toContain('no other picture')
    expect(answerProblem(question({ answerKind: 'choice', answer: 'A', choices: ['6', '5'] }))).toContain('graph:')
    expect(answerProblem(question())).toBeNull()
  })

  test('the empty bars, their names, a value held to the scale, and the answer sent', () => {
    expect(blankBars(cars)).toEqual([0, 1])
    expect(blankLabels(cars)).toEqual(['Mon', 'Tue'])
    expect([snapGraphValue(cars, 7.4), snapGraphValue(cars, 8), snapGraphValue(cars, -3), snapGraphValue(cars, 26)]).toEqual([5, 10, 0, 20])
    expect(snapGraphValue(fruit, 7)).toBe(8)
    expect([graphAnswer([6]), graphAnswer([10, 5]), graphAnswer([10, null]), graphAnswer([])]).toEqual(['6', '10; 5', '', ''])
    expect(graphValues('10; 5', readNumber)).toEqual([10, 5])
  })
})

describe('as it is saved and marked', () => {
  test('a graph of several bars to draw is saved as an ordered list with the name of each bar over its box', () => {
    const q = question({ graph: cars, answer: '10; 5', answerKind: 'list', ordered: false })
    expect(tidyGraph(q)).toMatchObject({ ordered: true, labels: ['Mon', 'Tue'] })
    expect(tidyGraph(question())).toEqual(question())
  })

  test('the drawn values are marked as the numbers always were: in order, and the same number is right', () => {
    const one = question()
    expect(finishAnswer(one, '6').correct).toBe(true)
    expect(finishAnswer(one, '5').correct).toBe(false)
    const two = tidyGraph(question({ graph: cars, answer: '10; 5', answerKind: 'list' }))
    expect(finishAnswer(two, '10; 5').correct).toBe(true)
    expect(finishAnswer(two, '5; 10').correct).toBe(false)
  })
})

describe('the lesson writer', () => {
  test('a data topic is told how to ask for a graph, in plain words for Grades 1 to 3 and with a step for Grades 4 to 6', () => {
    const young = primaryAnswerBlock('data', klass(2))
    const older = primaryAnswerBlock('data', klass(5))
    expect(young).toContain('- `graph`: the learner draws a graph.')
    expect(young).toContain('at most 10')
    expect(older).toContain('`step`')
    for (const text of [young, older]) {
      expect(text).toContain('`null` for')
      expect(text).toContain('A graph question has no `diagram` and no `choices`.')
      expect(text).not.toContain(String.fromCharCode(0x2014))
    }
    expect(primaryAnswerBlock('time', klass(4))).not.toContain('`graph`')
  })

  test('a Grade 3 data handling lesson is asked with the graph line and the gated schema', async () => {
    state.topic = 'Data handling'
    const seen = await askedFor({ subject: 'Mathematics', grade: 3, country: 'ZA', topicName: 'Data handling' }, PROMPT)
    expect(seen.system).toContain('- `graph`: the learner draws a graph.')
    expect(seen.system.startsWith(withPrimaryAnswers(renderPrompt('write_lesson', PROMPT, klass(3)), 'data', klass(3)))).toBe(true)
  })
})
