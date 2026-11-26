import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { columnsBullet, groupsBullet, matchBullet, PIN_BULLET, SHADE_BULLET, TAP_BULLET, KIT_PICTURES, PICTURE_KITS, pictureBullet, primaryAnswerBlock, primaryKit, withPrimaryAnswers, type PrimaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem, primaryPictureProblem, questionPictureProblem } from '../src/logic/picture'
import type { SeniorDiagramSpec } from '../src/schemas/diagram'
import { LessonSchema, PrimaryLessonSchema, type Question } from '../src/schemas/lesson'
import { PrimaryExtraLessonSchema, PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem, badQuestions, questionPictureOf } from '../src/tools/save/save-lesson'
import { askedFor, CHILD_INFO } from './helpers/write-lesson-world'

// P166: a Grade 1 to 6 question may carry one of the seven pictures Jemma draws for every grade (a fraction bar, a number line, an area model, a place
// value chart, a bar graph, a shape, squared paper). More topics are asked with the gated schema so their questions can have one (fractions, shapes,
// multiplication, counting on), and the US names of the P151 kits are added. The baseline class (Mathematics, Grade 6, South Africa) gets none of this:
// its recorded demo answers are found by a hash of its calls. No database, no network, no live model.

const state = vi.hoisted(() => ({ topic: 'Fractions' }))
vi.mock('../src/tools/read/get-child-context', () => ({
  getChildContext: { run: vi.fn(async () => ({ ...CHILD_INFO, session: { ...CHILD_INFO.session, topicName: state.topic } })) },
}))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const SCHEMA_INTRO = '\n\nReply with one JSON object only, no markdown fences and no other text. It must match this JSON schema:\n'
const schemaText = (schema: z.ZodType) => JSON.stringify(z.toJSONSchema(schema))
const klass = (grade: number, country = 'ZA', subject = 'Mathematics') => makeClassContext({ classId: 'c', subject, grade, country })
const ask = async (grade: number, topic: string, country = 'ZA') => {
  state.topic = topic
  return askedFor({ subject: 'Mathematics', grade, country, topicName: topic }, PROMPT)
}

const GOOD: SeniorDiagramSpec[] = [
  { kind: 'fraction_bar', rows: [{ parts: 8, shaded: 3 }] },
  { kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '?' }] },
  { kind: 'area_model', rows: 10, cols: 10, shaded: 35 },
  { kind: 'place_value', columns: ['H', 'T', 'U'], digits: ['3', '?', '5'] },
  { kind: 'bar_chart', bars: [{ label: 'Cats', value: 4 }, { label: 'Dogs', value: 6 }], yMax: 8 },
  { kind: 'shape_2d', shape: 'rectangle', labels: ['6 cm', '4 cm'] },
  { kind: 'grid_area', cols: 6, rows: 4, cells: [[0, 0], [1, 0], [1, 1]] },
]

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'What fraction of the bar is shaded?',
  render: 'text',
  answer: '3/8',
  answerKind: 'fraction',
  difficulty: 1,
  why: 'Count the shaded parts and all the parts.',
  rightWay: '3 parts of 8 are shaded: 3/8.',
  ...over,
})

describe('the schema: a Grades 1 to 6 question may carry a primary picture, and never a senior one', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('a %s', (_kind, diagram) => {
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram })).success).toBe(true)
  })

  test('a graph on a grid or a triangle is for a senior class only', () => {
    const plane = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
    const triangle = { kind: 'triangle', vertices: ['A', 'B', 'C'] }
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram: plane as never })).success).toBe(false)
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram: triangle as never })).success).toBe(false)
  })

  test('what is saved is read with the wide schema, picture and all, and passes the save gate', () => {
    // 15 questions, 5 per difficulty; each one shows one of the seven pictures in turn.
    const lesson = {
      format: 'reading',
      title: 'Fractions',
      minutes: 12,
      cards: [{ heading: 'h', body: 'b' }],
      warmup: [],
      questions: ([1, 2, 3] as const).flatMap((difficulty) =>
        [0, 1, 2, 3, 4].map((i) => question({ prompt: `Q${difficulty}.${i}`, difficulty, diagram: GOOD[(difficulty * 5 + i) % GOOD.length] })),
      ),
    }
    expect(PrimaryExtraLessonSchema.safeParse(lesson).success).toBe(true)
    const read = LessonSchema.safeParse(lesson)
    expect(read.success).toBe(true)
    expect(read.success && read.data.questions[0]!.diagram).toEqual(GOOD[5])
    expect(read.success && badQuestions(read.data)).toEqual({ warmup: [], questions: [] })
  })

  test('the demo schema did not move: it has no question picture', () => {
    const items = (z.toJSONSchema(PrimaryLessonSchema) as unknown as { properties: { questions: { items: { properties: Record<string, unknown> } } } }).properties.questions.items
    expect(items.properties).not.toHaveProperty('diagram')
  })
})

describe('the picture of a question must make sense (the save gate)', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('a good %s passes', (_kind, d) => {
    expect(primaryPictureProblem(d)).toBeNull()
    expect(questionPictureProblem(d)).toBeNull()
  })

  test.each([
    ['too many parts', { kind: 'fraction_bar', rows: [{ parts: 30, shaded: 3 }] }, '1 to 24'],
    ['more shaded than parts', { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 5 }] }, 'none to all'],
    ['no bars', { kind: 'fraction_bar', rows: [] }, '1 to 4'],
    ['a line backwards', { kind: 'number_line', min: 10, max: 0, step: 1, marks: [] }, 'smaller number to a bigger one'],
    ['a line of 100 steps', { kind: 'number_line', min: 0, max: 100, step: 1, marks: [] }, 'at most 40 steps'],
    ['a mark off the line', { kind: 'number_line', min: 0, max: 10, step: 1, marks: [{ value: 12, label: 'A' }] }, 'on the number line'],
    ['a huge area model', { kind: 'area_model', rows: 20, cols: 3, shaded: 0 }, '1 to 12'],
    ['an area model shading too much', { kind: 'area_model', rows: 2, cols: 3, shaded: 7 }, 'none to all'],
    ['two digits in a place', { kind: 'place_value', columns: ['T', 'U'], digits: ['12', '3'] }, 'one digit'],
    ['a bar over the scale', { kind: 'bar_chart', bars: [{ label: 'A', value: 12 }], yMax: 10 }, 'on the scale'],
    ['a bar with no label', { kind: 'bar_chart', bars: [{ label: ' ', value: 2 }], yMax: 10 }, 'a label'],
    ['nine bars', { kind: 'bar_chart', bars: Array.from({ length: 9 }, (_, i) => ({ label: `B${i}`, value: 1 })), yMax: 5 }, '1 to 8'],
    ['a shape with five labels', { kind: 'shape_2d', shape: 'square', labels: ['1', '2', '3', '4', '5'] }, 'at most 4'],
    ['a square off the paper', { kind: 'grid_area', cols: 3, rows: 3, cells: [[3, 0]] }, 'on the paper'],
    ['a square given twice', { kind: 'grid_area', cols: 3, rows: 3, cells: [[1, 1], [1, 1]] }, 'given once'],
    ['no shape at all', { kind: 'grid_area', cols: 3, rows: 3, cells: [] }, 'at least one square'],
  ] as [string, SeniorDiagramSpec, string][])('%s is refused', (_name, d, why) => {
    expect(primaryPictureProblem(d)).toContain(why)
    expect(answerProblem(question({ diagram: d }))).toContain('picture:')
  })

  test('a lesson card draws the seven kinds as it always did: pictureProblem still does not look at them', () => {
    expect(pictureProblem({ kind: 'fraction_bar', rows: [{ parts: 30, shaded: 3 }] })).toBeNull()
  })

  test('a senior picture is checked as before', () => {
    expect(questionPictureProblem({ kind: 'coordinate_plane', xMin: 5, xMax: -5, yMin: -5, yMax: 5 })).toContain('xMin below xMax')
  })

  test('a senior question is held to no new limit: a graph of 10 bars is fine there, and too many for a young learner', () => {
    const ten: SeniorDiagramSpec = { kind: 'bar_chart', bars: Array.from({ length: 10 }, (_, i) => ({ label: `B${i}`, value: i })), yMax: 10 }
    expect(answerProblem(question({ diagram: ten }))).toContain('picture:')
    expect(questionPictureOf(question({ diagram: ten, steps: ['3 of the 8 parts are shaded', '3/8'] }))).toBeNull()
    expect(answerProblem(question({ diagram: ten, steps: ['3 of the 8 parts are shaded', '3/8'] }))).toBeNull()
  })

  test('a good question with a picture is kept', () => {
    expect(answerProblem(question({ diagram: GOOD[0] }))).toBeNull()
  })

  test('a primary picture does not make a question senior: its whole answer still may not be negative', () => {
    expect(isSeniorQuestion(question({ answerKind: 'whole', answer: '6', diagram: GOOD[4] }))).toBe(false)
    expect(answerProblem(question({ answerKind: 'whole', answer: '-3', diagram: GOOD[1] }))).not.toBeNull()
  })
})

describe('the picture bullet the lesson writer is told', () => {
  test('each kit names the pictures that fit its topic, and time and money have none (no clock or coins are drawn yet)', () => {
    expect(KIT_PICTURES.fractions).toEqual(['fraction_bar', 'number_line', 'area_model'])
    expect(KIT_PICTURES.data).toEqual(['bar_chart'])
    expect(KIT_PICTURES.place).toEqual(['place_value'])
    expect(KIT_PICTURES.shapes).toEqual(['shape_2d', 'grid_area'])
    expect(pictureBullet('time', klass(3))).toBeNull()
    expect(pictureBullet('money', klass(3))).toBeNull()
    for (const kit of Object.keys(KIT_PICTURES) as PrimaryKit[]) {
      const bullet = pictureBullet(kit, klass(4))
      if (!bullet) continue
      for (const kind of GOOD.map((d) => d.kind)) {
        if (KIT_PICTURES[kit].includes(kind)) expect(bullet, `${kit} names ${kind}`).toContain(`\`${kind}\``)
        else expect(bullet, `${kit} does not name ${kind}`).not.toContain(`\`${kind}\``)
      }
    }
  })

  test('the bullet says where to look and never to give the answer away; young learners get small, plain pictures', () => {
    const older = pictureBullet('fractions', klass(5))!
    const young = pictureBullet('fractions', klass(2))!
    expect(older).toMatch(/^- `diagram`:/)
    expect(older).toContain('Never write the answer')
    expect(older).toContain('Say in the `prompt` what to look at')
    expect(young).toContain('Keep it small and plain')
    expect(older).not.toContain('Keep it small and plain')
    for (const kit of PICTURE_KITS) for (const grade of [1, 4]) expect(pictureBullet(kit, klass(grade))).not.toContain(String.fromCharCode(0x2014))
  })

  test('a picture kit adds the bullet alone; an old kit keeps its answer kinds and gains the bullet', () => {
    // P168: addition and subtraction also has its line for sums in columns after the picture bullet, and (P170) counting, shapes and multiplication a line
    // for sorting into groups.
    // P172: fractions also has its line for shading parts of a shape.
    // P175: and for putting a pin on a number line (fractions and counting).
    expect(primaryAnswerBlock('fractions', klass(3))).toBe(`${pictureBullet('fractions', klass(3))}\n${SHADE_BULLET}\n${PIN_BULLET}`)
    expect(primaryAnswerBlock('addsub', klass(3))).toBe(`${pictureBullet('addsub', klass(3))}\n${columnsBullet(klass(3))}`)
    expect(primaryAnswerBlock('addsub', klass(1))).toBe(pictureBullet('addsub', klass(1)))
    expect(primaryAnswerBlock('multiply', klass(3))).toBe(`${pictureBullet('multiply', klass(3))}\n${groupsBullet('multiply')}`)
    // P178: counting and shapes also have a line for matching pairs.
    expect(primaryAnswerBlock('numbers', klass(3))).toBe(`${pictureBullet('numbers', klass(3))}\n${groupsBullet('numbers')}\n${PIN_BULLET}\n${matchBullet('numbers', klass(3))}`)
    // P173: shapes also has its line for tapping shapes.
    expect(primaryAnswerBlock('shapes', klass(3))).toBe(`${pictureBullet('shapes', klass(3))}\n${groupsBullet('shapes')}\n${TAP_BULLET}\n${matchBullet('shapes', klass(3))}`)
    expect(PICTURE_KITS).toEqual(['fractions', 'shapes', 'multiply', 'numbers', 'addsub'])
    const data = primaryAnswerBlock('data', klass(4))
    expect(data).toContain('- `table`')
    expect(data.endsWith(pictureBullet('data', klass(4))!)).toBe(true)
    expect(primaryAnswerBlock('time', klass(4))).not.toContain('`diagram`')
  })
})

describe('the lesson call', () => {
  test('a Grade 3 fraction topic: the picture bullet and the gated schema', async () => {
    const seen = await ask(3, 'Fractions')
    expect(primaryKit(klass(3), 'Fractions')).toBe('fractions')
    expect(seen.system).toBe(`${withPrimaryAnswers(renderPrompt('write_lesson', PROMPT, klass(3)), 'fractions', klass(3))}${SCHEMA_INTRO}${schemaText(PrimaryExtraLessonSchema)}`)
    expect(seen.system).toContain('`fraction_bar`')
  })

  test('a US Grade 3 time topic gets the time kit (P151 named only the CAPS ones)', async () => {
    const seen = await ask(3, 'Elapsed time', 'US')
    expect(seen.system).toContain('`time`: the answer is a time of day')
    expect(seen.system).toContain(schemaText(PrimaryExtraLessonSchema))
  })

  test('the baseline class: its fraction topic is asked exactly as before, with the demo schema and no picture bullet', async () => {
    const seen = await ask(6, 'Common fractions')
    expect(seen.system).toBe(`${renderPrompt('write_lesson', PROMPT, klass(6))}${SCHEMA_INTRO}${schemaText(PrimaryLessonSchema)}`)
    expect(seen.system).not.toContain('`diagram`: a question may show')
  })
})
