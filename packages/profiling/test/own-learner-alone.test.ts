import { describe, expect, test } from 'vitest'
import { addOwnGrade, defaultOwnClass, ensureOwnWorkspace, isIndependent, learnerFirstName, listOwnClasses, OwnWorkspaceError, startLearnerAlone, twinOfChild } from '../src/own-workspace'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// A learner who signs up alone (P111): one login, no teacher, no parent, no code. Starting makes the learner's personal school (`schools.kind
// 'private'`), ONE `children` row with `user_id` = the login, the CAPS class of the grade with its approved map (South Africa) and the learner's profile.
// Calling it twice never makes a second child. Tables are in memory (helpers/memory-db.ts): no database, no network.

const LEARNER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER_LEARNER = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'
const TEACHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const NOW = new Date('2026-11-16T10:00:00.000Z')

type Row = Record<string, unknown>

function world(over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    schools: [],
    children: [],
    classes: [],
    enrolments: [],
    parent_links: [],
    profiles: [],
    curriculum_maps: [],
    topics: [],
    activity_log: [],
    ...over,
  })
}

const start = (db: MemoryDb, over: Partial<{ userId: string; displayName: string; grade: unknown; country: unknown }> = {}) =>
  startLearnerAlone(db, { userId: LEARNER, displayName: 'Naledi Dlamini', grade: 5, country: 'ZA', ...over }, NOW)
const counts = (db: MemoryDb) => [db.tables.schools, db.tables.children, db.tables.classes, db.tables.enrolments, db.tables.curriculum_maps, db.tables.profiles].map((t) => t!.length)

describe('learnerFirstName', () => {
  test('is the first word of the account name', () => {
    expect(learnerFirstName('Naledi Dlamini')).toBe('Naledi')
    expect(learnerFirstName('  Naledi    Anne   Dlamini ')).toBe('Naledi')
  })

  test('starts with a capital when the name was typed in small letters', () => {
    expect(learnerFirstName('naledi dlamini')).toBe('Naledi')
    expect(learnerFirstName('Thandi-Rose')).toBe('Thandi-Rose')
    expect(learnerFirstName("Ke'agile")).toBe("Ke'agile")
  })

  test('keeps letters only, so a name made from an email still reads as a name', () => {
    expect(learnerFirstName('jane.doe99')).toBe('Janedoe')
    expect(learnerFirstName('K4giso<b>')).toBe('Kgisob')
  })

  test('falls back to "Learner" when no letters are left, and keeps the name under 40 letters', () => {
    expect(learnerFirstName('')).toBe('Learner')
    expect(learnerFirstName('1234 5678')).toBe('Learner')
    expect(learnerFirstName('A'.repeat(60))).toHaveLength(40)
  })
})

describe('startLearnerAlone', () => {
  test('makes the personal school, one child with the login as user_id, the CAPS class of the grade with its approved map, and the learner profile', async () => {
    const db = world()
    const made = await start(db)

    expect(db.tables.schools).toHaveLength(1)
    expect(db.tables.schools![0]).toMatchObject({ id: made.schoolId, name: "Naledi's own", country: 'ZA', kind: 'private', sandbox_id: null })
    expect(db.tables.children).toHaveLength(1)
    expect(db.tables.children![0]).toMatchObject({
      id: made.childId, first_name: 'Naledi', last_name: null, grade: 5, user_id: LEARNER, private_of: null, school_id: made.schoolId, parent_first_name: null, parent_relation: null,
    })
    expect(db.tables.classes).toHaveLength(1)
    expect(db.tables.classes![0]).toMatchObject({ id: made.classId, name: 'Grade 5 (my own)', grade: 5, subject: 'Mathematics', teacher_id: LEARNER, school_id: made.schoolId })
    expect(db.tables.enrolments).toHaveLength(1)
    expect(db.tables.enrolments![0]).toMatchObject({ class_id: made.classId, child_id: made.childId })
    expect(db.tables.curriculum_maps).toHaveLength(1)
    expect(db.tables.curriculum_maps![0]).toMatchObject({ class_id: made.classId, status: 'approved' })
    expect(made.topics).toBeGreaterThan(10)
    expect(db.tables.topics).toHaveLength(made.topics)
    // The learner's own login reads the personal school (row level security looks at profiles.school_id), so the profile points at it.
    expect(db.tables.profiles).toHaveLength(1)
    expect(db.tables.profiles![0]).toMatchObject({ user_id: LEARNER, role: 'learner', display_name: 'Naledi Dlamini', school_id: made.schoolId })
    expect(made).toMatchObject({ grade: 5, created: true })
  })

  test('asks nobody: no parent link, no teacher, no code, no age', async () => {
    const db = world()
    await start(db)
    expect(db.tables.parent_links).toHaveLength(0)
    expect(Object.keys(db.tables.children![0]!).sort()).not.toContain('birth_year')
  })

  test('the child is an independent own record: its classes, its default class and no twin', async () => {
    const db = world()
    const made = await start(db, { grade: 9 })
    expect(isIndependent({ private_of: null, schools: { kind: db.tables.schools![0]!.kind as string } })).toBe(true)
    expect(await listOwnClasses(db, made.childId)).toEqual([{ id: made.classId, name: 'Grade 9 (my own)', grade: 9, caps: true }])
    expect(await defaultOwnClass(db, made.childId)).toBe(made.classId)
    expect(await twinOfChild(db, made.childId)).toBeNull()
  })

  test('the learner adds another grade alone ("+ Another grade"): their own login is the person acting, no parent is needed, and a stranger is refused', async () => {
    const db = world()
    const made = await start(db)
    // The child is its own My own: no twin is made.
    expect(await ensureOwnWorkspace(db, made.childId, LEARNER)).toBe(made.childId)
    const added = await addOwnGrade(db, made.childId, 8, LEARNER, NOW)
    expect(added).toMatchObject({ grade: 8, created: true })
    expect(added.topics).toBeGreaterThan(0)
    expect((await listOwnClasses(db, made.childId)).map((c) => c.grade)).toEqual([5, 8])
    expect(db.tables.children).toHaveLength(1)
    await expect(addOwnGrade(db, made.childId, 9, OTHER_LEARNER, NOW)).rejects.toBeInstanceOf(OwnWorkspaceError)
    expect(db.tables.classes).toHaveLength(2)
  })

  test.each([1, 7, 12])('Grade %i works: the class is named for the grade and the map is the one of that grade', async (grade) => {
    const db = world()
    const made = await start(db, { grade })
    expect(db.tables.classes![0]).toMatchObject({ name: `Grade ${grade} (my own)`, grade })
    expect(db.tables.children![0]).toMatchObject({ grade })
    expect(made.topics).toBeGreaterThan(0)
  })

  test('a country outside South Africa gets the class and no map', async () => {
    const db = world()
    const made = await start(db, { country: 'KE', grade: 6 })
    expect(db.tables.schools![0]).toMatchObject({ country: 'KE', kind: 'private' })
    expect(db.tables.classes).toHaveLength(1)
    expect(db.tables.curriculum_maps).toHaveLength(0)
    expect(made.topics).toBe(0)
  })

  test('calling it twice never makes a second child, school, class or profile', async () => {
    const db = world()
    const first = await start(db)
    const after = counts(db)
    const second = await start(db)
    expect(counts(db)).toEqual(after)
    expect(second).toMatchObject({ childId: first.childId, schoolId: first.schoolId, created: false })
  })

  test('a second call with another grade changes nothing: the learner adds grades later from My maths', async () => {
    const db = world()
    const first = await start(db, { grade: 5 })
    const second = await start(db, { grade: 8 })
    expect(second.childId).toBe(first.childId)
    expect(db.tables.children).toHaveLength(1)
    expect(db.tables.children![0]).toMatchObject({ grade: 5 })
    expect(db.tables.classes).toHaveLength(1)
  })

  test('two logins make two separate learners', async () => {
    const db = world()
    const a = await start(db)
    const b = await start(db, { userId: OTHER_LEARNER, displayName: 'Sipho', grade: 3 })
    expect(a.childId).not.toBe(b.childId)
    expect(db.tables.children).toHaveLength(2)
    expect(db.tables.children!.map((c) => c.user_id).sort()).toEqual([LEARNER, OTHER_LEARNER].sort())
  })

  test('a login that already has a profile with the learner role and a child but no school link gets the link, and no second child', async () => {
    const db = world()
    const first = await start(db)
    db.tables.profiles![0]!.school_id = null
    await start(db)
    expect(db.tables.children).toHaveLength(1)
    expect(db.tables.profiles).toHaveLength(1)
    expect(db.tables.profiles![0]).toMatchObject({ school_id: first.schoolId })
  })

  test('a child made before the profile (an earlier call that stopped half way) gets its profile, and no second child', async () => {
    const db = world()
    const first = await start(db)
    db.tables.profiles = []
    const again = await start(db)
    expect(again).toMatchObject({ childId: first.childId, created: false })
    expect(db.tables.children).toHaveLength(1)
    expect(db.tables.profiles).toHaveLength(1)
    expect(db.tables.profiles![0]).toMatchObject({ user_id: LEARNER, role: 'learner', school_id: first.schoolId })
  })

  test('a login that already has another role is refused and nothing is made', async () => {
    const db = world({ profiles: [{ user_id: TEACHER, role: 'teacher', display_name: 'Ms Banda', school_id: null }] })
    const before = counts(db)
    const refusal = await start(db, { userId: TEACHER, displayName: 'Ms Banda' }).then(
      () => null,
      (e) => e,
    )
    expect(refusal).toBeInstanceOf(OwnWorkspaceError)
    expect(counts(db)).toEqual(before)
    expect(db.tables.profiles![0]).toMatchObject({ role: 'teacher' })
  })

  test.each([
    ['no grade', { grade: undefined }, 'Pick your grade, from 1 to 12.'],
    ['an empty grade', { grade: '' }, 'Pick your grade, from 1 to 12.'],
    ['grade 0', { grade: 0 }, 'Pick your grade, from 1 to 12.'],
    ['grade 13', { grade: 13 }, 'Pick your grade, from 1 to 12.'],
    ['a grade that is not a whole number', { grade: 5.5 }, 'Pick your grade, from 1 to 12.'],
    ['a grade that is text', { grade: '5' }, 'Pick your grade, from 1 to 12.'],
    ['no country', { country: '' }, 'Pick the country.'],
    ['a country that is not a code', { country: 'South Africa' }, 'Pick the country.'],
  ])('refuses %s in plain words and writes nothing', async (_what, over, message) => {
    const db = world()
    const before = counts(db)
    const refusal = await start(db, over as never).then(
      () => null,
      (e) => e,
    )
    expect(refusal).toBeInstanceOf(OwnWorkspaceError)
    expect((refusal as Error).message).toBe(message)
    expect(counts(db)).toEqual(before)
  })

  test('a failure half way takes the personal school away again, and the child, class and map with it, and no profile is left', async () => {
    const db = world()
    const real = db.from.bind(db)
    // The class cannot be made: the school and the child are already there when it fails.
    ;(db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      if (table === 'classes') throw new Error('classes are down')
      return real(table as never)
    }
    await expect(start(db)).rejects.toThrow(/could not start/)
    expect(db.tables.schools).toHaveLength(0)
    expect(db.tables.profiles).toHaveLength(0)
  })
})
