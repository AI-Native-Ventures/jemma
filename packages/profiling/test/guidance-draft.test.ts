import { describe, expect, test } from 'vitest'
import { MemoryStore } from '../src/ai'
import type { ToolContext } from '../src/tools/context'
import { subjectGuidance } from '../src/tools/save/subject-guidance'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// P106: a guidance card for a school child is written to `guidance_drafts`, where only the child's teachers can read it. The family keeps reading
// `guidance_cards` and sees a card only after the teacher sends it. A learner's own record (a twin, or a child whose school does not use Jemma)
// has no teacher: its card is written to `guidance_cards` at once, as it always was. The tool's answer to the model is the same words as before.
// No network, no model, no database: the tables are in memory.

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const OWN_SCHOOL = '22222222-2222-4222-8222-222222222222'
const ALONE_SCHOOL = '33333333-3333-4333-8333-333333333333'
const AMINA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TWIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KAGISO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = new Date('2026-11-15T08:00:00.000Z')
const LATER = new Date('2026-11-15T09:30:00.000Z')

/** The database as the double sees it: any table name. */
type Loose = { from: (table: string) => Record<string, unknown> }

/** The memory database has no `upsert`: this one keeps a row for each value of the conflict column, the way the real table does. */
function withUpsert(db: MemoryDb): MemoryDb {
  const from = (db as unknown as Loose).from.bind(db)
  return Object.assign(Object.create(db) as MemoryDb, {
    from: (table: string) => ({
      ...from(table),
      upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
        const rows = (db.tables[table] ??= [])
        const at = rows.findIndex((r) => r[opts.onConflict] === row[opts.onConflict])
        if (at >= 0) Object.assign(rows[at]!, row)
        else rows.push({ ...row })
        return { data: null, error: null }
      },
    }),
  })
}

const world = (over: Record<string, Record<string, unknown>[]> = {}) =>
  withUpsert(
    memoryDb({
      schools: [
        { id: SCHOOL, kind: 'school' },
        { id: OWN_SCHOOL, kind: 'private' },
        { id: ALONE_SCHOOL, kind: 'private' },
      ],
      children: [
        { id: AMINA, school_id: SCHOOL, first_name: 'Amina', grade: 6, private_of: null },
        { id: TWIN, school_id: OWN_SCHOOL, first_name: 'Amina', grade: 6, private_of: AMINA },
        { id: KAGISO, school_id: ALONE_SCHOOL, first_name: 'Kagiso', grade: 8, private_of: null },
      ],
      question_results: [
        { id: 'r-amina-1', child_id: AMINA },
        { id: 'r-twin-1', child_id: TWIN },
        { id: 'r-kagiso-1', child_id: KAGISO },
      ],
      guidance_cards: [],
      guidance_drafts: [],
      observations: [],
      activity_log: [],
      tool_calls: [],
      ...over,
    }),
  )

const ctxFor = (db: MemoryDb, schoolId: string, now: Date = NOW): ToolContext => ({ db, schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => now })

const card = (resultId: string, headline = 'Amina is doing well. One thing to work on: adding fractions.') => ({
  headline,
  focus: [
    { title: 'Adding fractions', why: 'Tops and bottoms were added', evidence: [{ label: 'Test 1 Q2', resultIds: [resultId] }] },
    { title: 'Made up', why: 'Points at a result that is not hers', evidence: [{ label: 'Ghost', resultIds: ['not-a-result'] }] },
  ],
  lookingAhead: 'Next up is subtracting fractions.',
})

const rowsOf = (db: MemoryDb, table: string) => db.tables[table] ?? []
const contentOf = (db: MemoryDb, table: string, childId: string) => rowsOf(db, table).find((r) => r.child_id === childId)?.content as { headline: string; focus: { title: string }[] } | undefined

describe('a school child', () => {
  test('the new card is a draft: nothing is written to guidance_cards', async () => {
    const db = world()
    await subjectGuidance.run(ctxFor(db, SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })
    expect(rowsOf(db, 'guidance_cards')).toEqual([])
    expect(rowsOf(db, 'guidance_drafts')).toHaveLength(1)
    expect(rowsOf(db, 'guidance_drafts')[0]).toMatchObject({ child_id: AMINA, created_at: NOW.toISOString(), updated_at: NOW.toISOString() })
  })

  test('a focus item with no real evidence is dropped, as it was, before the draft is saved', async () => {
    const db = world()
    await subjectGuidance.run(ctxFor(db, SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })
    expect(contentOf(db, 'guidance_drafts', AMINA)?.focus.map((f) => f.title)).toEqual(['Adding fractions'])
  })

  test('the answer to the model is the same words as before', async () => {
    const db = world()
    const out = await subjectGuidance.run(ctxFor(db, SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })
    expect(out).toEqual({ updated: true })
  })

  test('a newer draft replaces the draft that was not sent, and keeps when the first one was made', async () => {
    const db = world()
    await subjectGuidance.run(ctxFor(db, SCHOOL), { childId: AMINA, guidance: card('r-amina-1', 'First words.') })
    await subjectGuidance.run(ctxFor(db, SCHOOL, LATER), { childId: AMINA, guidance: card('r-amina-1', 'Second words.') })
    expect(rowsOf(db, 'guidance_drafts')).toHaveLength(1)
    expect(contentOf(db, 'guidance_drafts', AMINA)?.headline).toBe('Second words.')
    expect(rowsOf(db, 'guidance_drafts')[0]).toMatchObject({ created_at: NOW.toISOString(), updated_at: LATER.toISOString() })
  })

  test('a card the family already has is not changed by a newer draft', async () => {
    const sent = { headline: 'The card the family reads.', focus: [], lookingAhead: 'Soon.' }
    const db = world({ guidance_cards: [{ child_id: AMINA, content: sent, created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' }] })
    await subjectGuidance.run(ctxFor(db, SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })
    expect(rowsOf(db, 'guidance_cards')).toEqual([{ child_id: AMINA, content: sent, created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' }])
    expect(contentOf(db, 'guidance_drafts', AMINA)?.headline).toContain('Amina is doing well')
  })

  test('a note newer than the card still shows in "What Jemma did"', async () => {
    const db = world({
      guidance_cards: [{ child_id: AMINA, content: { headline: 'h', focus: [], lookingAhead: 'l' }, created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' }],
      observations: [{ id: 'o1', child_id: AMINA, created_at: '2026-11-12T08:00:00.000Z' }],
    })
    await subjectGuidance.run(ctxFor(db, SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })
    expect(rowsOf(db, 'activity_log').map((l) => l.text)).toEqual(['Used your note on Amina in the guidance card'])
  })
})

describe("a learner's own record has no teacher", () => {
  test('the twin of a school child gets its card in guidance_cards at once, and no draft', async () => {
    const db = world()
    const out = await subjectGuidance.run(ctxFor(db, OWN_SCHOOL), { childId: TWIN, guidance: card('r-twin-1') })
    expect(out).toEqual({ updated: true })
    expect(rowsOf(db, 'guidance_drafts')).toEqual([])
    expect(rowsOf(db, 'guidance_cards')).toHaveLength(1)
    expect(rowsOf(db, 'guidance_cards')[0]).toMatchObject({ child_id: TWIN, created_at: NOW.toISOString(), updated_at: NOW.toISOString() })
    expect(contentOf(db, 'guidance_cards', TWIN)?.focus.map((f) => f.title)).toEqual(['Adding fractions'])
  })

  test('a child whose school does not use Jemma gets its card in guidance_cards at once, and no draft', async () => {
    const db = world()
    await subjectGuidance.run(ctxFor(db, ALONE_SCHOOL), { childId: KAGISO, guidance: card('r-kagiso-1', 'Kagiso is doing well.') })
    expect(rowsOf(db, 'guidance_drafts')).toEqual([])
    expect(contentOf(db, 'guidance_cards', KAGISO)?.headline).toBe('Kagiso is doing well.')
  })

  test('a second card replaces the first and keeps when the first one was made', async () => {
    const db = world()
    await subjectGuidance.run(ctxFor(db, OWN_SCHOOL), { childId: TWIN, guidance: card('r-twin-1', 'First words.') })
    await subjectGuidance.run(ctxFor(db, OWN_SCHOOL, LATER), { childId: TWIN, guidance: card('r-twin-1', 'Second words.') })
    expect(rowsOf(db, 'guidance_cards')).toHaveLength(1)
    expect(rowsOf(db, 'guidance_cards')[0]).toMatchObject({ created_at: NOW.toISOString(), updated_at: LATER.toISOString() })
    expect(contentOf(db, 'guidance_cards', TWIN)?.headline).toBe('Second words.')
  })
})

describe('the tool is still a tool of its school', () => {
  test('a child of another school is refused and nothing is written', async () => {
    const db = world()
    await expect(subjectGuidance.run(ctxFor(db, OWN_SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })).rejects.toThrow()
    expect(rowsOf(db, 'guidance_drafts')).toEqual([])
    expect(rowsOf(db, 'guidance_cards')).toEqual([])
  })

  test('a write that fails is an error, not a quiet success', async () => {
    const db = world()
    const loose = db as unknown as Loose
    const failing = Object.assign(Object.create(db) as MemoryDb, {
      from: (table: string) => (table === 'guidance_drafts' ? { ...loose.from(table), upsert: async () => ({ data: null, error: { message: 'table is missing' } }) } : loose.from(table)),
    })
    await expect(subjectGuidance.run(ctxFor(failing, SCHOOL), { childId: AMINA, guidance: card('r-amina-1') })).rejects.toThrow('guidance_drafts write failed: table is missing')
  })
})
