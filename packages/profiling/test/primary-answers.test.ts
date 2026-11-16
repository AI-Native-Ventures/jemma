import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { primaryAnswerBlock, primaryKit, withPrimaryAnswers, type PrimaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { PrimaryLessonSchema } from '../src/schemas/lesson'
import { PrimaryExtraLessonSchema } from '../src/schemas/primary-extra'
import { askedFor, CHILD_INFO } from './helpers/write-lesson-world'

// P151: Grades 1 to 6 Mathematics lessons whose topic needs them (time, measurement, ordering, patterns, data handling, money, place value) are asked
// for the new answer kinds. Every other Grade 1 to 6 lesson, the Grade 6 demo class above all, is asked exactly as before: the recorded answers are
// found by a hash of the whole model call. No database, no network, no live model.

// The topic the planned session is for reaches the job through `get_child_context`, so the double hands it back as the test says.
const state = vi.hoisted(() => ({ topic: 'Equivalent fractions' }))
vi.mock('../src/tools/read/get-child-context', () => ({
  getChildContext: { run: vi.fn(async () => ({ ...CHILD_INFO, session: { ...CHILD_INFO.session, topicName: state.topic } })) },
}))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
/** The sha256 of the system text and of the user's words of the lesson call, for classes and topics that must not change (taken on develop c2c9f32). */
const BEFORE = JSON.parse(readFileSync(new URL('./fixtures/p151-before.json', import.meta.url), 'utf8')) as Record<string, { system: string; user: string }>
const SCHEMA_INTRO = '\n\nReply with one JSON object only, no markdown fences and no other text. It must match this JSON schema:\n'
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const schemaText = (schema: z.ZodType) => JSON.stringify(z.toJSONSchema(schema))
const klass = (grade: number, subject = 'Mathematics', country = 'ZA') => makeClassContext({ classId: 'c', subject, grade, country })
const ask = async (grade: number, topicName: string, subject = 'Mathematics', country = 'ZA') => {
  state.topic = topicName
  return askedFor({ subject, grade, country, topicName }, PROMPT)
}

describe('primaryKit: which topics of Grades 1 to 6 get the new answer kinds', () => {
  const GATED: [number, string, PrimaryKit][] = [
    [3, 'Time', 'time'],
    [1, 'Time (Term 2)', 'time'],
    [6, 'Time', 'time'],
    [2, 'Length', 'measure'],
    [4, 'Mass', 'measure'],
    [5, 'Capacity/volume', 'measure'],
    [1, 'Capacity/Volume (Term 3)', 'measure'],
    [6, 'Temperature', 'measure'],
    [3, 'Perimeter', 'measure'],
    [3, 'Area', 'measure'],
    [5, 'Area, perimeter & volume', 'measure'],
    [4, 'Perimeter, area & volume', 'measure'],
    [1, 'Describe, compare and order numbers', 'order'],
    [2, 'Describe, compare and order numbers (Term 3)', 'order'],
    [3, 'Ordering', 'order'],
    [1, 'Number patterns', 'patterns'],
    [2, 'Number patterns (Term 4)', 'patterns'],
    [5, 'Numeric patterns', 'patterns'],
    [4, 'Data handling', 'data'],
    [2, 'Collect and organise data', 'data'],
    [3, 'Represent data', 'data'],
    [1, 'Collect and sort objects', 'data'],
    [1, 'Represent sorted collection of objects', 'data'],
    [1, 'Discuss and report on sorted collection of objects', 'data'],
    [2, 'Analyse and interpret data', 'data'],
    [3, 'Analyse and Interpret data', 'data'],
    [3, 'Money', 'money'],
    [1, 'Money (Term 4)', 'money'],
    [2, 'Place value', 'place'],
    [5, 'Counting and place value', 'place'],
  ]
  test.each(GATED)('Grade %i "%s" gets the %s kit', (grade, topic, kit) => {
    expect(primaryKit(klass(grade), topic)).toBe(kit)
  })

  test.each([
    'Equivalent fractions',
    'Adding and subtracting fractions with different denominators',
    'Comparing fractions',
    'Mixed numbers',
    'Fractions',
    'Common fractions',
    'Decimal fractions',
    'Percentages',
    'Addition and subtraction',
    'Multiplication',
    'Division',
    'Geometric patterns',
    'Number sentences',
    'Symmetry',
    'Probability',
    '2-D shapes',
    'Transformations',
    'Count objects',
    'Problems in context: addition and subtraction',
    'History',
    '',
  ])('"%s" gets nothing', (topic) => {
    expect(primaryKit(klass(6), topic)).toBeNull()
    expect(primaryKit(klass(3), topic)).toBeNull()
  })

  test('only a Mathematics class of Grade 1 to 6 (a senior class, another subject and a class that could not be told get nothing)', () => {
    expect(primaryKit(klass(7), 'Time')).toBeNull()
    expect(primaryKit(klass(10), 'Time')).toBeNull()
    expect(primaryKit(klass(0), 'Time')).toBeNull()
    expect(primaryKit(klass(5, 'Natural Sciences'), 'Time')).toBeNull()
    expect(primaryKit(klass(5, 'English'), 'Time')).toBeNull()
    expect(primaryKit(null, 'Time')).toBeNull()
  })

  test('the country does not matter, the subject can be written the way a school writes it', () => {
    expect(primaryKit(klass(4, 'Maths', 'KE'), 'Time')).toBe('time')
    expect(primaryKit(klass(4, 'mathematics', 'South Africa'), 'Mass')).toBe('measure')
  })

  test('the CAPS topics of Grades 1 to 6: the fraction topics of the recorded demo are never gated, and a good share of the rest is', () => {
    const root = new URL('../../../fixtures/curriculum/caps/', import.meta.url)
    const all = new Set<string>()
    const gated = new Set<string>()
    const names = new Set<string>()
    for (let grade = 1; grade <= 6; grade++) {
      const file = JSON.parse(readFileSync(new URL(`grade-${grade}.json`, root), 'utf8')) as { terms: { topics: { name: string; shortName: string; family: string }[] }[] }
      for (const term of file.terms) {
        for (const topic of term.topics) {
          all.add(`${grade}|${topic.shortName.replace(/\s*\(Term \d\)$/, '')}`)
          if (primaryKit(klass(grade), topic.shortName)) {
            gated.add(`${grade}|${topic.shortName.replace(/\s*\(Term \d\)$/, '')}`)
            names.add(topic.shortName.replace(/\s*\(Term \d\)$/, ''))
          }
          if (topic.family === 'fractions') expect(primaryKit(klass(grade), topic.shortName), `${topic.shortName} is a fraction topic`).toBeNull()
        }
      }
    }
    // 154 topics of Grades 1 to 6 (a topic taught in two terms counted once for its grade): 64 of them are gated.
    expect(all.size).toBe(154)
    expect(gated.size).toBeGreaterThanOrEqual(60)
    // Each of the topics the packet names is gated by some topic of the curriculum.
    for (const want of ['Time', 'Length', 'Mass', 'Capacity/Volume', 'Temperature', 'Money', 'Place value', 'Data handling', 'Number patterns', 'Numeric patterns', 'Describe, compare and order numbers'])
      expect([...names].map((n) => n.toLowerCase()), want).toContain(want.toLowerCase())
  })
})

describe('the new kinds a topic is told about, and how simply (Grades 1 to 3) or fully (Grades 4 to 6)', () => {
  test('a kit names the kinds that fit its topic and no others', () => {
    const kinds = (kit: PrimaryKit, grade = 4) => [...primaryAnswerBlock(kit, klass(grade)).matchAll(/^- `(time|list|order|table)`/gm)].map((m) => m[1])
    expect(kinds('time')).toEqual(['time'])
    expect(kinds('order')).toEqual(['order'])
    expect(kinds('patterns')).toEqual(['list'])
    expect(kinds('data')).toEqual(['table', 'list'])
    expect(kinds('measure')).toEqual([])
    expect(kinds('money')).toEqual(['order', 'table'])
    expect(kinds('place')).toEqual(['list', 'order'])
  })

  test('Grades 1 to 3 are kept simple, Grades 4 to 6 are not held to that', () => {
    const young = primaryAnswerBlock('time', klass(2))
    const older = primaryAnswerBlock('time', klass(5))
    expect(young).toContain('o\'clock and half past')
    expect(older).toContain('quarter past')
    expect(older).not.toContain('o\'clock and half past')
    expect(primaryAnswerBlock('order', klass(1))).toContain('at most 5')
    expect(primaryAnswerBlock('data', klass(3))).toContain('2 x 3')
  })

  test('no clock picture exists, so reading a clock face is a choice question', () => {
    for (const grade of [1, 3, 4, 6]) {
      const text = primaryAnswerBlock('time', klass(grade))
      expect(text).toMatch(/no clock picture/i)
      expect(text).toContain('`choice`')
    }
  })

  test('the lines hold no em dash and no way to give the answer away', () => {
    for (const kit of ['time', 'measure', 'order', 'patterns', 'data', 'money', 'place'] as const)
      for (const grade of [1, 3, 4, 6]) expect(primaryAnswerBlock(kit, klass(grade))).not.toContain(String.fromCharCode(0x2014))
  })

  test('money is in rand in South Africa only', () => {
    expect(primaryAnswerBlock('money', klass(3, 'Mathematics', 'ZA'))).toContain('R')
    expect(primaryAnswerBlock('money', klass(3, 'Mathematics', 'KE'))).not.toMatch(/\bR\d/)
  })

  test('withPrimaryAnswers puts the lines after the answer bullet of the prompt file, and nothing else changes', () => {
    const block = primaryAnswerBlock('time', klass(3))
    const out = withPrimaryAnswers(PROMPT, 'time', klass(3))
    expect(out.replace(`${block}\n`, '')).toBe(PROMPT)
    expect(out.indexOf(block)).toBeGreaterThan(out.indexOf('`answer` must be one value'))
    expect(out.indexOf(block)).toBeLessThan(out.indexOf('- `why` says in one sentence'))
  })

  test('a prompt without the answer bullet gets the lines at the end', () => {
    const text = 'Write one home lesson.'
    const out = withPrimaryAnswers(text, 'time', klass(3))
    expect(out.startsWith(`${text}\n`)).toBe(true)
    expect(out).toContain(primaryAnswerBlock('time', klass(3)))
  })
})

describe('the schema of a gated lesson', () => {
  test('it is not the primary schema, and the primary schema is still the lesson as it was', () => {
    expect(sha(schemaText(PrimaryLessonSchema))).toBe('8d041cfb7de9ba42fd1919b91033c913475831bbd0dbe07e02d7d23efb8dc71c')
    expect(schemaText(PrimaryExtraLessonSchema)).not.toBe(schemaText(PrimaryLessonSchema))
  })

  test('it names the four new kinds and none of the senior ones, and has no steps, no form and no senior picture', () => {
    const json = schemaText(PrimaryExtraLessonSchema)
    for (const word of ['"time"', '"list"', '"order"', '"table"', '"fraction"', '"money"', '"choice"']) expect(json).toContain(word)
    for (const word of ['"expression"', '"equation"', '"point"', '"form"', '"coordinate_plane"', '"const":"triangle"', '"factorised"']) expect(json).not.toContain(word)
    // The lesson's diagram has steps of its own: it is the question that has none.
    const items = (JSON.parse(json) as { properties: { questions: { items: { required: string[]; properties: Record<string, unknown> } } } }).properties.questions.items
    expect(items.properties).not.toHaveProperty('steps')
    expect(items.properties).not.toHaveProperty('diagram')
    expect(items.required).not.toContain('steps')
  })
})

describe('what the lesson writer asks the model', () => {
  test('a Grade 3 Time lesson gets the kit and the wider schema, in the system text, and its data block is the one it always had', async () => {
    const seen = await ask(3, 'Time')
    const expected = `${withPrimaryAnswers(renderPrompt('write_lesson', PROMPT, klass(3)), 'time', klass(3))}${SCHEMA_INTRO}${schemaText(PrimaryExtraLessonSchema)}`
    expect(seen.system).toBe(expected)
    expect(seen.system).toContain('`time`')
    const data = JSON.parse(/<untrusted>([\s\S]*)<\/untrusted>/.exec(seen.user)![1]!) as Record<string, unknown>
    expect(Object.keys(data)).toEqual(['profile', 'openGaps', 'formatTrials', 'plannedSession'])
  })

  test('a Grade 6 baseline class with a Time topic gets the kit too (its fraction topics do not)', async () => {
    const seen = await ask(6, 'Time')
    expect(seen.system).toBe(`${withPrimaryAnswers(PROMPT, 'time', klass(6))}${SCHEMA_INTRO}${schemaText(PrimaryExtraLessonSchema)}`)
    expect(seen.system).toContain('quarter past')
  })

  test('the prompt lines are in the request of a gated topic only', async () => {
    const gated = await ask(4, 'Number patterns')
    const plain = await ask(4, 'Symmetry')
    expect(gated.system).toContain('`list`')
    expect(plain.system).not.toContain('`list`')
    expect(plain.system).not.toContain('`time`')
    expect(plain.system).not.toContain('`order`')
    expect(plain.system).not.toContain('`table`')
    expect(schemaText(PrimaryExtraLessonSchema) === gated.system.slice(gated.system.indexOf(SCHEMA_INTRO) + SCHEMA_INTRO.length)).toBe(true)
    expect(plain.system.slice(plain.system.indexOf(SCHEMA_INTRO) + SCHEMA_INTRO.length)).toBe(schemaText(PrimaryLessonSchema))
  })

  test('a senior class, another subject and a class outside Grades 1 to 6 are not given the primary kit', async () => {
    for (const [grade, subject] of [[10, 'Mathematics'], [5, 'Natural Sciences']] as const) {
      const seen = await ask(grade, 'Time', subject)
      expect(seen.system).not.toContain('There is no clock picture')
    }
  })
})

describe('every other Grade 1 to 6 lesson is asked byte for byte as before (hashes taken on develop c2c9f32, before P151)', () => {
  const rows = Object.entries(BEFORE)

  test('the table has the demo class and the other primary classes, 31 topics each', () => {
    expect(rows).toHaveLength(155)
    expect(rows.filter(([k]) => k.startsWith('Mathematics|6|ZA|'))).toHaveLength(31)
  })

  test.each(rows)('%s', async (key, hashes) => {
    const [subject, grade, country, topic] = key.split('|') as [string, string, string, string]
    const seen = await ask(Number(grade), topic, subject, country)
    expect(sha(seen.system)).toBe(hashes.system)
    expect(sha(seen.user)).toBe(hashes.user)
  })
})
