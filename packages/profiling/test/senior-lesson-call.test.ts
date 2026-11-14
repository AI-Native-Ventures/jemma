import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { isSeniorMaths, makeClassContext } from '../src/ai/subject-profile'
import { PrimaryLessonSchema, SeniorLessonSchema } from '../src/schemas/lesson'
import { askedFor, CHILD_INFO } from './helpers/write-lesson-world'

// P86, decisions 1 and 6: what the lesson writer asks the model for a senior class (Mathematics, Grades 7 to 12) and for every other class.
// The baseline class (Grade 6) is pinned in baseline-lesson-call.test.ts and must not move. No database, no network, no live model.

vi.mock('../src/tools/read/get-child-context', () => ({ getChildContext: { run: vi.fn(async () => CHILD_INFO) } }))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const SCHEMA_INTRO = '\n\nReply with one JSON object only, no markdown fences and no other text. It must match this JSON schema:\n'
const schemaText = (schema: z.ZodType) => JSON.stringify(z.toJSONSchema(schema))
/** The JSON schema the model was given, cut from the end of the system text. */
const schemaOf = (system: string) => system.slice(system.indexOf(SCHEMA_INTRO) + SCHEMA_INTRO.length)
const dataOf = (user: string) => JSON.parse(/<untrusted>([\s\S]*)<\/untrusted>/.exec(user)![1]!) as Record<string, unknown>

describe('isSeniorMaths: Mathematics, Grades 7 to 12, whatever the country', () => {
  const ctx = (subject: string, grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject, grade, country })
  test.each([[7], [8], [9], [10], [11], [12]])('Mathematics Grade %i is senior', (grade) => expect(isSeniorMaths(ctx('Mathematics', grade))).toBe(true))
  test.each([[1], [4], [6], [13], [0]])('Mathematics Grade %i is not', (grade) => expect(isSeniorMaths(ctx('Mathematics', grade))).toBe(false))
  test('the baseline class is never senior', () => expect(isSeniorMaths(ctx('Mathematics', 6, 'ZA'))).toBe(false))
  test('another subject is not, and a class that could not be told is not', () => {
    expect(isSeniorMaths(ctx('Natural Sciences', 10))).toBe(false)
    expect(isSeniorMaths(ctx('English', 9))).toBe(false)
    expect(isSeniorMaths(null)).toBe(false)
  })
  test('the subject can be written the way a school writes it, and the country does not matter', () => {
    expect(isSeniorMaths(ctx('Maths', 10, 'KE'))).toBe(true)
    expect(isSeniorMaths(ctx('mathematics', 8, 'South Africa'))).toBe(true)
  })
})

describe('the schema the model is given', () => {
  test('a Grade 10 South African class gets the senior schema, with the four answer kinds and the form', async () => {
    const seen = await askedFor({ subject: 'Mathematics', grade: 10, country: 'ZA', family: 'algebra' }, PROMPT)
    expect(schemaOf(seen.system)).toBe(schemaText(SeniorLessonSchema))
    for (const word of ['"expression"', '"equation"', '"point"', '"form"', '"factorised"']) expect(seen.system).toContain(word)
  })

  test.each([
    ['a Grade 6 baseline class', { subject: 'Mathematics', grade: 6, country: 'ZA' }],
    ['a Grade 4 class', { subject: 'Mathematics', grade: 4, country: 'ZA' }],
    ['a Grade 13 class', { subject: 'Mathematics', grade: 13, country: 'ZA' }],
    ['a Grade 10 Natural Sciences class', { subject: 'Natural Sciences', grade: 10, country: 'ZA' }],
    ['a Grade 6 class in Kenya', { subject: 'Mathematics', grade: 6, country: 'KE' }],
  ])('%s gets the primary schema, the lesson as it was', async (_name, spec) => {
    const seen = await askedFor(spec, PROMPT)
    expect(schemaOf(seen.system)).toBe(schemaText(PrimaryLessonSchema))
    for (const word of ['"expression"', '"equation"', '"point"', '"form"']) expect(seen.system).not.toContain(word)
  })
})

describe('the data block', () => {
  test('a senior class is also told the topic of the planned session, with its family', async () => {
    const seen = await askedFor({ subject: 'Mathematics', grade: 10, country: 'ZA', family: 'algebra' }, PROMPT)
    const data = dataOf(seen.user)
    expect(data.topic).toEqual({ name: 'Equivalent fractions', family: 'algebra' })
    expect(Object.keys(data)).toEqual(['profile', 'openGaps', 'formatTrials', 'plannedSession', 'topic'])
  })

  test('a topic without a family is told with a null family', async () => {
    const seen = await askedFor({ subject: 'Mathematics', grade: 9, country: 'ZA', family: null }, PROMPT)
    expect(dataOf(seen.user).topic).toEqual({ name: 'Equivalent fractions', family: null })
  })

  test('any other class has the data block it always had, with no topic', async () => {
    for (const spec of [
      { subject: 'Mathematics', grade: 6, country: 'ZA' },
      { subject: 'Mathematics', grade: 4, country: 'ZA' },
      { subject: 'Natural Sciences', grade: 10, country: 'ZA' },
    ]) {
      const data = dataOf((await askedFor(spec, PROMPT)).user)
      expect(Object.keys(data)).toEqual(['profile', 'openGaps', 'formatTrials', 'plannedSession'])
    }
  })
})
