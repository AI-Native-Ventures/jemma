import { MemoryStore } from '../src/ai'
import { describe, expect, test } from 'vitest'
import type { ToolContext } from '../src/tools/context'
import { markPaper } from '../src/tools/save/mark-paper'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// P86, decision 2g: the class test path. Where the old reader cannot compare (a key or an answer that is text), code now also tries the reader
// by meaning: when it reads both and they are equal, the answer is right. Every other outcome is as it was: a doubtful answer goes to the teacher.
// The tables are in memory: no database, no model.

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const TEST = '33333333-3333-4333-8333-333333333333'
const TEACHER = '44444444-4444-4444-8444-444444444444'
const CHILD = '66666666-6666-4666-8666-666666666666'
const PAPER = '77777777-7777-4777-8777-777777777777'

const KEYS = ['-3', '2x + 3', 'x = 3 or x = -1', '(2; -3)', '3/4', '15%', 'A']
const key = (n: number, answer: string) => ({ n, prompt: `Question ${n}`, answer, marks: 1, topicName: 'Algebra', confidence: 1 })

const world = (): MemoryDb =>
  memoryDb({
    schools: [{ id: SCHOOL }],
    classes: [{ id: CLASS, school_id: SCHOOL, teacher_id: TEACHER, subject: 'Mathematics', grade: 10 }],
    tests: [{ id: TEST, class_id: CLASS, title: 'Class Test 1: Algebra' }],
    children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina', last_name: 'Dlamini' }],
    enrolments: [{ class_id: CLASS, child_id: CHILD }],
    answer_keys: [{ test_id: TEST, status: 'approved', items: KEYS.map((a, i) => key(i + 1, a)) }],
    papers: [{ id: PAPER, test_id: TEST, child_id: null, owner: 'teacher', status: 'reading', error: null, name_read: null }],
    curriculum_maps: [], topics: [], needs_you_items: [], question_results: [], activity_log: [], parent_links: [],
  })

const ctx = (db: MemoryDb): ToolContext => ({ db, schoolId: SCHOOL, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date('2026-11-14T10:00:00Z') })

const run = async (answers: string[], confidence = 0.95) => {
  const db = world()
  const read = {
    nameAsWritten: 'Amina Dlamini',
    nameConfidence: 0.95,
    pageUsable: true,
    answers: answers.map((a, i) => ({ n: i + 1, answerAsRead: a, confidence: confidence })),
  }
  const out = (await markPaper.run(ctx(db), { paperId: PAPER, read })) as { total: number; unsure: number[]; status: string }
  const rows = [...(db.tables.question_results ?? [])].sort((a, b) => Number(a.n) - Number(b.n))
  return { out, rows, db }
}

describe('a class test of a senior class: answers that mean the key are right', () => {
  test('a minus sign, another way of writing an expression, an equation, a point and a percent are all marked right', async () => {
    const { out, rows } = await run(['\u22123', '3 + 2x', 'x=-1; x=3', '(2, -3)', '6/8', '15', 'a'])
    expect(rows.map((r) => r.correct)).toEqual([true, true, true, true, true, true, true])
    expect(out).toMatchObject({ total: 7, unsure: [], status: 'marked' })
  })
})

describe('everything else is as it was', () => {
  test('a wrong answer that the reader by meaning can read is still sent to the teacher, not marked wrong with confidence', async () => {
    const { out, rows } = await run(['3', '2x + 4', 'x = 3', '(-3; 2)', '2/3', '16', 'B'])
    expect(rows.map((r) => r.correct)).toEqual([false, false, false, false, false, false, false])
    // The first four and the percent are text for the old reader: they cannot be compared, so they are unsure, as before. The fraction and the letter are compared.
    expect(out.unsure).toEqual([1, 2, 3, 4, 6])
    expect(out.status).toBe('needs_you')
  })

  test('a doubtful read (low confidence) is unsure even when it means the key', async () => {
    const { out } = await run(['\u22123', '3 + 2x', 'x=-1; x=3', '(2, -3)', '6/8', '15', 'A'], 0.5)
    expect(out.unsure).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('an answer of the old kinds is marked exactly as before', async () => {
    const { rows } = await run(['3', '2x + 3', 'x = 3 or x = -1', '(2; -3)', '6/8', '15', 'a'])
    expect(rows[0]).toMatchObject({ correct: false })
    expect(rows[4]).toMatchObject({ correct: true })
    expect(rows[6]).toMatchObject({ correct: true })
  })

  test('words are not algebra: a misspelt word is not made right by the reader by meaning', async () => {
    const db = world()
    db.tables.answer_keys![0]!.items = [key(1, 'angle')]
    const read = { nameAsWritten: 'Amina Dlamini', nameConfidence: 0.95, pageUsable: true, answers: [{ n: 1, answerAsRead: 'angel', confidence: 0.95 }] }
    await markPaper.run(ctx(db), { paperId: PAPER, read })
    expect(db.tables.question_results![0]).toMatchObject({ correct: false })
  })
})
