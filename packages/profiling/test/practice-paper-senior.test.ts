import { describe, expect, test } from 'vitest'
import type { Question } from '../src/schemas/lesson'
import { savePracticeAnswers } from '../src/tools/save/save-practice-answers'
import { CHILD, ctxFor, LESSON, ON_PAPER, QUESTIONS, readOf, SESSION } from './helpers/practice'
import { practiceWorld } from './helpers/practice'

// P86: a practice of a senior class answered on paper. Code finishes and marks each written answer by the rule of its question: the four new
// kinds by meaning, the old kinds as before. The tables are in memory: no database, no model.

const q = (answerKind: Question['answerKind'], prompt: string, answer: string, over: Partial<Question> = {}): Question => ({
  prompt, render: 'text', answer, answerKind, difficulty: 1, why: `why ${prompt}`, rightWay: `right way ${prompt}`, ...over,
})

/** The lesson of `practice.ts` with the five questions that go on paper (0, 1, 5, 6, 10) replaced by algebra of every new kind and one old kind. */
const SENIOR: Question[] = QUESTIONS.map((x, i) => {
  if (i === 0) return q('expression', 'Simplify x + x + 3', '2x + 3')
  if (i === 1) return q('equation', 'Solve x^2 - 2x - 3 = 0', 'x = 3 or x = -1')
  if (i === 5) return q('point', 'Where does the line cut the y-axis?', '(0; -3)', { difficulty: 2 })
  if (i === 6) return q('number', 'What is 3 - 6?', '-3', { difficulty: 2 })
  if (i === 10) return q('expression', 'Factorise x^2 - 4', '(x+2)(x-2)', { difficulty: 3, form: 'factorised' })
  return x
})

const world = () => practiceWorld({ lessons: [{ id: LESSON, child_id: CHILD, topic_name: 'Algebra', content: { questions: SENIOR } }] })
const save = async (answers: [number, string][]) => {
  const db = world()
  const out = (await savePracticeAnswers.run(ctxFor(db), { sessionId: SESSION, read: readOf(answers) })) as { right: number; total: number; unread: number[] }
  const rows = (db.tables.session_items ?? []).filter((r) => r.session_id === SESSION && r.phase === 'try').sort((a, b) => Number(a.position) - Number(b.position))
  return { out, rows }
}

describe('save_practice_answers marks a senior lesson by meaning', () => {
  test('the five paper questions are the ones that were replaced', () => {
    expect(ON_PAPER).toEqual([0, 1, 5, 6, 10])
  })

  test('five answers written differently from the keys are all right, and are stored as written', async () => {
    const { out, rows } = await save([[1, '3 + 2x'], [2, 'x=-1; x=3'], [3, '(0, -3)'], [4, '\u22123'], [5, '(x - 2)(x + 2)']])
    expect(out).toEqual({ right: 5, total: 5, unread: [] })
    expect(rows.map((r) => r.answer)).toEqual(['3 + 2x', 'x=-1; x=3', '(0, -3)', '\u22123', '(x - 2)(x + 2)'])
    expect(rows.map((r) => r.correct)).toEqual([true, true, true, true, true])
  })

  test('wrong answers are wrong: one root of two, a point turned round, a sign lost, the wrong form', async () => {
    const { out, rows } = await save([[1, '2x + 4'], [2, 'x = 3'], [3, '(-3; 0)'], [4, '3'], [5, 'x^2 - 4']])
    expect(out).toEqual({ right: 0, total: 5, unread: [] })
    expect(rows.map((r) => r.correct)).toEqual([false, false, false, false, false])
  })

  test('the stored question keeps its kind and its form', async () => {
    const { rows } = await save([[1, '2x + 3'], [2, 'x = 3'], [3, '(0; -3)'], [4, '-3'], [5, '(x+2)(x-2)']])
    expect(rows.map((r) => (r.question as Question).answerKind)).toEqual(['expression', 'equation', 'point', 'number', 'expression'])
    expect((rows[4]!.question as Question).form).toBe('factorised')
  })

  test('an answer read with low confidence is still stored empty and counted wrong', async () => {
    const db = world()
    const out = (await savePracticeAnswers.run(ctxFor(db), { sessionId: SESSION, read: readOf([[1, '2x + 3', 0.3], [2, 'x = 3 or x = -1']]) })) as { right: number; unread: number[] }
    expect(out.right).toBe(1)
    expect(out.unread).toEqual([1, 3, 4, 5])
  })
})
