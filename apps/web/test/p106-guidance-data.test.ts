import type { JemmaDb } from '@jemma/profiling/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, inFilter, type FakeDb } from './p89-fake-db'

// P106: what the teacher's class home reads to show the guidance cards that wait for the teacher. A fake client keeps the rows: no database, no server.

let db: FakeDb
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => db }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => db }))
vi.mock('@/lib/data/p50b', () => ({ getShareCard: async () => null }))
vi.mock('@/lib/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/topics')>()),
  loadShortLabels: async () => (name: string) => name,
}))

import { getClassHome } from '@/lib/data/p18'
import { getGuidanceNeeds } from '@/lib/data/guidance'

const CLASS = 'c1000000-0000-4000-8000-000000000001'
const OTHER_CLASS = 'c2000000-0000-4000-8000-000000000002'
const [AMINA, THABO, ZOLA, BONGI] = ['a1', 'b2', 'c3', 'd4']

const card = (headline: string, over: Record<string, unknown> = {}) => ({
  headline,
  focus: [{ title: 'Adding fractions', why: 'Tops and bottoms were added.', evidence: [{ label: 'Test 1 Q2', resultIds: ['r1'] }] }],
  lookingAhead: 'Next up is subtracting fractions.',
  ...over,
})

const world = (over: Record<string, Record<string, unknown>[]> = {}) => ({
  classes: [{ id: CLASS, name: 'Grade 6B' }],
  enrolments: [
    { class_id: CLASS, child_id: THABO },
    { class_id: CLASS, child_id: AMINA },
    { class_id: CLASS, child_id: ZOLA },
    { class_id: OTHER_CLASS, child_id: BONGI },
  ],
  children: [
    { id: THABO, first_name: 'Thabo', created_at: '2026-01-02' },
    { id: AMINA, first_name: 'Amina', created_at: '2026-01-01' },
    { id: ZOLA, first_name: 'Zola', created_at: '2026-01-03' },
    { id: BONGI, first_name: 'Bongi', created_at: '2026-01-04' },
  ],
  guidance_drafts: [
    { child_id: THABO, content: card('Thabo is steady.') },
    { child_id: AMINA, content: card('Amina is doing well.') },
    { child_id: BONGI, content: card('Bongi is in another class.') },
  ],
  ...over,
})

beforeEach(() => {
  db = fakeDb(world())
})

describe('getGuidanceNeeds', () => {
  it('has one item for each learner of the class with a draft waiting, by first name', async () => {
    const needs = await getGuidanceNeeds(CLASS, db as unknown as JemmaDb)
    expect(needs.map((n) => [n.firstName, n.childId, n.classId])).toEqual([
      ['Amina', AMINA, CLASS],
      ['Thabo', THABO, CLASS],
    ])
  })

  it("carries the card's words: the headline, each focus item with its reason, and what is coming (no evidence ids)", async () => {
    const [amina] = await getGuidanceNeeds(CLASS, db as unknown as JemmaDb)
    expect(amina).toEqual({
      classId: CLASS,
      childId: AMINA,
      firstName: 'Amina',
      headline: 'Amina is doing well.',
      focus: [{ title: 'Adding fractions', why: 'Tops and bottoms were added.' }],
      lookingAhead: 'Next up is subtracting fractions.',
    })
  })

  it('asks only for the learners of this class', async () => {
    await getGuidanceNeeds(CLASS, db as unknown as JemmaDb)
    const [read] = db.reads('guidance_drafts')
    expect(inFilter(read!, 'child_id')).toEqual([THABO, AMINA, ZOLA])
  })

  it('leaves out a draft that is not a well formed card, since it could not be sent either', async () => {
    db = fakeDb(world({ guidance_drafts: [{ child_id: AMINA, content: { headline: 'No focus, no looking ahead' } }, { child_id: THABO, content: card('Thabo is steady.') }] }))
    expect((await getGuidanceNeeds(CLASS, db as unknown as JemmaDb)).map((n) => n.firstName)).toEqual(['Thabo'])
  })

  it('is empty with no draft, and with no learner in the class', async () => {
    db = fakeDb(world({ guidance_drafts: [] }))
    expect(await getGuidanceNeeds(CLASS, db as unknown as JemmaDb)).toEqual([])
    db = fakeDb(world({ enrolments: [] }))
    expect(await getGuidanceNeeds(CLASS, db as unknown as JemmaDb)).toEqual([])
    expect(db.reads('guidance_drafts')).toEqual([])
  })

  it('is empty when the table is not there yet (a database the migration has not reached)', async () => {
    const failing = {
      from: (table: string) => (table === 'guidance_drafts' ? { select: () => ({ in: async () => ({ data: null, error: { message: 'relation does not exist' } }) }) } : db.from(table)),
    }
    expect(await getGuidanceNeeds(CLASS, failing as unknown as JemmaDb)).toEqual([])
  })
})

describe('the class home', () => {
  it('has a Needs you item for each draft, after the items that were there, with the card on it', async () => {
    const home = await getClassHome(CLASS)
    expect(home!.needsYou.map((n) => n.title)).toEqual(["Guidance for Amina's family", "Guidance for Thabo's family"])
    expect(home!.needsYou[0]).toMatchObject({ detail: 'Amina is doing well.', guidance: { childId: AMINA, classId: CLASS, firstName: 'Amina' } })
  })

  it('has no such item when no draft waits', async () => {
    db = fakeDb(world({ guidance_drafts: [] }))
    const home = await getClassHome(CLASS)
    expect(home!.needsYou).toEqual([])
  })
})
