import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { checkProof, proofAnswer, proofKeyProblem, proofLines, proofProblem, sameForm, tidyProof } from '../src/logic/answers/proof'
import { finishAnswer, sameExpression } from '../src/logic/meaning'
import { SeniorQuestionSchema, type ProofSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P179: an identity the learner proves line by line (the "Write steps line by line" board). Each line must equal the one before it, and the last the right
// side. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const spec: ProofSpec = { left: 'sin^2 x/(1 - cos x)', right: '1 + cos x' }
const KEY = 'sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x); 1 + cos x'
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Prove that sin²x/(1 − cos x) = 1 + cos x.',
  render: 'text',
  steps: ['sin²x = 1 − cos²x', '1 − cos²x = (1 − cos x)(1 + cos x)'],
  answer: KEY,
  answerKind: 'list',
  proof: spec,
  difficulty: 3,
  why: 'sin²x + cos²x = 1, so sin²x = 1 − cos²x.',
  rightWay: 'Write sin²x as 1 − cos²x, factorise it, then cancel 1 − cos x.',
  ...over,
})

describe('an identity proved line by line', () => {
  test('a good proof question passes; the senior schema takes it', () => {
    expect(proofProblem(spec, sameExpression)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('two lines are the same when they have the same value at the same points, whichever letters each has', () => {
    expect(sameExpression('sin^2 x/(1 - cos x)', '(1 - cos^2 x)/(1 - cos x)')).toBe(true)
    expect(sameExpression('sin^2 x/(1 - cos x)', '(1 + cos^2 x)/(1 - cos x)')).toBe(false)
    expect(sameExpression('sin^2(θ) + cos^2(θ)', '1')).toBe(true)
    expect(sameExpression('1', 'sin^2 x + cos^2 x')).toBe(true)
    expect(sameExpression('tan x', 'sin(x)/cos(x)')).toBe(true)
    expect(sameExpression('(1 - cos x', '1')).toBeNull()
  })

  test('the last line is written as the right side: the same pieces, in any order and with any brackets', () => {
    expect(sameForm('cos x + 1', '1 + cos(x)')).toBe(true)
    expect(sameForm('sin²x', 'sin^2(x)')).toBe(true)
    expect(sameForm('((1 - cos x)(1 + cos x))/(1 - cos x)', '1 + cos x')).toBe(false)
    expect(sameForm('1/cos^2 x', '1 + tan^2 x')).toBe(false)
  })

  test('the lines are read without the words around them', () => {
    expect(proofLines('LHS = a + b; = c\n= d = RHS;')).toEqual(['a + b', 'c', 'd'])
    expect(proofAnswer(['a', ' ', 'b'])).toBe('')
    expect(proofAnswer(['a', 'b', '', 'c'])).toBe('a; b; c')
  })

  test('a proof is right when every line follows and it ends on the right side, by any way', () => {
    const q = tidyProof(question())
    expect(q.ordered).toBe(true)
    expect(finishAnswer(q, KEY).correct).toBe(true)
    expect(finishAnswer(q, 'LHS = sin^2(x)/(1 - cos(x)); = (1 - cos^2(x))/(1 - cos(x)); = (1 + cos(x))(1 - cos(x))/(1 - cos(x)); = 1 + cos(x) = RHS').correct).toBe(true)
    expect(finishAnswer(q, 'sin^2 x/(1 - cos x); (1 + cos^2 x)/(1 - cos x); 1 + cos x').correct).toBe(false)
    expect(finishAnswer(q, 'sin^2 x/(1 - cos x); 1 + cos x').correct).toBe(false)
    expect(finishAnswer(q, 'sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); (1 - cos^2 x)/(1 - cos x)').correct).toBe(false)
  })

  test('the check says which line does not follow, one it cannot read, and whether it ends on the right side', () => {
    expect(checkProof(spec, 'sin^2 x/(1 - cos x); (1 + cos^2 x)/(1 - cos x); 1 + cos x', sameExpression)).toMatchObject({ wrong: 1, unread: null, reached: true, ok: false })
    expect(checkProof(spec, 'cos x; 1; 1 + cos x', sameExpression)).toMatchObject({ wrong: 0 })
    expect(checkProof(spec, 'sin^2 x/(1 - cos x); (1 - cos^2 x/(1 - cos x); 1 + cos x', sameExpression)).toMatchObject({ unread: 1, ok: false })
    expect(checkProof(spec, 'sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x)', sameExpression)).toMatchObject({ wrong: null, reached: false, ok: false })
    expect(checkProof(spec, 'sin^2 x/(1 - cos x); 1 + cos x', sameExpression)).toMatchObject({ wrong: null, reached: true, enough: false, ok: false })
  })

  test('an identity or a key that cannot be used is refused', () => {
    expect(proofProblem({ left: 'sin x', right: 'cos x' }, sameExpression)).toContain('not equal')
    expect(proofProblem({ left: 'sin x', right: 'sin x' }, sameExpression)).toContain('written differently')
    expect(proofProblem({ left: 'sin(x', right: 'cos x' }, sameExpression)).toContain('maths Jemma can read')
    const key = (answer: string, answerKind = 'list') => proofKeyProblem({ answer, answerKind, proof: spec }, sameExpression)
    expect(key(KEY)).toBeNull()
    expect(key('sin^2 x/(1 - cos x); 1 + cos x')).toContain('3 to 6 lines')
    expect(key('sin^2 x/(1 - cos x); (1 + cos^2 x)/(1 - cos x); 1 + cos x')).toContain('line 2 of the answer is not equal to line 1')
    expect(key('cos x; 1; 1 + cos x')).toContain('first line of the answer is not equal to the left side')
    expect(key('sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x)')).toContain('last line of the answer is the right side')
    expect(key('sin^2 x/(1 - cos x); (1 - cos^2 x/(1 - cos x); 1 + cos x')).toContain('line 2 of the answer cannot be read')
    expect(key('1 + cos x', 'expression')).toContain('list answer')
    expect(answerProblem(question({ answer: 'sin^2 x/(1 - cos x); 1 + cos x' }))).toContain('proof:')
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 11, country: 'ZA' }))
    expect(text).toContain('To have the learner prove an identity line by line')
    expect(text).toContain('`sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x); 1 + cos x`')
  })
})
