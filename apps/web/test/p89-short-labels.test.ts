import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, inFilter, type FakeDb } from './p89-fake-db'

// Short labels for topic names. A screen reads the topics of its own classes only, so the database does its row-by-row check on those rows
// and not on every topic of every school. Fake clients: no database. The "admin" client is the service client the loaders already use.

let admin: FakeDb
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => admin }))

import { classIdsOfChild, loadShortLabels } from '@/lib/topics'

// Two classes in two schools. Class A1 has map M1, class A2 has no map yet, class B1 (another school) has map M2.
const maps = [
  { id: 'M1', class_id: 'A1' },
  { id: 'M2', class_id: 'B1' },
]
const topics = [
  { id: 't1', map_id: 'M1', name: 'Adding fractions with different denominators', short_name: 'Adding fractions' },
  { id: 't2', map_id: 'M1', name: 'Length', short_name: null },
  { id: 't3', map_id: 'M1', name: 'Perimeter of rectangles and squares', short_name: 'Perimeter' },
  { id: 't4', map_id: 'M2', name: 'Naming 3-D shapes by their faces', short_name: '3-D shapes' },
]

beforeEach(() => {
  admin = fakeDb({ curriculum_maps: maps })
})

describe('loadShortLabels with a scope', () => {
  it('finds the maps of the classes (ids only, with the service client), then reads only the topics of those maps with the caller client', async () => {
    const db = fakeDb({ topics })
    await loadShortLabels(db, { classIds: ['A1', 'A2'] })

    const mapRead = admin.reads('curriculum_maps')
    expect(mapRead).toHaveLength(1)
    expect(mapRead[0]!.ops).toContainEqual(['select', 'id'])
    expect(inFilter(mapRead[0]!, 'class_id')).toEqual(['A1', 'A2'])
    expect(admin.reads('topics')).toHaveLength(0)

    const topicReads = db.reads('topics')
    expect(topicReads).toHaveLength(1)
    expect(inFilter(topicReads[0]!, 'map_id')).toEqual(['M1'])
    expect(db.reads('curriculum_maps')).toHaveLength(0)
  })

  it('never reads the whole topics table: every topics read carries a map filter', async () => {
    const db = fakeDb({ topics })
    await loadShortLabels(db, { classIds: ['A1'] })
    await loadShortLabels(db, { classIds: ['B1'] })
    for (const q of db.reads('topics')) expect(inFilter(q, 'map_id')).not.toBeNull()
  })

  it('answers the short label for the topics of the scope, and the name itself for any other name', async () => {
    const db = fakeDb({ topics })
    const short = await loadShortLabels(db, { classIds: ['A1'] })
    expect(short('Adding fractions with different denominators')).toBe('Adding fractions')
    expect(short('Perimeter of rectangles and squares')).toBe('Perimeter')
    expect(short('Length')).toBe('Length')
    expect(short('Something nobody has')).toBe('Something nobody has')
  })

  it('does not hand out the labels of a topic outside the scope', async () => {
    const db = fakeDb({ topics })
    const short = await loadShortLabels(db, { classIds: ['A1'] })
    expect(short('Naming 3-D shapes by their faces')).toBe('Naming 3-D shapes by their faces')
  })

  it('the label of each of the caller own topics is the same as without a scope', async () => {
    const db = fakeDb({ topics: topics.filter((t) => t.map_id === 'M1') }) // what row level security lets this caller see
    const scoped = await loadShortLabels(db, { classIds: ['A1'] })
    const whole = await loadShortLabels(db)
    for (const t of topics.filter((x) => x.map_id === 'M1')) expect(scoped(t.name)).toBe(whole(t.name))
  })

  it('with no class: an empty lookup, no topics query and no map query at all, and names as they are', async () => {
    const db = fakeDb({ topics })
    const short = await loadShortLabels(db, { classIds: [] })
    expect(db.queries).toHaveLength(0)
    expect(admin.queries).toHaveLength(0)
    expect(short('Adding fractions with different denominators')).toBe('Adding fractions with different denominators')
  })

  it('with classes that have no map yet: no topics query', async () => {
    const db = fakeDb({ topics })
    const short = await loadShortLabels(db, { classIds: ['A2'] })
    expect(admin.reads('curriculum_maps')).toHaveLength(1)
    expect(db.queries).toHaveLength(0)
    expect(short('Perimeter of rectangles and squares')).toBe('Perimeter of rectangles and squares')
  })

  it('a failing lookup does not break the screen: names as they are', async () => {
    admin = {
      from: () => {
        throw new Error('no service key')
      },
    } as unknown as FakeDb
    const db = fakeDb({ topics })
    const short = await loadShortLabels(db, { classIds: ['A1'] })
    expect(db.queries).toHaveLength(0)
    expect(short('Perimeter of rectangles and squares')).toBe('Perimeter of rectangles and squares')
  })
})

describe('loadShortLabels without a scope', () => {
  it('is the query it always was: name and short name of every topic that has a short name, no map filter, no map lookup', async () => {
    const db = fakeDb({ topics })
    const short = await loadShortLabels(db)
    expect(db.queries).toHaveLength(1)
    expect(db.queries[0]!.table).toBe('topics')
    expect(db.queries[0]!.ops).toEqual([
      ['select', 'name, short_name'],
      ['not', 'short_name', 'is', null],
    ])
    expect(admin.queries).toHaveLength(0)
    expect(short('Adding fractions with different denominators')).toBe('Adding fractions')
    expect(short('Naming 3-D shapes by their faces')).toBe('3-D shapes')
    expect(short('Length')).toBe('Length')
  })
})

describe('classIdsOfChild', () => {
  it("reads the child's enrolments with the caller client and answers each class once", async () => {
    const db = fakeDb({
      enrolments: [
        { class_id: 'A1', child_id: 'kid' },
        { class_id: 'A1', child_id: 'kid' },
        { class_id: 'A2', child_id: 'kid' },
        { class_id: 'A1', child_id: 'other' },
      ],
    })
    expect(await classIdsOfChild(db, 'kid')).toEqual(['A1', 'A2'])
    expect(db.reads('enrolments')).toHaveLength(1)
    expect(db.reads('enrolments')[0]!.ops).toContainEqual(['eq', 'child_id', 'kid'])
  })

  it('answers no class for a child the caller cannot see', async () => {
    expect(await classIdsOfChild(fakeDb({ enrolments: [] }), 'kid')).toEqual([])
  })
})
