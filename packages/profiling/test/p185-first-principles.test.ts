import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import {
  checkFirstPrinciples,
  derivativeOf,
  firstPrinciplesAnswer,
  firstPrinciplesKeyProblem,
  firstPrinciplesLines,
  firstPrinciplesProblem,
  functionName,
  holdsH,
  tidyFirstPrinciples,
} from '../src/logic/answers/first-principles'
import { finishAnswer, LINE_MAX_LENGTH, workedLineOf, readMath, sameExpression } from '../src/logic/meaning'
import { SeniorQuestionSchema, type FirstPrinciplesSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P185: a derivative found from first principles, line by line (the "Write steps line by line" board). The first line is given; each line the learner writes
// must follow from the one before, the limit is taken only once h can be 0, and the last line is f′(x). Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const spec: FirstPrinciplesSpec = { f: '2x^2 - 3x' }
const KEY = '(2(x + h)^2 - 3(x + h) - (2x^2 - 3x))/h; (4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x - 3'
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Determine f′(x) from first principles if f(x) = 2x² − 3x.',
  render: 'text',
  steps: ['f(x + h) − f(x) = 4xh + 2h² − 3h', 'divide by h, then let h go to 0'],
  answer: KEY,
  answerKind: 'list',
  firstPrinciples: spec,
  difficulty: 3,
  why: 'The derivative is the limit of the gradient between x and x + h.',
  rightWay: 'Put x + h into f, take away f(x), divide by h, then let h be 0.',
  ...over,
})
const check = (answer: string, derivative: string | null = '4x - 3') => checkFirstPrinciples(spec, answer, workedLineOf, derivative)

describe('a derivative from first principles, line by line', () => {
  test('a good question passes; the senior schema takes it', () => {
    expect(firstPrinciplesProblem(spec, workedLineOf)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('a line of working may be longer than an answer: up to 100 characters', () => {
    const long = '(x^3 + 3x^2h + 3xh^2 + h^3 - 2x^2 - 4xh - 2h^2 - x^3 + 2x^2)/h'
    expect(long.length).toBeGreaterThan(60)
    expect(LINE_MAX_LENGTH).toBe(100)
    expect(readMath(long)).toBeNull()
    expect(workedLineOf(long)?.letters.sort()).toEqual(['h', 'x'])
    expect(sameExpression(long, '3x^2 + 3xh + h^2 - 4x - 2h')).toBe(true)
  })

  test('each line is right when it follows, the limit is taken once h can be 0, and it ends on f′(x)', () => {
    expect(check(KEY)).toMatchObject({ ok: true, limit: 3, under: [true, true, true, false] })
    // Any way through: expanded first, h taken out as a factor, cancelled, then the limit, the last line in any order.
    expect(check('(2x^2 + 4xh + 2h^2 - 3x - 3h - 2x^2 + 3x)/h; h(4x + 2h - 3)/h; 4x + 2h - 3; -3 + 4x').ok).toBe(true)
    // The last line is f′(x) as simply as it goes.
    expect(check('(2x^2 + 4xh + 2h^2 - 3x - 3h - 2x^2 + 3x)/h; h(4x + 2h - 3)/h; 4x + 2h - 3; 3 + 4x - 6').ok).toBe(false)
  })

  test('the check says which line does not follow, and why', () => {
    // The first line is f(x + h) − f(x), all over h, before h is cancelled.
    expect(check('(4xh + 2h^2 + 3h)/h; 4x + 2h + 3; 4x + 3')).toMatchObject({ wrong: 0, why: 'start' })
    expect(check('4x + 2h - 3; 4x - 3 + 2h; 4x - 3')).toMatchObject({ wrong: 0, why: 'start' })
    // A line that is not the line before it.
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2h + 3; 4x + 3')).toMatchObject({ wrong: 1, why: 'equal' })
    // The limit taken while h is still under the fraction line: 0/0.
    expect(check('(4xh + 2h^2 - 3h)/h; 4x - 3; -3 + 4x')).toMatchObject({ wrong: 1, why: 'soon', limit: null })
    // h is gone after the limit, and does not come back.
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x - 3; 4x - 3 + h')).toMatchObject({ wrong: 3, why: 'back' })
    // Only x and h.
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2a - 3; 4x - 3')).toMatchObject({ wrong: 1, why: 'letter' })
    // A line that cannot be read.
    expect(check('(4xh + 2h^2 - 3h)/h; (4x + 2h - 3; 4x - 3')).toMatchObject({ unread: 1, ok: false })
  })

  test('the limit of a line with no h left in it for any h is that line: lim 3h/h = 3', () => {
    const line = { f: '3x + 1' }
    expect(checkFirstPrinciples(line, '(3(x + h) + 1 - (3x + 1))/h; 3h/h; 3', workedLineOf, '3').ok).toBe(true)
  })

  test('it stops too soon, or ends on a line that can be simpler', () => {
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; h(4x + 2h - 3)/h')).toMatchObject({ wrong: null, reached: false, ok: false })
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x + 2(0) - 3')).toMatchObject({ wrong: null, limit: 2, reached: false, ok: false })
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; (8x - 6)/2')).toMatchObject({ wrong: null, reached: false })
    expect(check('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; -3 + 4x')).toMatchObject({ reached: true, ok: true })
    expect(check('(4xh + 2h^2 - 3h)/h; 4x - 3 + 2h')).toMatchObject({ enough: false, ok: false })
  })

  test('the lines are read without the words around them, as on paper', () => {
    expect(firstPrinciplesLines("f'(x) = lim_(h→0) (f(x + h) - f(x))/h = lim h→0 (4xh + 2h^2 - 3h)/h\n= lim (4x + 2h - 3) = 4x - 3")).toEqual(['(4xh + 2h^2 - 3h)/h', '(4x + 2h - 3)', '4x - 3'])
    // f(x + h) and f(x + h) − f(x) found on their own first: the lines are taken from the first with lim in front of it.
    const apart = 'f(x + h) = 2(x + h)^2 - 3(x + h)\n= 2x^2 + 4xh + 2h^2 - 3x - 3h\nf(x + h) - f(x) = 4xh + 2h^2 - 3h\nf′(x) = lim (4xh + 2h^2 - 3h)/h\n= lim (4x + 2h - 3)\n= 4x - 3'
    expect(firstPrinciplesLines(apart)).toEqual(['(4xh + 2h^2 - 3h)/h', '(4x + 2h - 3)', '4x - 3'])
    expect(check(apart).ok).toBe(true)
    expect(firstPrinciplesLines("g'(x) = 3; dy/dx = 3", 'g')).toEqual(['3', '3'])
    expect(firstPrinciplesAnswer(['a', ' ', 'b'])).toBe('')
    expect(firstPrinciplesAnswer(['a', 'b', '', 'c'])).toBe('a; b; c')
    expect(holdsH('4x + 2h - 3', workedLineOf)).toBe(true)
    expect(holdsH('4x - 3', workedLineOf)).toBe(false)
    expect(holdsH('(4x + 2h', workedLineOf)).toBe(true)
    expect(derivativeOf(spec, KEY)).toBe('4x - 3')
    expect(functionName({ name: 'g' })).toBe('g')
    expect(functionName({})).toBe('f')
  })

  test('it is marked so: right by any way through, wrong when a line does not follow or it stops before f′(x)', () => {
    const q = tidyFirstPrinciples(question())
    expect(q.ordered).toBe(true)
    expect(finishAnswer(q, KEY).correct).toBe(true)
    expect(finishAnswer(q, '(2(x + h)^2 - 3(x + h) - (2x^2 - 3x))/h; (4xh + 2h^2 - 3h)/h; 4x + 2h - 3; f′(x) = 4x - 3').correct).toBe(true)
    expect(finishAnswer(q, '(4xh + 2h^2 - 3h)/h; 4x - 3; -3 + 4x').correct).toBe(false)
    expect(finishAnswer(q, '(4xh + 2h^2 - 3h)/h; 4x + 2h - 3').correct).toBe(false)
  })

  test('other functions: a hyperbola and a cubic graph', () => {
    const hyperbola = { f: '2/x' }
    const H = '(2/(x + h) - 2/x)/h; (2x - 2(x + h))/(x(x + h)h); -2h/(x(x + h)h); -2/(x(x + h)); -2/x^2'
    expect(firstPrinciplesKeyProblem({ answer: H, answerKind: 'list', firstPrinciples: hyperbola }, workedLineOf)).toBeNull()
    const cubic = { f: 'x^3 - 2x^2' }
    const C = '((x + h)^3 - 2(x + h)^2 - (x^3 - 2x^2))/h; (x^3 + 3x^2h + 3xh^2 + h^3 - 2x^2 - 4xh - 2h^2 - x^3 + 2x^2)/h; (3x^2h + 3xh^2 + h^3 - 4xh - 2h^2)/h; 3x^2 + 3xh + h^2 - 4x - 2h; 3x^2 - 4x'
    expect(firstPrinciplesKeyProblem({ answer: C, answerKind: 'list', firstPrinciples: cubic }, workedLineOf)).toBeNull()
    expect(answerProblem(question({ prompt: 'Determine g′(x) from first principles if g(x) = x³ − 2x².', firstPrinciples: { ...cubic, name: 'g' }, answer: C }))).toBeNull()
  })

  test('a function or a key that cannot be used is refused', () => {
    expect(firstPrinciplesProblem({ f: '2x^2 - 3x', name: 'h' }, workedLineOf)).toContain('one small letter')
    expect(firstPrinciplesProblem({ f: '2x^2 - (3x' }, workedLineOf)).toContain('maths in x')
    expect(firstPrinciplesProblem({ f: '2t^2' }, workedLineOf)).toContain('x is its one letter')
    expect(firstPrinciplesProblem({ f: 'sqrt(-x^2 - 1)' }, workedLineOf)).toContain('a value at most numbers')
    const key = (answer: string, answerKind = 'list') => firstPrinciplesKeyProblem({ answer, answerKind, firstPrinciples: spec }, workedLineOf)
    expect(key(KEY)).toBeNull()
    expect(key('4x - 3', 'expression')).toContain('list answer')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x - 3 + 2h')).toContain('3 to 7 lines')
    expect(key('(4xh + 2h^2 - 3h)/h; (4x + 2h - 3; 4x - 3')).toContain('line 2 of the answer cannot be read')
    expect(key('(4xh + 2h^2 + 3h)/h; 4x + 2h + 3; 4x + 3')).toContain('the first line of the answer is (f(x + h) - f(x))/h')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x + 2h + 3; 4x + 3')).toContain('line 2 of the answer is not equal to line 1')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x - 3; -3 + 4x')).toContain('takes the limit too soon')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x - 3; 4x - 3 + h')).toContain('h in it after the limit')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x + 2a - 3; 4x - 3')).toContain('a letter that is not x or h')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; h(4x + 2h - 3)/h')).toContain('the last line of the answer is the derivative')
    expect(key('(4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x - 3; 4x - 3')).toContain('written differently')
    expect(answerProblem(question({ answer: '(4xh + 2h^2 - 3h)/h; 4x - 3; -3 + 4x' }))).toContain('firstPrinciples:')
    expect(answerProblem(question({ choices: [KEY, '4x'] }))).toContain('no picture and no choices')
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 12, country: 'ZA' }))
    expect(text).toContain('To have the learner find a derivative from first principles')
    expect(text).toContain('`(2(x + h)^2 - 3(x + h) - (2x^2 - 3x))/h; (4xh + 2h^2 - 3h)/h; 4x + 2h - 3; 4x - 3`')
  })
})
