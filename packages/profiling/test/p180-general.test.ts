import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { familiesOf, generalAnswer, generalKeyProblem, generalProblem, generalText, markGeneral, solutionsInTurn, tidyGeneral } from '../src/logic/answers/general'
import { degreeEquationOf, finishAnswer, readNumber } from '../src/logic/meaning'
import { SeniorQuestionSchema, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P180: every solution of a trig equation, typed as families: an angle and how often it comes back (the "Type every solution" board). Families that give the
// same angles are right. The key is checked against the equation in the question. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Find the general solution of sin θ = 0,5.',
  render: 'text',
  steps: ['sin 30° = 0,5', 'θ = 30° or θ = 180° − 30° = 150°'],
  answer: '30; 360; 150; 360',
  answerKind: 'list',
  general: { letter: 'θ' },
  difficulty: 3,
  why: 'sin is positive in the first and second quadrants.',
  rightWay: 'Find the first angle, 30°. The second is 180° − 30°. Add k · 360° to both.',
  ...over,
})
const solutions = (text: string, letter = 'θ') => solutionsInTurn(degreeEquationOf(text, letter)!).map((r) => Math.round(r * 100) / 100)

describe('every solution of a trig equation', () => {
  test('a good question passes; the senior schema takes it', () => {
    expect(generalProblem({ letter: 'θ' })).toBeNull()
    expect(generalProblem({})).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('the equation of the question is read in degrees, and its solutions in one turn found', () => {
    expect(solutions('Find the general solution of sin θ = 0,5.')).toEqual([30, 150])
    expect(solutions('Find the general solution of tan θ = 1.')).toEqual([45, 225])
    expect(solutions('Find the general solution of 2 cos x + 1 = 0.', 'x')).toEqual([120, 240])
    expect(solutions('Find the general solution of sin 2θ = 0,5.')).toEqual([15, 75, 195, 255])
    expect(solutions('Find the general solution of cos(θ + 30°) = 0,5.')).toEqual([30, 270])
    expect(solutions('Find the general solution of sin θ = 2/3, correct to 2 decimal places.')).toEqual([41.81, 138.19])
    expect(degreeEquationOf('Solve for θ.', 'θ')).toBeNull()
  })

  test('families that give the same angles are right, however they are written', () => {
    const q = tidyGeneral(question())
    expect(q.ordered).toBe(true)
    expect(finishAnswer(q, '30; 360; 150; 360').correct).toBe(true)
    expect(finishAnswer(q, '150; 360; 30; 360').correct).toBe(true)
    expect(finishAnswer(q, '30; 360; -210; 360').correct).toBe(true)
    expect(finishAnswer(q, '390; 360; 150; 720; 510; 720').correct).toBe(true)
    expect(finishAnswer(q, '30; 360').correct).toBe(false)
    expect(finishAnswer(q, '30; 180').correct).toBe(false)
    expect(markGeneral('45; 180', '45; 360; 225; 360', readNumber)).toEqual({ correct: true, comparable: true })
    expect(markGeneral('30; 360', '30; 0', readNumber)).toEqual({ correct: false, comparable: true })
    expect(markGeneral('30; 360', 'thirty', readNumber)).toEqual({ correct: false, comparable: false })
  })

  test('a key that is not every solution of the equation is refused', () => {
    const key = (answer: string, prompt = question().prompt, letter = 'θ') => generalKeyProblem({ prompt, answer, answerKind: 'list', general: { letter } }, readNumber, degreeEquationOf)
    expect(key('30; 360; 150; 360')).toBeNull()
    expect(key('30; 360')).toContain('the solution 150° is in no family')
    expect(key('30; 360; 210; 360')).toContain('210° is not a solution')
    expect(key('45; 180', 'Find the general solution of tan θ = 1.')).toBeNull()
    expect(key('120; 360; -120; 360', 'Find the general solution of 2 cos x + 1 = 0.', 'x')).toBeNull()
    expect(key('30; 360', 'Find the general solution of sin θ = 2.')).toContain('no solution')
    expect(key('30; 360', 'Solve the equation.')).toContain('the question says the equation')
    expect(key('30; 0; 150; 360')).toContain('more than 0°')
    expect(key('30; 360; 150')).toContain('angle and the period of each family')
    expect(generalProblem({ letter: 'th' })).toContain('one letter')
    expect(answerProblem(question({ answer: '30; 360' }))).toContain('general:')
  })

  test('the frame gives its families once each is filled; families are said with a decimal comma', () => {
    expect(generalAnswer([{ angle: '30', period: '360' }, { angle: '', period: '' }])).toBe('30; 360')
    expect(generalAnswer([{ angle: '30', period: '360' }, { angle: '150', period: '' }])).toBe('')
    expect(generalAnswer([{ angle: '30°', period: '360°' }, { angle: '150', period: '360' }])).toBe('30; 360; 150; 360')
    expect(generalText(familiesOf('30; 360; 41,81; 360; -30; 180', readNumber)!, 'θ')).toBe('θ = 30° + k · 360° or θ = 41,81° + k · 360° or θ = −30° + k · 180°')
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 11, country: 'ZA' }))
    expect(text).toContain('To have the learner give the general solution of a trig equation')
    expect(text).toContain('`30; 360; 150; 360`')
  })
})
