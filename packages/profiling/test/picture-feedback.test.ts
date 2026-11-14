import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { askedForAll, CHILD_INFO } from './helpers/write-lesson-world'

// P87, decision 3: when a question comes back with a picture that makes no sense, the model is told once and asked again (the same way as for a
// bad answer). A class with no picture in its questions (the demo class above all) is told exactly what it was told before.

vi.mock('../src/tools/read/get-child-context', () => ({ getChildContext: { run: vi.fn(async () => CHILD_INFO) } }))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')

const question = (difficulty: 1 | 2 | 3, i: number, over: Record<string, unknown> = {}) => ({
  prompt: `Question ${difficulty}.${i}`,
  render: 'text',
  answer: '2',
  answerKind: 'number',
  difficulty,
  why: 'why',
  rightWay: 'right way',
  ...over,
})
const lessonReply = (bad: Record<string, unknown> | null, kind: 'number' | 'fraction' = 'number') =>
  JSON.stringify({
    format: 'reading',
    title: 'T',
    minutes: 12,
    cards: [{ heading: 'h', body: 'b' }],
    warmup: [],
    questions: ([1, 2, 3] as const).flatMap((d) =>
      [0, 1, 2, 3, 4].map((i) =>
        question(d, i, { ...(kind === 'fraction' ? { answer: '3/4', answerKind: 'fraction' } : {}), ...(bad && d === 1 && i === 0 ? bad : {}) }),
      ),
    ),
  })

const BAD_PLANE = { diagram: { kind: 'coordinate_plane', xMin: 5, xMax: -5, yMin: -5, yMax: 5 } }

describe('a picture that makes no sense is sent back to the model once', () => {
  test('a Grade 10 class is told which question and what is wrong with the picture', async () => {
    const seen = await askedForAll({ subject: 'Mathematics', grade: 10, country: 'ZA', family: 'functions' }, PROMPT, lessonReply(BAD_PLANE))
    expect(seen).toHaveLength(2)
    expect(seen[1]!.user).toContain('question 1')
    expect(seen[1]!.user).toContain('A picture must make sense: the grid needs xMin below xMax.')
  })

  test('a bad answer with no picture is told as before, and nothing is said of pictures', async () => {
    const seen = await askedForAll({ subject: 'Mathematics', grade: 10, country: 'ZA', family: 'functions' }, PROMPT, lessonReply({ answer: 'two' }))
    expect(seen).toHaveLength(2)
    expect(seen[1]!.user).toContain('answers that cannot be marked: question 1.')
    expect(seen[1]!.user).not.toContain('picture')
  })

  test('the demo class is told exactly what it was told before (no picture note)', async () => {
    const seen = await askedForAll({ subject: 'Mathematics', grade: 6, country: 'ZA' }, PROMPT, lessonReply({ answer: 'two' }, 'fraction'))
    expect(seen).toHaveLength(2)
    expect(seen[1]!.user).toContain('Your last answer had answers that cannot be marked: question 1. Write the whole lesson again with a single markable answer for each.')
    expect(seen[1]!.user).not.toContain('picture')
  })
})
