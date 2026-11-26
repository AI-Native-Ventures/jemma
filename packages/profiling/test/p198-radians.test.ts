import { describe, expect, test } from 'vitest'
import { US_RADIANS, renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { familiesOf, generalText, markGeneral, tidyGeneral } from '../src/logic/answers/general'
import { plotKeyInDegrees, plotProblem, sketchName, tidyPlot } from '../src/logic/answers/plot'
import { finishAnswer, inDegreesFrom, readNumber } from '../src/logic'
import { pictureProblem } from '../src/logic/picture'
import { periodText, piText } from '../src/logic/radians'
import { SeniorQuestionSchema, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P198: radians for a class in the US (the "Radians" board): a trig grid marked in π, every solution typed in radians with π, and a picture of a trig graph
// marked in π. The grid keeps its angles in degrees and writes them in π; a frame in radians is turned into degrees to be marked. Senior classes only. No database,
// no network, no model.

const klass = (grade: number, country = 'US') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)

const general = (over: Partial<Question> = {}): Question => ({
  prompt: 'Find all solutions of sin x = 1/2.',
  render: 'text',
  steps: ['sin(π/6) = 1/2', 'x = π/6 or x = π - π/6 = 5π/6'],
  answer: 'π/6; 2π; 5π/6; 2π',
  answerKind: 'list',
  general: { letter: 'x', radians: true },
  difficulty: 3,
  why: 'sin is positive in the first and second quadrants.',
  rightWay: 'Find the first angle, π/6. The second is π - π/6. Add 2kπ to both.',
  ...over,
})

const sketch = (over: Partial<Question> = {}): Question => ({
  prompt: 'Sketch y = sin x for 0 ≤ x ≤ 2π. Tap its 5 key points.',
  render: 'text',
  steps: ['sin 0 = 0, sin(π/2) = 1', 'sin π = 0, sin(3π/2) = -1, sin 2π = 0'],
  answer: '0; 0; π/2; 1; π; 0; 3π/2; -1; 2π; 0',
  answerKind: 'list',
  plot: { xMin: 0, xMax: 360, yMin: -2, yMax: 2, place: ['0', 'π/2', 'π', '3π/2', '2π'], curve: 'trig', xStep: 90, radians: true },
  difficulty: 2,
  why: 'The key points of y = sin x are a quarter turn apart.',
  rightWay: 'Mark 0, π/2, π, 3π/2 and 2π, then join them in a smooth wave.',
  ...over,
})

describe('angles in π', () => {
  test('an angle in degrees is written as a fraction of π, or a decimal when it is none', () => {
    expect([0, 90, 180, 270, 360, 720, 45, 135, 60, 120, 150, -30].map((d) => piText(d))).toEqual(['0', 'π/2', 'π', '3π/2', '2π', '4π', 'π/4', '3π/4', 'π/3', '2π/3', '5π/6', '−π/6'])
    expect(piText(17.4576)).toBe('0.305')
    expect(piText(17.4576, 'za')).toBe('0,305')
  })

  test('a period is said as k times it', () => {
    expect([360, 180, 120, 90].map((d) => periodText(d))).toEqual(['2kπ', 'kπ', '2kπ/3', 'kπ/2'])
    expect(periodText(17.4576)).toBe('k · 0.305')
  })
})

describe('every solution in radians', () => {
  test('a good question passes, and the senior schema takes it', () => {
    expect(answerProblem(general())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(general()).success).toBe(true)
    // A decimal key is checked to 3 places of a radian.
    expect(answerProblem(general({ prompt: 'Find all solutions of sin x = 0.3.', answer: '0.305; 2π; 2.837; 2π' }))).toBeNull()
    // The equation is read in radians: π in the brackets is a half turn.
    expect(answerProblem(general({ prompt: 'Find all solutions of cos(x - π/3) = 1.', answer: 'π/3; 2π' }))).toBeNull()
  })

  test('a key that is not every solution is refused, in radians', () => {
    expect(answerProblem(general({ answer: 'π/6; 2π' }))).toContain('the solution 5π/6 is in no family')
    expect(answerProblem(general({ answer: 'π/3; 2π; 5π/6; 2π' }))).toContain('π/3 is not a solution')
    expect(answerProblem(general({ answer: '30; 360; 150; 360' }))).not.toBeNull()
    expect(answerProblem(general({ answer: 'π/6; 8π; 5π/6; 2π' }))).toContain('at most 4π')
  })

  test('families that give the same angles are right, typed with π or as decimals', () => {
    const q = tidyGeneral(general())
    for (const right of ['π/6; 2π; 5π/6; 2π', '5π/6; 2π; π/6; 2π', '-7π/6; 2π; π/6; 2π', '0.524; 6.283; 2.618; 6.283', 'pi/6; 2pi; 5pi/6; 2pi'])
      expect(finishAnswer(q, right).correct, right).toBe(true)
    for (const wrong of ['π/6; 2π', 'π/6; π', '30; 360; 150; 360']) expect(finishAnswer(q, wrong).correct, wrong).toBe(false)
    expect(markGeneral('π/6; 2π; 5π/6; 2π', '5π/6; 2π; π/6; 2π', readNumber, true)).toEqual({ correct: true, comparable: true })
  })

  test('they are said in radians', () => {
    expect(generalText(familiesOf('π/6; 2π; 5π/6; 2π', inDegreesFrom(readNumber))!, 'x', true)).toBe('x = π/6 + 2kπ or x = 5π/6 + 2kπ')
    expect(generalText(familiesOf('-π/4; π', inDegreesFrom(readNumber))!, 'x', true)).toBe('x = −π/4 + kπ')
  })
})

describe('a trig grid marked in π', () => {
  test('a good sketch passes with its key in π or in degrees, and is kept in degrees', () => {
    expect(answerProblem(sketch())).toBeNull()
    expect(answerProblem(sketch({ answer: '0; 0; 90; 1; 180; 0; 270; -1; 360; 0' }))).toBeNull()
    expect(plotKeyInDegrees(sketch(), readNumber).answer).toBe('0; 0; 90; 1; 180; 0; 270; -1; 360; 0')
    expect(tidyPlot(plotKeyInDegrees(sketch(), readNumber)).labels).toHaveLength(10)
  })

  test('its equation is read in radians', () => {
    const cos = sketch({ prompt: 'Sketch y = sin(x + π/2) for 0 ≤ x ≤ 2π. Tap its 5 key points.', answer: '0; 1; π/2; 0; π; -1; 3π/2; 0; 2π; 1' })
    expect(answerProblem(cos)).toBeNull()
    expect(answerProblem(sketch({ answer: '0; 0; π/2; -1; π; 0; 3π/2; 1; 2π; 0' }))).toContain('(π/2; -1) is not on the graph')
  })

  test('a typed answer in degrees or in π is marked by its points', () => {
    const q = tidyPlot(sketch())
    expect(finishAnswer(q, '0; 0; 90; 1; 180; 0; 270; -1; 360; 0').correct).toBe(true)
    expect(finishAnswer(q, '0; 0; 90; -1; 180; 0; 270; 1; 360; 0').correct).toBe(false)
  })

  test('only a trig grid is marked in π, and its points are said in π', () => {
    expect(plotProblem({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, place: ['A'], radians: true })).toContain('only a trig graph')
    expect(sketchName({ x: 90, y: 1 }, true, true)).toBe('(π/2 ; 1)')
    expect(sketchName({ x: 270, y: -1 }, true, true)).toBe('(3π/2 ; −1)')
  })

  test('a picture of a trig graph may be marked in π, and only that', () => {
    expect(pictureProblem({ kind: 'coordinate_plane', xMin: 0, xMax: 360, yMin: -2, yMax: 2, graphs: [{ type: 'trig', fn: 'sin' }], radians: true })).toBeNull()
    expect(pictureProblem({ kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 1, c: 0 }], radians: true })).toContain('only a grid of trig graphs')
  })

  test('graphs to match read their equations in radians', () => {
    const graphMatch = { xMin: 0, xMax: 360, yMin: -2, yMax: 2, graphs: [{ type: 'trig' as const, fn: 'sin' as const }, { type: 'trig' as const, fn: 'cos' as const }], equations: ['y = sin(x + π/2)', 'y = sin x'], radians: true }
    const q: Question = { ...sketch(), plot: undefined, prompt: 'Match each graph to its equation.', answer: '2; 1', graphMatch, steps: ['sin(x + π/2) = cos x', 'Graph 1 is y = sin x'] }
    expect(answerProblem(q)).toBeNull()
  })
})

describe('the lesson writer', () => {
  test('a class of Grades 11 and 12 in the US is told about radians, and no other', () => {
    const say = (c: ReturnType<typeof klass>) => renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', c)
    expect(say(klass(12))).toContain(US_RADIANS)
    expect(say(klass(11))).toContain('`radians: true`')
    expect(say(klass(10))).not.toContain('radians: true')
    expect(say(klass(12, 'ZA'))).not.toContain('radians: true')
    expect(say(klass(12, 'KE'))).not.toContain('radians: true')
    expect(US_RADIANS).not.toMatch(LONG_DASH)
  })
})
