import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { lineAnswer, lineEnds, lineKeyProblem, lineProblem, markLine, tidyLine } from '../src/logic/answers/line'
import { finishAnswer, readNumber } from '../src/logic/meaning'
import { SeniorQuestionSchema, type LineSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P174: a straight line the learner draws on a grid by tapping two points on it (the "Draw on the picture" board). Any two points on the right line are right.
// Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const grid: LineSpec = { xMin: -6, xMax: 6, yMin: -4, yMax: 4 }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Draw the graph of y = 2x − 1. Tap two points on the line.',
  render: 'text',
  steps: ['x = 0: y = −1', 'x = 2: y = 3'],
  answer: '0; -1; 2; 3',
  answerKind: 'list',
  line: grid,
  difficulty: 2,
  why: 'y = 2x − 1 cuts the y-axis at −1.',
  rightWay: 'Make a table: x = 0 gives y = −1, and x = 2 gives y = 3. Join the points.',
  ...over,
})

describe('a line to draw', () => {
  test('a good grid and key pass; the senior schema takes it', () => {
    expect(lineProblem(grid)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('a bad grid or key is refused', () => {
    expect(lineProblem({ ...grid, xMax: 6.5 })).toContain('whole steps')
    expect(lineProblem({ ...grid, xMin: -15, xMax: 15 })).toContain('at most 20')
    expect(lineKeyProblem({ answer: '0; -1; 0; -1', answerKind: 'list', line: grid }, readNumber)).toContain('two different points')
    expect(lineKeyProblem({ answer: '0; -1; 2; 9', answerKind: 'list', line: grid }, readNumber)).toContain('on a corner')
    expect(lineKeyProblem({ answer: 'y = 2x - 1', answerKind: 'equation', line: grid }, readNumber)).toContain('list answer')
    expect(answerProblem(question({ answer: '0; -1; 2; 9' }))).toContain('line:')
  })

  test('any two points on the right line are right; another line is wrong', () => {
    const q = tidyLine(question())
    expect(q.labels).toEqual(['First x', 'First y', 'Second x', 'Second y'])
    expect(finishAnswer(q, '0; -1; 2; 3').correct).toBe(true)
    expect(finishAnswer(q, '1; 1; 3; 5').correct).toBe(true)
    expect(finishAnswer(q, '2; 3; -1; -3').correct).toBe(true)
    expect(finishAnswer(q, '0; 1; 1; 3').correct).toBe(false)
    expect(markLine('0; -1; 2; 3', '1; 1; 1; 1', readNumber).comparable).toBe(false)
    expect(lineAnswer({ x: 0, y: -1 }, { x: 2, y: 3 })).toBe('0; -1; 2; 3')
    expect(lineAnswer({ x: 0, y: -1 }, null)).toBe('')
  })

  test('the line runs across the grid: its ends are where it meets the edge', () => {
    expect(lineEnds(grid, { x: 0, y: -1 }, { x: 2, y: 3 })).toEqual([{ x: -1.5, y: -4 }, { x: 2.5, y: 4 }])
    expect(lineEnds(grid, { x: 1, y: 0 }, { x: 1, y: 2 })).toEqual([{ x: 1, y: -4 }, { x: 1, y: 4 }])
    expect(lineEnds(grid, { x: -6, y: 2 }, { x: 0, y: 2 })).toEqual([{ x: -6, y: 2 }, { x: 6, y: 2 }])
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 9, country: 'ZA' }))
    expect(text).toContain('To have the learner draw a straight line')
    expect(text).toContain('`0; -1; 2; 3`')
  })
})
