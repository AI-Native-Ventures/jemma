import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { renderPrompt } from '../../src/ai/prompt-variants'
import { makeClassContext } from '../../src/ai/subject-profile'
import { PrimaryLessonSchema, SeniorLessonSchema } from '../../src/schemas/lesson'

// P150: the senior lesson writer is told about the list, the order and the table, and when to use each. A primary class, the baseline class and a class that
// is not Mathematics are told nothing of it. No database, no network, no model.

const base = readFileSync(join(import.meta.dirname, '../../src/jobs/write_lesson.md'), 'utf8')
const klass = (subject: string, grade: number, country: string) => makeClassContext({ classId: 'c', subject, grade, country })
const senior = (country = 'ZA', grade = 10) => renderPrompt('write_lesson', base, klass('Mathematics', grade, country))

describe('the senior prompt', () => {
  test('names the three kinds and the fields that go with them', () => {
    const text = senior()
    for (const word of ['`list`', '`order`', '`table`', '`ordered`', '`labels`', '`round`', '`columns`', '`rows`']) expect(text).toContain(word)
  })
  test('says when to use each one', () => {
    const text = senior()
    for (const when of ['five-number summary', 'next three terms', 'factors', 'frequency table', 'two-way table', 'probability', 'Venn']) expect(text.toLowerCase()).toContain(when.toLowerCase())
  })
  test('says the answer is cut at semicolons, a table key has one value for each null, and the warm-up never has these', () => {
    const text = senior()
    expect(text).toContain('semicolon')
    expect(text).toContain('exactly as many values as the table has nulls')
    expect(text).toContain('never in the warm-up')
  })
  test('the bullet sits between the answer kinds and the why of the file', () => {
    const text = senior()
    expect(text.indexOf('`answerKind` must match it')).toBeLessThan(text.indexOf('`list`'))
    expect(text.indexOf('`list`')).toBeLessThan(text.indexOf('`why` says in one sentence what usually goes wrong.'))
  })
  test('a South African class writes decimals with a comma, another country with a point', () => {
    expect(senior('ZA')).toContain('2; 4; 5,5; 8; 10')
    expect(senior('KE')).toContain('2; 4; 5.5; 8; 10')
  })
  test('every grade 7 to 12 is told', () => {
    for (const grade of [7, 9, 12]) expect(senior('ZA', grade)).toContain('`order`')
  })
  test('it holds no em dash', () => {
    expect(senior()).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('classes that are not told', () => {
  test('the baseline class (Mathematics, Grade 6, South Africa) gets the file as it is', () => {
    expect(renderPrompt('write_lesson', base, klass('Mathematics', 6, 'ZA'))).toBe(base)
  })
  test.each([
    ['Grade 4 Mathematics', klass('Mathematics', 4, 'ZA')],
    ['Grade 6 Mathematics in Kenya', klass('Mathematics', 6, 'KE')],
    ['Grade 13 Mathematics', klass('Mathematics', 13, 'ZA')],
    ['Grade 10 Natural Sciences', klass('Natural Sciences', 10, 'ZA')],
  ])('%s has none of the three kinds', (_name, c) => {
    const text = renderPrompt('write_lesson', base, c)
    for (const word of ['`list`', '`order`', '`table`', 'semicolon']) expect(text).not.toContain(word)
  })
})

describe('the schema handed to the model', () => {
  test('the senior one has the kinds and the new fields; the primary one has none of them', () => {
    const senior = JSON.stringify(z.toJSONSchema(SeniorLessonSchema))
    const primary = JSON.stringify(z.toJSONSchema(PrimaryLessonSchema))
    // (A picture has `labels` of its own, so that word is not a sign: the three kinds, `ordered` and `round` are.)
    for (const word of ['"list"', '"order"', '"table"', '"ordered"', '"round"']) {
      expect(senior).toContain(word)
      expect(primary).not.toContain(word)
    }
    expect(senior).toContain('"table":{"type":"object","properties":{"columns"')
  })
})
