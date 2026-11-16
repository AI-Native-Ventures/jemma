import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { renderPrompt } from '../../src/ai/prompt-variants'
import { makeClassContext } from '../../src/ai/subject-profile'
import {
  CHOICE_LETTERS,
  GEOMETRY_REASONS,
  choiceLabel,
  composeReasonAnswer,
  finishAnswer,
  findReason,
  markAnswer,
  parseAnswer,
  readTrueFalse,
  splitReasonAnswer,
} from '../../src/logic'
import type { SeniorDiagramSpec } from '../../src/schemas/diagram'
import { ChoiceSchema, LessonSchema, PrimaryLessonSchema, SeniorLessonSchema, StoredLessonSchema, type Choice, type Lesson, type Question } from '../../src/schemas/lesson'
import { answerProblem } from '../../src/tools/save/save-lesson'

// P149: pick the right picture, true or false, and the reason for a step of a geometry proof. No database, no network, no model.

const PRIMARY_SHA = '8d041cfb7de9ba42fd1919b91033c913475831bbd0dbe07e02d7d23efb8dc71c'
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(z.toJSONSchema(value as z.ZodType))).digest('hex')

const LINE: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 1, c: 0 }] }
const PARABOLA: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'parabola', a: 1, q: -4 }] }
const BAD_GRID: SeniorDiagramSpec = { kind: 'coordinate_plane', xMin: 5, xMax: -5, yMin: -5, yMax: 5 }

const q = (answerKind: Question['answerKind'], answer: string, over: Partial<Question> = {}): Question => ({
  prompt: 'Which graph is y = x² − 4?',
  render: 'text',
  answer,
  answerKind,
  difficulty: 1,
  why: 'why',
  rightWay: 'right way',
  ...over,
})
const STEPS = ['y = x² − 4', 'y = (x − 0)² − 4']
const pictures: Choice[] = [{ diagram: LINE }, { diagram: PARABOLA }, { diagram: LINE }, { diagram: PARABOLA }]

const lessonOf = (over: Partial<Question> = {}): Lesson => ({
  format: 'reading',
  title: 'T',
  minutes: 12,
  cards: [{ heading: 'h', body: 'b' }],
  warmup: [],
  questions: ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => q('number', '3', { difficulty: d, prompt: `Q ${d}.${i}`, steps: STEPS, ...over }))),
})

describe('the schema takes picture choices and the old text choices', () => {
  test('a choice is a plain string, or an object with text, a diagram or both', () => {
    expect(ChoiceSchema.safeParse('x^2 − 4').success).toBe(true)
    expect(ChoiceSchema.safeParse({ diagram: PARABOLA }).success).toBe(true)
    expect(ChoiceSchema.safeParse({ text: 'Graph one', diagram: LINE }).success).toBe(true)
    expect(ChoiceSchema.safeParse({ text: 'only words' }).success).toBe(true)
    expect(ChoiceSchema.safeParse(3).success).toBe(false)
    expect(ChoiceSchema.safeParse({ diagram: { kind: 'nonsense' } }).success).toBe(false)
  })

  test('a senior question takes picture choices, string choices, and a mix', () => {
    const parse = (choices: unknown[]) => LessonSchema.safeParse(lessonOf({ answerKind: 'choice', answer: 'B', choices: choices as Question['choices'] })).success
    expect(parse(pictures)).toBe(true)
    expect(parse(['1', '2', '3', '4'])).toBe(true)
    expect(parse(['1', { diagram: LINE }, { text: 'c' }])).toBe(true)
    expect(SeniorLessonSchema.safeParse(lessonOf({ answerKind: 'choice', answer: 'B', choices: pictures })).success).toBe(true)
    expect(StoredLessonSchema.safeParse(lessonOf({ answerKind: 'choice', answer: 'B', choices: pictures })).success).toBe(true)
  })

  test('the two new kinds are accepted by the senior and the wide schema', () => {
    expect(LessonSchema.safeParse(lessonOf({ answerKind: 'truefalse', answer: 'true' })).success).toBe(true)
    expect(SeniorLessonSchema.safeParse(lessonOf({ answerKind: 'reason', answer: 'angles on a straight line' })).success).toBe(true)
  })

  test('the primary schema (Grades 1 to 6) is unchanged: same sha256, no picture choices, no new kinds', () => {
    expect(sha(PrimaryLessonSchema)).toBe(PRIMARY_SHA)
    const json = JSON.stringify(z.toJSONSchema(PrimaryLessonSchema))
    for (const word of ['"truefalse"', '"reason"', 'coordinate_plane']) expect(json).not.toContain(word)
    expect(PrimaryLessonSchema.safeParse(lessonOf({ answerKind: 'choice', answer: 'B', choices: pictures })).success).toBe(false)
    expect(PrimaryLessonSchema.safeParse(lessonOf({ answerKind: 'truefalse', answer: 'true' })).success).toBe(false)
  })

  test('the JSON schema the senior model is handed names the two new kinds', () => {
    const json = JSON.stringify(z.toJSONSchema(SeniorLessonSchema))
    expect(json).toContain('"truefalse"')
    expect(json).toContain('"reason"')
  })
})

describe('letters: a choice is marked by its letter, up to five choices', () => {
  const choices = ['1', '2', '3', '4', '5']
  test('the letters go A to E', () => {
    expect([...CHOICE_LETTERS]).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(parseAnswer('E')).toEqual({ kind: 'choice', letter: 'E' })
    expect(parseAnswer('(e)')).toEqual({ kind: 'choice', letter: 'E' })
    expect(markAnswer('E', 'e').correct).toBe(true)
    expect(markAnswer('D', 'E').correct).toBe(false)
  })

  test('a 5th choice gets the letter E, and E marks right when E is the key', () => {
    const key = q('choice', 'E', { choices })
    expect(finishAnswer(key, 'E')).toEqual({ stored: 'E', correct: true })
    expect(finishAnswer(key, 'e').correct).toBe(true)
    expect(finishAnswer(key, 'D').correct).toBe(false)
    expect(finishAnswer(q('choice', 'D', { choices }), 'E').correct).toBe(false)
    expect(answerProblem(key)).toBeNull()
  })

  test('picture choices are marked by their letter, whatever the pictures are', () => {
    const key = q('choice', 'B', { choices: pictures })
    expect(finishAnswer(key, 'B')).toEqual({ stored: 'B', correct: true })
    expect(finishAnswer(key, 'A').correct).toBe(false)
    expect(finishAnswer(key, 'C').correct).toBe(false)
  })

  test('the label of a picture choice with no words is its letter', () => {
    expect(choiceLabel({ diagram: LINE }, 0)).toBe('Picture A')
    expect(choiceLabel({ diagram: LINE, text: 'the line' }, 2)).toBe('the line')
    expect(choiceLabel('x + 1', 1)).toBe('x + 1')
  })
})

describe('the bug: a question with choices and a kind that is not choice is marked by the letter', () => {
  const choices = ['2', '3', '4']
  test.each([
    ['number', 'B'],
    ['whole', 'B'],
    ['expression', 'B'],
    ['equation', 'B'],
    ['fraction', 'B'],
    ['decimal', 'B'],
  ] as const)('kind %s with choices and key %s: the letter is right, another letter is wrong', (kind, key) => {
    const question = q(kind, key, { choices })
    expect(finishAnswer(question, 'B').correct, `${kind} B`).toBe(true)
    expect(finishAnswer(question, 'A').correct, `${kind} A`).toBe(false)
  })

  test('a key written as the text of a choice (the 3) is the letter of that choice', () => {
    const question = q('number', '3', { choices })
    expect(finishAnswer(question, 'B').correct).toBe(true)
    expect(finishAnswer(question, 'C').correct).toBe(false)
    expect(answerProblem(question)).toBeNull()
  })

  test('the typed text of a choice counts as that choice (a paper answer written in words)', () => {
    const question = q('number', 'B', { choices })
    expect(finishAnswer(question, '3')).toEqual({ stored: 'B', correct: true })
    expect(finishAnswer(question, '4').correct).toBe(false)
  })

  test('the save gate: the key must be a letter that exists, or the text of a choice', () => {
    expect(answerProblem(q('number', 'B', { choices }))).toBeNull()
    expect(answerProblem(q('number', 'D', { choices }))).toBe('answer "D" is not one of the 3 choices')
    expect(answerProblem(q('number', '9', { choices }))).toBe('answer "9" is not one of the 3 choices')
    expect(answerProblem(q('choice', 'B', { choices: ['only one'] }))).toBe('a choice question needs 2 to 5 choices')
    expect(answerProblem(q('choice', 'B', { choices: ['1', '2', '3', '4', '5', '6'] }))).toBe('a choice question needs 2 to 5 choices')
  })

  test('a question without choices is marked by its kind, as before', () => {
    expect(finishAnswer(q('number', '3'), '3').correct).toBe(true)
    expect(finishAnswer(q('number', '3'), 'B').correct).toBe(false)
  })
})

describe('the save gate checks every picture of a choice', () => {
  test('a good set of pictures passes, a picture that makes no sense is a bad answer', () => {
    expect(answerProblem(q('choice', 'B', { choices: pictures }))).toBeNull()
    expect(answerProblem(q('choice', 'B', { choices: [{ diagram: LINE }, { diagram: BAD_GRID }, { text: 'c' }] }))).toBe('choice B picture: the grid needs xMin below xMax')
  })

  test('a choice with neither words nor a picture is a bad answer', () => {
    expect(answerProblem(q('choice', 'A', { choices: [{ diagram: LINE }, {}, { text: 'c' }] }))).toBe('choice B has no words and no picture')
    expect(answerProblem(q('choice', 'A', { choices: [{ diagram: LINE }, { text: '  ' }, { text: 'c' }] }))).toBe('choice B has no words and no picture')
  })
})

describe('true or false', () => {
  test('the key and the answer are read as true or false, in any case', () => {
    for (const yes of ['true', 'True', 'TRUE', ' true ', 'T', 'true.']) expect(readTrueFalse(yes), yes).toBe(true)
    for (const no of ['false', 'False', 'FALSE', 'F', 'false.']) expect(readTrueFalse(no), no).toBe(false)
    for (const other of ['', 'maybe', 'yes', 'B', '1']) expect(readTrueFalse(other), other).toBeNull()
  })

  test('marking: the same side is right, the other side is wrong, anything else is wrong', () => {
    const key = q('truefalse', 'true', { prompt: 'The line y = 2x + 1 passes through (0; 1).' })
    expect(finishAnswer(key, 'True')).toEqual({ stored: 'True', correct: true })
    expect(finishAnswer(key, 'false').correct).toBe(false)
    expect(finishAnswer(key, 'B').correct).toBe(false)
    const no = q('truefalse', 'False')
    expect(finishAnswer(no, 'False').correct).toBe(true)
    expect(finishAnswer(no, 'true').correct).toBe(false)
  })

  test('choices on a true or false question are ignored: it is marked by True or False', () => {
    const key = q('truefalse', 'true', { choices: ['True', 'False'] })
    expect(finishAnswer(key, 'True').correct).toBe(true)
    expect(finishAnswer(key, 'B').correct).toBe(false)
  })

  test('the save gate: the key must be true or false', () => {
    expect(answerProblem(q('truefalse', 'true'))).toBeNull()
    expect(answerProblem(q('truefalse', 'False'))).toBeNull()
    expect(answerProblem(q('truefalse', 'B'))).toBe('answer "B" is not true or false')
    expect(answerProblem(q('truefalse', 'maybe'))).toBe('answer "maybe" is not true or false')
  })
})

describe('geometry reasons', () => {
  test('the list holds the CAPS reasons of the packet', () => {
    for (const reason of [
      'angles on a straight line',
      'vertically opposite angles',
      'angles in the same segment',
      'angle at centre = 2 × angle at circumference',
      'opposite angles of a cyclic quadrilateral',
      'tan-chord theorem',
      'alternate angles, AB ∥ CD',
      'corresponding angles',
      'co-interior angles',
      'sum of angles in a triangle',
      'exterior angle of a triangle',
      'isosceles triangle',
      'Pythagoras',
      'radius ⊥ tangent',
      'line from centre ⊥ chord',
      'equal chords subtend equal angles',
      'midpoint theorem',
      'proportionality theorem',
      'similar triangles (AAA)',
      'congruent triangles (SAS/SSS/AAS/RHS)',
    ]) {
      expect(GEOMETRY_REASONS.some((r) => r.toLowerCase().includes(reason.toLowerCase())), reason).toBe(true)
    }
  })

  test('every reason is short enough to sit in an answer of 60 characters beside a value of 12', () => {
    for (const reason of GEOMETRY_REASONS) expect(reason.length + 3 + 12, reason).toBeLessThanOrEqual(60)
    expect(new Set(GEOMETRY_REASONS.map((r) => r.toLowerCase())).size).toBe(GEOMETRY_REASONS.length)
    for (const reason of GEOMETRY_REASONS) {
      expect(reason).not.toContain(';')
      expect(reason).not.toContain(String.fromCharCode(0x2014))
    }
  })

  test('a reason is found by its exact words, in any case', () => {
    expect(findReason('angles in the same segment')).toBe('angles in the same segment')
    expect(findReason('  Angles IN the same segment. ')).toBe('angles in the same segment')
    expect(findReason('pythagoras')).toBe('Pythagoras')
    expect(findReason('angles in the same')).toBeNull()
    expect(findReason('angles in a segment')).toBeNull()
  })

  test('marking: the exact list item, case-insensitive', () => {
    const key = q('reason', 'angles in the same segment', { prompt: 'Why is ∠B = ∠D?' })
    expect(finishAnswer(key, 'angles in the same segment')).toEqual({ stored: 'angles in the same segment', correct: true })
    expect(finishAnswer(key, 'Angles In The Same Segment').correct).toBe(true)
    expect(finishAnswer(key, 'vertically opposite angles').correct).toBe(false)
    expect(finishAnswer(key, 'angles in the same').correct).toBe(false)
    expect(finishAnswer(key, 'because').correct).toBe(false)
  })

  test('marking with a value: the value and the reason must both be right', () => {
    const key = q('reason', '40; angles in the same segment', { prompt: 'Find ∠B and say why.' })
    expect(finishAnswer(key, '40; angles in the same segment').correct).toBe(true)
    expect(finishAnswer(key, '40°; Angles in the same segment').correct).toBe(true)
    expect(finishAnswer(key, '40,0; angles in the same segment').correct).toBe(true)
    expect(finishAnswer(key, '50; angles in the same segment').correct, 'wrong value').toBe(false)
    expect(finishAnswer(key, '40; vertically opposite angles').correct, 'wrong reason').toBe(false)
    expect(finishAnswer(key, '40').correct, 'no reason').toBe(false)
    expect(finishAnswer(key, 'angles in the same segment').correct, 'no value').toBe(false)
  })

  test('on paper: the value and the reason written in one line are read apart', () => {
    const key = q('reason', '40; angles in the same segment')
    expect(finishAnswer(key, '40° angles in the same segment').correct).toBe(true)
    expect(finishAnswer(key, '40, angles in the same segment').correct).toBe(true)
    expect(finishAnswer(key, 'angles in the same segment 40').correct).toBe(true)
    expect(finishAnswer(key, '45, angles in the same segment').correct).toBe(false)
  })

  test('a value that is a decimal is compared by its value, point or comma', () => {
    const key = q('reason', '6,5; Pythagoras')
    expect(finishAnswer(key, '6.5; Pythagoras').correct).toBe(true)
    expect(finishAnswer(key, '6,50; Pythagoras').correct).toBe(true)
    expect(finishAnswer(key, '6,6; Pythagoras').correct).toBe(false)
  })

  test('split and compose are inverses', () => {
    expect(splitReasonAnswer('40; angles in the same segment')).toEqual({ value: '40', reason: 'angles in the same segment' })
    expect(splitReasonAnswer('Pythagoras')).toEqual({ value: null, reason: 'Pythagoras' })
    expect(splitReasonAnswer('nonsense')).toEqual({ value: null, reason: null })
    expect(composeReasonAnswer({ reason: 'Pythagoras', value: '', withValue: false })).toBe('Pythagoras')
    expect(composeReasonAnswer({ reason: 'Pythagoras', value: '5', withValue: true })).toBe('5; Pythagoras')
    expect(composeReasonAnswer({ reason: 'Pythagoras', value: '', withValue: true }), 'the value box is empty').toBe('')
    expect(composeReasonAnswer({ reason: '', value: '5', withValue: true }), 'no reason picked').toBe('')
    expect(composeReasonAnswer({ reason: '', value: '', withValue: false })).toBe('')
  })

  test('the save gate: the reason must be in the list, and the value of a key must be a number', () => {
    expect(answerProblem(q('reason', 'angles on a straight line'))).toBeNull()
    expect(answerProblem(q('reason', '40; angles in the same segment'))).toBeNull()
    expect(answerProblem(q('reason', '6,5; Pythagoras'))).toBeNull()
    expect(answerProblem(q('reason', '40°; angles on a straight line'))).toBeNull()
    expect(answerProblem(q('reason', '√13; Pythagoras'))).toBe('answer "√13; Pythagoras" has a value that is not a whole number or a decimal')
    expect(answerProblem(q('reason', 'because they are equal'))).toBe('answer "because they are equal" is not a reason from the list')
    expect(answerProblem(q('reason', '40; because they are equal'))).toBe('answer "40; because they are equal" is not a reason from the list')
    expect(answerProblem(q('reason', 'x + 1; Pythagoras'))).toBe('answer "x + 1; Pythagoras" has a value that is not a whole number or a decimal')
    expect(answerProblem(q('reason', ';angles on a straight line'))).toBe('answer ";angles on a straight line" has a value that is not a whole number or a decimal')
  })
})

describe('the senior prompt tells the writer about picks', () => {
  const PROMPT = readFileSync(new URL('../../src/jobs/write_lesson.md', import.meta.url), 'utf8')
  const senior = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 11, country: 'ZA' }))

  test('picture choices, true or false and reasons, with when to use each', () => {
    for (const phrase of [
      '`truefalse`',
      '`reason`',
      'Which graph is',
      'which transformation',
      'A to E',
      'fewer than 1 in 4',
      'only in Euclidean geometry',
      'AB and CD',
    ]) expect(senior, phrase).toContain(phrase)
  })

  test('every reason of the list is in the prompt, word for word', () => {
    for (const reason of GEOMETRY_REASONS) expect(senior, reason).toContain(`\`${reason}\``)
  })

  test('the prompt of a senior class says the choice letters go A to E, and never A to D', () => {
    expect(senior).toContain('`choice` (a letter A to E)')
    expect(senior).not.toContain('(a letter A to D)')
  })

  test('a class that is not senior never meets it', () => {
    const grade6 = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 6, country: 'ZA' }))
    expect(grade6).toBe(PROMPT)
    const grade5 = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 5, country: 'ZA' }))
    for (const word of ['truefalse', 'reason', 'A to E']) expect(grade5).not.toContain(word)
  })

  test('no em dash in the new lines', () => {
    expect(senior).not.toContain(String.fromCharCode(0x2014))
  })
})
