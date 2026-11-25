import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { MemoryStore } from '../src/ai'
import { levelQuestionsOf, runJobWriteLevelCheck, type LevelDraft } from '../src/jobs/cloud/write-level-check'
import { firstToLearn, levelHeadline, levelResults, levelVerdict, LEVEL_QUESTIONS, pickLevelTopics, type LevelTopic } from '../src/logic/level-check'
import { AI_JOBS, jobPlan, postconditions } from '../src/plans'
import type { ToolContext } from '../src/tools/context'
import { memoryDb } from './helpers/memory-db'
import { recordingModel, type Seen } from './helpers/write-lesson-world'

// P163: the level check. 12 questions, 2 on each of 6 topics of the learner's grade, find where a learner new to Jemma starts.

vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const t = (name: string, family: string, term: number, position: number) => ({ id: `id-${name}`, name, family, term, position })

describe('the topics of a level check', () => {
  test('come from as many families as there are, in the order of the year', () => {
    const map = [
      t('Count to 100', 'numbers', 1, 1),
      t('Number bonds to 10', 'numbers', 1, 2),
      t('Adding past 10', 'numbers', 2, 1),
      t('2D shapes', 'shapes', 1, 3),
      t('Measuring length', 'measures', 3, 1),
      t('Skip counting', 'patterns', 2, 2),
      t('Pictographs', 'data', 4, 1),
      t('3D objects', 'shapes', 3, 2),
    ]
    const picked = pickLevelTopics(map)
    expect(picked).toHaveLength(6)
    expect(new Set(picked.map((p) => p.family)).size).toBe(5)
    expect(picked.map((p) => p.topicName)).toEqual(['Count to 100', 'Number bonds to 10', '2D shapes', 'Skip counting', 'Measuring length', 'Pictographs'])
  })

  test('count a name on the map twice once, and are fewer when the map is small', () => {
    const map = [t('Fractions', 'fractions', 1, 1), t('fractions ', 'fractions', 2, 1), t('Decimals', 'decimals', 1, 2)]
    expect(pickLevelTopics(map).map((p) => p.topicName)).toEqual(['Fractions', 'Decimals'])
  })
})

describe('what a level check finds', () => {
  test('both right is solid, none right is where to start, one right is too early to tell', () => {
    expect(levelVerdict(2, 2)).toBe('solid')
    expect(levelVerdict(0, 2)).toBe('start')
    expect(levelVerdict(1, 2)).toBe('unsure')
    expect(levelVerdict(1, 1)).toBe('unsure')
    expect(LEVEL_QUESTIONS).toBe(12)
  })

  test('"I don\'t know yet" counts as not right, and the topics keep their order', () => {
    const results = levelResults([
      { topicId: 'a', topicName: 'Counting', correct: true },
      { topicId: 'a', topicName: 'Counting', correct: true },
      { topicId: 'b', topicName: 'Adding past 10', correct: true, skipped: true },
      { topicId: 'b', topicName: 'Adding past 10', correct: false, skipped: true },
      { topicId: 'c', topicName: 'Shapes', correct: true },
      { topicId: 'c', topicName: 'Shapes', correct: false },
    ])
    expect(results.map((r) => [r.topicName, r.right, r.verdict])).toEqual([
      ['Counting', 2, 'solid'],
      ['Adding past 10', 0, 'start'],
      ['Shapes', 1, 'unsure'],
    ])
    expect(firstToLearn(results)?.topicName).toBe('Adding past 10')
    expect(firstToLearn(results.filter((r) => r.verdict !== 'start'))?.topicName).toBe('Shapes')
    expect(firstToLearn(results.filter((r) => r.verdict === 'solid'))).toBeNull()
  })

  test("the parent's line names the learner and never says he or she", () => {
    const r = (topicName: string, verdict: 'solid' | 'start' | 'unsure') => ({ topicId: null, topicName, right: 0, of: 2, verdict })
    expect(levelHeadline('Lesedi', [r('Counting to 100', 'solid'), r('Adding past 10', 'start')])).toBe('Lesedi is solid on counting to 100. Adding past 10 is where to start.')
    expect(levelHeadline('Lesedi', [r('Adding past 10', 'start')])).toBe('Adding past 10 is where Lesedi starts.')
    expect(levelHeadline('Lesedi', [r('Counting to 100', 'solid')])).toBe('Lesedi is solid on all 1 topics of the check.')
    expect(levelHeadline('Lesedi', [r('Shapes', 'unsure')])).toBe("Too early to tell. Jemma checks again in Lesedi's lessons.")
    expect(levelHeadline('Lesedi', [r('Shapes', 'solid'), r('Patterns', 'unsure')])).toBe('Lesedi is solid on shapes. Jemma checks the rest in the lessons.')
    for (const line of [levelHeadline('Lesedi', [r('A', 'solid'), r('B', 'start')]), levelHeadline('Lesedi', [])]) expect(line).not.toMatch(/\b(he|she|his|her)\b/i)
  })
})

const q = (prompt: string, answer: string, difficulty: 1 | 2, answerKind: 'whole' | 'choice' = 'whole', choices?: string[]) => ({
  prompt,
  render: 'text' as const,
  answer,
  answerKind,
  ...(choices ? { choices } : {}),
  difficulty,
  why: 'Why.',
  rightWay: 'The right way.',
})

const TOPICS: LevelTopic[] = [
  { topicId: 'tA', topicName: 'Adding past 10', family: 'numbers' },
  { topicId: 'tB', topicName: 'Skip counting', family: 'patterns' },
]

describe('the questions of a level check', () => {
  test('keep 2 markable questions a topic, easier first, and name a topic left short', () => {
    const draft: LevelDraft = {
      questions: [
        { topic: 1, question: q('9 + 6 = ?', '15', 2) },
        { topic: 1, question: q('8 + 5 = ?', '13', 1) },
        { topic: 1, question: q('7 + 7 = ?', '14', 2) },
        { topic: 2, question: q('2, 4, 6, ?', 'eight', 1) },
        { topic: 2, question: q('5, 10, 15, ?', 'B', 2, 'choice', ['15', '20', '25']) },
      ],
    }
    const { questions, short } = levelQuestionsOf(draft, TOPICS)
    expect(questions.map((x) => [x.topicName, x.question.prompt])).toEqual([
      ['Adding past 10', '8 + 5 = ?'],
      ['Adding past 10', '9 + 6 = ?'],
      ['Skip counting', '5, 10, 15, ?'],
    ])
    expect(short).toEqual([2])
  })
})

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const CHILD = '33333333-3333-4333-8333-333333333333'
const CHECK = '77777777-7777-4777-8777-777777777777'
const PROMPT = readFileSync(new URL('../src/jobs/write_level_check.md', import.meta.url), 'utf8')

function world(status = 'writing', country = 'US', grade = 2) {
  return memoryDb({
    schools: [{ id: SCHOOL, country }],
    classes: [{ id: CLASS, school_id: SCHOOL, subject: 'Mathematics', grade }],
    level_checks: [{ id: CHECK, child_id: CHILD, class_id: CLASS, grade, status, topics: TOPICS, questions: [], answers: [] }],
  })
}
const ctxOf = (db: ReturnType<typeof memoryDb>): ToolContext => ({ db, schoolId: SCHOOL, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date('2026-11-25T10:00:00Z') })

describe('the job write_level_check', () => {
  test('is an AI job with its own prompt, and is planned only while the questions are not written', async () => {
    expect(AI_JOBS).toContain('write_level_check')
    const event = { type: 'level.requested' as const, childId: CHILD, levelCheckId: CHECK }
    expect(await jobPlan(event, world())).toEqual([{ job: 'write_level_check', ids: { childId: CHILD, levelCheckId: CHECK } }])
    expect(await jobPlan(event, world('ready'))).toEqual([])
    expect(await jobPlan({ ...event, childId: 'someone-else' }, world())).toEqual([])
    expect(await postconditions(event, world())).toEqual([`no level check written for child ${CHILD}`])
    expect(await postconditions(event, world('ready'))).toEqual([])
    expect(await postconditions(event, world('done'))).toEqual([])
  })

  test('asks for 2 questions a topic with the class line on top, and saves them in order', async () => {
    const reply = JSON.stringify({
      questions: [
        { topic: 1, question: q('8 + 5 = ?', '13', 1) },
        { topic: 1, question: q('9 + 6 = ?', '15', 2) },
        { topic: 2, question: q('2, 4, 6, ? What comes next?', '8', 1) },
        { topic: 2, question: q('5, 10, 15, ? What comes next?', '20', 2) },
      ],
    })
    const seen: Seen[] = []
    const db = world()
    await runJobWriteLevelCheck(ctxOf(db), '', { childId: CHILD, levelCheckId: CHECK }, { model: recordingModel(reply, seen), prompt: PROMPT })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.system.startsWith('Subject: Mathematics. Grade: 2. Country: United States.')).toBe(true)
    expect(seen[0]!.system).toContain('Write 2 questions for every topic')
    expect(seen[0]!.user).toContain('<untrusted>[{"topic":1,"name":"Adding past 10"},{"topic":2,"name":"Skip counting"}]</untrusted>')
    const row = (await db.from('level_checks').select('status, questions').eq('id', CHECK).single()).data as { status: string; questions: { topicName: string; question: { prompt: string } }[] }
    expect(row.status).toBe('ready')
    expect(row.questions.map((x) => x.question.prompt)).toEqual(['8 + 5 = ?', '9 + 6 = ?', '2, 4, 6, ? What comes next?', '5, 10, 15, ? What comes next?'])
  })

  test('says the row failed when no reply gives every topic a good question', async () => {
    const seen: Seen[] = []
    const db = world()
    const reply = JSON.stringify({ questions: [{ topic: 1, question: q('8 + 5 = ?', '13', 1) }] })
    await expect(runJobWriteLevelCheck(ctxOf(db), '', { childId: CHILD, levelCheckId: CHECK }, { model: recordingModel(reply, seen), prompt: PROMPT })).rejects.toThrow(/Skip counting/)
    expect(seen).toHaveLength(3)
    expect(seen[1]!.user).toContain('for topic 1, 2')
    const row = (await db.from('level_checks').select('status').eq('id', CHECK).single()).data as { status: string }
    expect(row.status).toBe('failed')
  })

  test('does nothing for a check that is already written', async () => {
    const seen: Seen[] = []
    await runJobWriteLevelCheck(ctxOf(world('ready')), '', { childId: CHILD, levelCheckId: CHECK }, { model: recordingModel('{}', seen), prompt: PROMPT })
    expect(seen).toHaveLength(0)
  })
})
