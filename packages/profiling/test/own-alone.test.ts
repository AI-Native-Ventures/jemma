import { describe, expect, test } from 'vitest'
import { addChildAlone, addOwnGrade, defaultOwnClass, ensureOwnWorkspace, isIndependent, isOwnRecord, listOwnClasses, OwnWorkspaceError, twinOfChild } from '../src/own-workspace'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// A child whose school does not use Jemma (P99): ONE children row in a personal school (`schools.kind 'private'`, `private_of` null), added by the
// parent, who is linked to it at once. Its own record is its "My own". Tables are in memory (helpers/memory-db.ts): no database, no network.

const PARENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER_PARENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = new Date('2026-11-14T10:00:00.000Z')

type Row = Record<string, unknown>

function world(over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    schools: [],
    children: [],
    classes: [],
    enrolments: [],
    parent_links: [],
    profiles: [
      { user_id: PARENT, role: 'parent', display_name: 'Zanele M', school_id: null },
      { user_id: OTHER_PARENT, role: 'parent', display_name: 'Peter A', school_id: null },
    ],
    curriculum_maps: [],
    topics: [],
    activity_log: [],
    gaps: [],
    ...over,
  })
}

const privateSchools = (db: MemoryDb) => db.tables.schools!.filter((s) => s.kind === 'private')
const add = (db: MemoryDb, over: Partial<{ parentId: string; firstName: string; grade: unknown; country: unknown }> = {}) =>
  addChildAlone(db, { parentId: PARENT, firstName: 'Kagiso', grade: 8, country: 'ZA', ...over }, NOW)
const untouched = (db: MemoryDb) => [db.tables.schools, db.tables.children, db.tables.classes, db.tables.enrolments, db.tables.parent_links, db.tables.curriculum_maps].map((t) => t!.length)

describe('isOwnRecord and isIndependent', () => {
  test('a twin (private_of set) is an own record, whatever its school says', () => {
    expect(isOwnRecord({ private_of: 'child-school' })).toBe(true)
    expect(isOwnRecord({ private_of: 'child-school', schools: null })).toBe(true)
    expect(isIndependent({ private_of: 'child-school', schools: { kind: 'private' } })).toBe(false)
  })

  test('a child of a personal school with private_of null is an own record, and independent', () => {
    const kid = { private_of: null, schools: { kind: 'private' } }
    expect(isOwnRecord(kid)).toBe(true)
    expect(isIndependent(kid)).toBe(true)
  })

  test('a child of a school is neither, and so is a child whose school cannot be read', () => {
    expect(isOwnRecord({ private_of: null, schools: { kind: 'school' } })).toBe(false)
    expect(isOwnRecord({ private_of: null, schools: null })).toBe(false)
    expect(isOwnRecord({ private_of: null })).toBe(false)
    expect(isOwnRecord({ private_of: undefined, schools: { kind: 'school' } })).toBe(false)
    expect(isIndependent({ private_of: null, schools: { kind: 'school' } })).toBe(false)
  })
})

describe('addChildAlone', () => {
  test('makes the personal school, the child, the CAPS class of the grade with its approved map, and the approved link of the parent', async () => {
    const db = world()
    const made = await add(db)

    expect(privateSchools(db)).toHaveLength(1)
    expect(privateSchools(db)[0]).toMatchObject({ name: "Kagiso's own", country: 'ZA', kind: 'private', sandbox_id: null })
    expect(db.tables.children).toHaveLength(1)
    expect(db.tables.children![0]).toMatchObject({
      id: made.childId, first_name: 'Kagiso', last_name: null, grade: 8, user_id: null, private_of: null, school_id: privateSchools(db)[0]!.id, parent_first_name: 'Zanele',
    })
    expect(db.tables.classes).toHaveLength(1)
    expect(db.tables.classes![0]).toMatchObject({ id: made.classId, name: 'Grade 8 (my own)', grade: 8, subject: 'Mathematics', teacher_id: PARENT, school_id: privateSchools(db)[0]!.id })
    expect(db.tables.enrolments).toHaveLength(1)
    expect(db.tables.enrolments![0]).toMatchObject({ class_id: made.classId, child_id: made.childId })
    expect(db.tables.parent_links).toHaveLength(1)
    expect(db.tables.parent_links![0]).toMatchObject({ parent_id: PARENT, child_id: made.childId, class_id: made.classId, status: 'approved', consent: { guardian: true, teach: true, improve: false } })
    expect(typeof db.tables.parent_links![0]!.decided_at).toBe('string')
    expect(db.tables.curriculum_maps).toHaveLength(1)
    expect(db.tables.curriculum_maps![0]).toMatchObject({ class_id: made.classId, status: 'approved' })
    expect(made.grade).toBe(8)
    expect(made.topics).toBeGreaterThan(10)
    expect(db.tables.topics).toHaveLength(made.topics)
  })

  test('the child is its own My own: its classes list, its default class and no twin', async () => {
    const db = world()
    const made = await add(db, { grade: 5 })
    expect(await listOwnClasses(db, made.childId)).toEqual([{ id: made.classId, name: 'Grade 5 (my own)', grade: 5, caps: true }])
    expect(await defaultOwnClass(db, made.childId)).toBe(made.classId)
    expect(await twinOfChild(db, made.childId)).toBeNull()
  })

  test('a country outside South Africa gets the class and no map (the grade still opens, with no topics)', async () => {
    const db = world()
    const made = await add(db, { country: 'KE', grade: 6 })
    expect(privateSchools(db)[0]).toMatchObject({ country: 'KE' })
    expect(db.tables.classes).toHaveLength(1)
    expect(db.tables.curriculum_maps).toHaveLength(0)
    expect(made.topics).toBe(0)
    expect(db.tables.parent_links![0]).toMatchObject({ class_id: made.classId, status: 'approved' })
  })

  test('a name is trimmed and its spaces squeezed', async () => {
    const db = world()
    await add(db, { firstName: '   Lerato   Anne ' })
    expect(db.tables.children![0]).toMatchObject({ first_name: 'Lerato Anne' })
    expect(privateSchools(db)[0]).toMatchObject({ name: "Lerato Anne's own" })
  })

  test.each([
    ['no name', { firstName: '' }, 'Type your child’s first name.'],
    ['a name of spaces', { firstName: '   ' }, 'Type your child’s first name.'],
    ['a name that is too long', { firstName: 'K'.repeat(41) }, 'Keep the name under 40 letters.'],
    ['a name with numbers or marks', { firstName: 'K4giso<b>' }, 'Use letters only for the name.'],
    ['grade 0', { grade: 0 }, 'Pick a grade from 1 to 12.'],
    ['grade 13', { grade: 13 }, 'Pick a grade from 1 to 12.'],
    ['a grade that is not a whole number', { grade: 5.5 }, 'Pick a grade from 1 to 12.'],
    ['a grade that is text', { grade: '5' }, 'Pick a grade from 1 to 12.'],
    ['no grade', { grade: undefined }, 'Pick a grade from 1 to 12.'],
    ['no country', { country: '' }, 'Pick the country.'],
    ['a country that is not a code', { country: 'South Africa' }, 'Pick the country.'],
  ])('refuses %s in plain words and writes nothing', async (_what, over, message) => {
    const db = world()
    const before = untouched(db)
    const refusal = await add(db, over as never).then(
      () => null,
      (e) => e,
    )
    expect(refusal).toBeInstanceOf(OwnWorkspaceError)
    expect((refusal as Error).message).toBe(message)
    expect(untouched(db)).toEqual(before)
    expect(untouched(db)).toEqual([0, 0, 0, 0, 0, 0])
  })

  test('a parent may add a second child this way: a second personal school, child and link, and the first is untouched', async () => {
    const db = world()
    const first = await add(db, { firstName: 'Kagiso', grade: 8 })
    const second = await add(db, { firstName: 'Naledi', grade: 3 })

    expect(second.childId).not.toBe(first.childId)
    expect(privateSchools(db).map((s) => s.name).sort()).toEqual(["Kagiso's own", "Naledi's own"])
    expect(db.tables.children).toHaveLength(2)
    expect(db.tables.parent_links!.map((l) => [l.child_id, l.status])).toEqual([
      [first.childId, 'approved'],
      [second.childId, 'approved'],
    ])
    // Each child's own record is in its own personal school, with its own class.
    const kids = db.tables.children!
    expect(new Set(kids.map((k) => k.school_id)).size).toBe(2)
    expect((await listOwnClasses(db, first.childId)).map((c) => c.grade)).toEqual([8])
    expect((await listOwnClasses(db, second.childId)).map((c) => c.grade)).toEqual([3])
  })

  test('the personal school is tied to the sandbox of a demo parent (the parent is linked to a child of a demo school), so the demo clean-up takes it', async () => {
    const db = world({
      schools: [{ id: 'hillview', name: 'Hillview Primary', country: 'ZA', kind: 'school', sandbox_id: 'box-7' }],
      children: [{ id: 'nomsas-kid', school_id: 'hillview', first_name: 'Sipho', grade: 5, user_id: null, private_of: null }],
      parent_links: [{ id: 'l0', parent_id: PARENT, child_id: 'nomsas-kid', class_id: 'c0', status: 'approved' }],
    })
    await add(db)
    expect(privateSchools(db)[0]).toMatchObject({ sandbox_id: 'box-7' })
  })

  test('a parent who has no child in a demo school gets a personal school with no sandbox', async () => {
    const db = world({
      schools: [{ id: 'real', name: 'Real School', country: 'ZA', kind: 'school', sandbox_id: null }],
      children: [{ id: 'kid', school_id: 'real', first_name: 'Sipho', grade: 5, user_id: null, private_of: null }],
      parent_links: [{ id: 'l0', parent_id: PARENT, child_id: 'kid', class_id: 'c0', status: 'approved' }],
    })
    await add(db)
    expect(privateSchools(db)[0]).toMatchObject({ sandbox_id: null })
  })

  test('a failure after the school was made removes the school again and says so (nothing is left half made)', async () => {
    const db = world()
    const real = db.from.bind(db) as unknown as (table: string) => Record<string, unknown>
    ;(db as { from: unknown }).from = (table: string) => {
      const q = real(table)
      if (table !== 'parent_links') return q
      return { ...q, insert: () => ({ select: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'link refused' } }).then(r) }) }) }
    }
    await expect(add(db)).rejects.toThrow(/link/)
    expect(privateSchools(db)).toHaveLength(0)
  })
})

describe('an independent child in ensureOwnWorkspace and addOwnGrade', () => {
  test('ensureOwnWorkspace answers the child itself (no twin of a twin) and makes nothing, for the linked parent', async () => {
    const db = world()
    const made = await add(db)
    const before = untouched(db)
    expect(await ensureOwnWorkspace(db, made.childId, PARENT)).toBe(made.childId)
    expect(await ensureOwnWorkspace(db, made.childId, PARENT)).toBe(made.childId)
    expect(untouched(db)).toEqual(before)
    expect(db.tables.children!.filter((c) => c.private_of !== null && c.private_of !== undefined)).toHaveLength(0)
  })

  test('the child’s own login may open it, a stranger and another parent may not', async () => {
    const LOGIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const db = world()
    const made = await add(db)
    db.tables.children!.find((c) => c.id === made.childId)!.user_id = LOGIN
    expect(await ensureOwnWorkspace(db, made.childId, LOGIN)).toBe(made.childId)
    await expect(ensureOwnWorkspace(db, made.childId, STRANGER)).rejects.toBeInstanceOf(OwnWorkspaceError)
    await expect(ensureOwnWorkspace(db, made.childId, OTHER_PARENT)).rejects.toBeInstanceOf(OwnWorkspaceError)
  })

  test('addOwnGrade adds another CAPS grade to the child, by the linked parent or the child’s login', async () => {
    const LOGIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const db = world()
    const made = await add(db, { grade: 8 })
    db.tables.children!.find((c) => c.id === made.childId)!.user_id = LOGIN

    const nine = await addOwnGrade(db, made.childId, 9, PARENT, NOW)
    expect(nine).toMatchObject({ grade: 9, created: true })
    expect(nine.topics).toBeGreaterThan(10)
    const again = await addOwnGrade(db, made.childId, 9, LOGIN, NOW)
    expect(again).toMatchObject({ classId: nine.classId, created: false })
    const ten = await addOwnGrade(db, made.childId, 10, LOGIN, NOW)
    expect(ten.created).toBe(true)

    expect((await listOwnClasses(db, made.childId)).map((c) => c.grade)).toEqual([8, 9, 10])
    expect(db.tables.enrolments!.filter((e) => e.child_id === made.childId)).toHaveLength(3)
  })

  test('addOwnGrade refuses a stranger and another parent for the child', async () => {
    const db = world()
    const made = await add(db)
    await expect(addOwnGrade(db, made.childId, 9, STRANGER, NOW)).rejects.toThrow('You cannot open My own for this learner.')
    await expect(addOwnGrade(db, made.childId, 9, OTHER_PARENT, NOW)).rejects.toThrow('You cannot open My own for this learner.')
    expect(await listOwnClasses(db, made.childId)).toHaveLength(1)
  })

  test('a child of an ordinary school is still not a private workspace', async () => {
    const db = world({
      schools: [{ id: 'real', name: 'Real School', country: 'ZA', kind: 'school', sandbox_id: null }],
      children: [{ id: 'kid', school_id: 'real', first_name: 'Sipho', grade: 5, user_id: STRANGER, private_of: null }],
    })
    await expect(addOwnGrade(db, 'kid', 6, STRANGER, NOW)).rejects.toThrow('That is not a private workspace.')
  })
})
