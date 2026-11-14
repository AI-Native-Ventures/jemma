import { readFileSync } from 'node:fs'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, test } from 'vitest'
import { runJobReadPaper } from '../src/jobs/cloud/read-paper'
import type { PaperRead } from '../src/schemas/papers'
import { CHILD, ctxFor, EVENT, FIVE_RIGHT, LESSON, practiceWorld, QUESTIONS, readOf, SCHOOL, SESSION } from './helpers/practice'

// P86, decision 6d: the reader of a practice answered on paper is told to keep algebra as written when the class is a senior one (Mathematics,
// Grades 7 to 12). A class test and a homework photo of the same class, and every other class, are read with the prompt they always had.
// The model is a stand-in that records what it was asked. No database, no network, no live model.

const PROMPT = readFileSync(new URL('../src/jobs/read_paper.md', import.meta.url), 'utf8')
const ALGEBRA = 'Keep algebra as written: letters, powers as `^` or `²`, minus signs, brackets and `√`.'
const CLASS = '22222222-2222-4222-8222-222222222222'
const MAP = '44444444-4444-4444-8444-444444444444'
const TOPIC = '66666666-6666-4666-8666-666666666666'

const systemOf = (calls: { prompt: { role: string; content: unknown }[] }[]) => calls[0]!.prompt.find((m) => m.role === 'system')!.content as string

function modelAnswering(read: PaperRead, calls: { prompt: { role: string; content: unknown }[] }[]) {
  return new MockLanguageModelV4({
    modelId: 'mock',
    doGenerate: async (options: unknown) => {
      calls.push(options as (typeof calls)[number])
      return {
        content: [{ type: 'text', text: JSON.stringify(read) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      } as never
    },
  })
}

/** The practice world of a class of this subject, grade and country: the session's topic belongs to a map of the class, and the child is enrolled. */
const classWorld = (subject: string, grade: number, country: string) =>
  practiceWorld({
    sessions: [{ id: SESSION, child_id: CHILD, status: 'in_progress', lesson_id: LESSON, topic_id: TOPIC, topic_name: 'Equivalent fractions', planned_for: '2026-11-14' }],
    topics: [{ id: TOPIC, map_id: MAP, name: 'Equivalent fractions', family: 'fractions' }],
    curriculum_maps: [{ id: MAP, class_id: CLASS }],
    classes: [{ id: CLASS, school_id: SCHOOL, subject, grade, teacher_id: null }],
    schools: [{ id: SCHOOL, country }],
    enrolments: [{ class_id: CLASS, child_id: CHILD }],
    lessons: [{ id: LESSON, child_id: CHILD, topic_name: 'Equivalent fractions', content: { questions: QUESTIONS } }],
  })

const readPractice = async (subject: string, grade: number, country: string) => {
  const calls: { prompt: { role: string; content: unknown }[] }[] = []
  await runJobReadPaper(ctxFor(classWorld(subject, grade, country)), EVENT, { sessionId: SESSION }, { model: modelAnswering(readOf(FIVE_RIGHT), calls), prompt: PROMPT })
  return systemOf(calls)
}

describe('a practice answered on paper', () => {
  test('a Grade 10 South African class: the reader is told to keep algebra as written', async () => {
    const system = await readPractice('Mathematics', 10, 'ZA')
    expect(system.startsWith('Subject: Mathematics. Grade: 10. Country: South Africa.\n\n')).toBe(true)
    expect(system).toContain(`and money with its \`R\`. ${ALGEBRA}`)
  })

  test('a Grade 10 class in Kenya: the currency sign and the algebra sentence', async () => {
    const system = await readPractice('Mathematics', 10, 'KE')
    expect(system).toContain(`money with its currency sign. ${ALGEBRA}`)
  })

  test('the demo class (Mathematics, Grade 6, South Africa) is read with the file, byte for byte', async () => {
    expect(await readPractice('Mathematics', 6, 'ZA')).toBe(PROMPT)
  })

  test('a Grade 4 class and a Grade 10 science class are not told anything about algebra', async () => {
    expect(await readPractice('Mathematics', 4, 'ZA')).not.toContain('Keep algebra')
    expect(await readPractice('Natural Sciences', 10, 'ZA')).not.toContain('Keep algebra')
  })
})
