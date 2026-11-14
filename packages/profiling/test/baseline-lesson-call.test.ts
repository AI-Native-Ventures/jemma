import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { askedFor, CHILD_INFO } from './helpers/write-lesson-world'

// P86, decision 0: the demo class (Mathematics, Grade 6, South Africa) must not move by one character.
//
// A recorded answer of the lesson writer is found by a hash of the whole model call: the system text (the prompt file, then the JSON schema of
// the lesson that is pasted below it) and the user's words (the planned session and the data block). So these tests run the job `write_lesson`
// for the baseline class, catch what the model is asked, and pin each part. Every value below was computed on develop b11ae36 before any
// change of P86, and none of them may change in a later commit.

vi.mock('../src/tools/read/get-child-context', () => ({ getChildContext: { run: vi.fn(async () => CHILD_INFO) } }))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const SCHEMA_INTRO = '\n\nReply with one JSON object only, no markdown fences and no other text. It must match this JSON schema:\n'

/** What the model is asked for the baseline class: the system text split at the schema, and the user's words. */
const baseline = async () => {
  const seen = await askedFor({ subject: 'Mathematics', grade: 6, country: 'ZA' }, PROMPT)
  const at = seen.system.indexOf(SCHEMA_INTRO)
  return { head: seen.system.slice(0, at), schema: seen.system.slice(at + SCHEMA_INTRO.length), user: seen.user, system: seen.system }
}

describe('the lesson call of the baseline class is pinned', () => {
  test('the system text starts with the prompt file, byte for byte, and nothing is added on top', async () => {
    const { head } = await baseline()
    expect(head).toBe(PROMPT)
  })

  test('the JSON schema of the lesson that is pasted into the system text: sha256 of JSON.stringify(z.toJSONSchema(schema))', async () => {
    const { schema } = await baseline()
    expect(sha(schema)).toBe('8d041cfb7de9ba42fd1919b91033c913475831bbd0dbe07e02d7d23efb8dc71c')
  })

  test('the whole system text, prompt and schema together', async () => {
    const { system } = await baseline()
    expect(sha(system)).toBe('fc14a53f496cd03f227f3e3d8e93a52cb05c7789ec4fb5926ca94ed003680fd8')
  })

  test('the data block of the baseline class is exactly the pinned JSON, in this order of keys', async () => {
    const { user } = await baseline()
    expect(user).toBe(
      'Planned session: Equivalent fractions, format diagram.\n<untrusted>' +
        '{"profile":{"child":{"id":"33333333-3333-4333-8333-333333333333","firstName":"Amina","grade":6},"gaps":[{"topicName":"Equivalent fractions","stage":"practising","misconceptions":["adds the tops and the bottoms"]}]},' +
        '"openGaps":[{"topicName":"Equivalent fractions","stage":"practising","misconceptions":["adds the tops and the bottoms"]}],' +
        '"formatTrials":[{"topicFamily":"fractions","format":"diagram","score":3}],' +
        '"plannedSession":{"id":"55555555-5555-4555-8555-555555555555","status":"planned","plannedFor":"2026-11-14","lessonId":null,"topicName":"Equivalent fractions","format":"diagram","warmup":[]}}' +
        '</untrusted>',
    )
  })
})
