import { describe, expect, test } from 'vitest'
import { MemoryStore } from '../src/ai/stores'
import { capsMapOf } from '../src/curriculum/caps-map'
import { addOwnGrade, capsClassName, defaultOwnClass, ensureOwnWorkspace, getOwnOverview, getOwnWorkspaceForTeacher, isCapsClassName, listOwnClasses, OwnWorkspaceError, twinOfChild } from '../src/own-workspace'
import type { ToolContext } from '../src/tools/context'
import { planNextSession, type SessionPlan } from '../src/tools/save/plan-next-session'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// A learner's own private workspace ("My own"): a second children row (the twin) in a school of its own, one private class for each grade
// the learner added. Tables are in memory (helpers/memory-db.ts): no database, no network.

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const AMINA = '33333333-3333-4333-8333-333333333333'
const LEARNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PARENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PENDING_PARENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TEACHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER_TEACHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'
const HOME_CLASS = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-14T10:00:00.000Z')

type Row = Record<string, unknown>

function world(country = 'ZA', over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    schools: [{ id: SCHOOL, name: 'Hillview Primary', country, region: 'Gauteng', grades: 'Grade R to 7', kind: 'school', sandbox_id: 'box-1' }],
    children: [{ id: AMINA, school_id: SCHOOL, first_name: 'Amina', last_name: 'Dlamini', grade: 6, user_id: LEARNER, private_of: null, parent_first_name: 'Thandi', parent_relation: 'mum' }],
    classes: [{ id: HOME_CLASS, school_id: SCHOOL, teacher_id: TEACHER, name: '6B Mathematics', grade: 6, subject: 'Mathematics', year: 2026, join_code: 'HOME11' }],
    enrolments: [{ class_id: HOME_CLASS, child_id: AMINA }],
    parent_links: [
      { id: 'l1', parent_id: PARENT, child_id: AMINA, class_id: HOME_CLASS, status: 'approved' },
      { id: 'l2', parent_id: PENDING_PARENT, child_id: AMINA, class_id: HOME_CLASS, status: 'pending' },
    ],
    curriculum_maps: [],
    topics: [],
    gaps: [],
    sessions: [],
    lessons: [],
    session_items: [],
    question_results: [],
    papers: [],
    tests: [],
    activity_log: [],
    learner_records: [],
    observations: [],
    format_trials: [],
    attendance: [],
    activities: [],
    ...over,
  })
}

const twinRows = (db: MemoryDb) => db.tables.children!.filter((c) => c.private_of !== null && c.private_of !== undefined)
const privateSchools = (db: MemoryDb) => db.tables.schools!.filter((s) => s.kind === 'private')

describe('ensureOwnWorkspace', () => {
  test('makes the personal school and the twin, and nothing else', async () => {
    const db = world()
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)

    expect(privateSchools(db)).toHaveLength(1)
    expect(privateSchools(db)[0]).toMatchObject({ name: "Amina's own", country: 'ZA', kind: 'private' })
    expect(twinRows(db)).toHaveLength(1)
    expect(twinRows(db)[0]).toMatchObject({ id: twinId, first_name: 'Amina', last_name: 'Dlamini', grade: 6, user_id: LEARNER, private_of: AMINA, school_id: privateSchools(db)[0]!.id })
    // The school child, its school, its class and its enrolment are as they were. Nothing else was made.
    expect(db.tables.children).toHaveLength(2)
    expect(db.tables.schools).toHaveLength(2)
    expect(db.tables.classes).toHaveLength(1)
    expect(db.tables.enrolments).toHaveLength(1)
    expect(db.tables.curriculum_maps).toHaveLength(0)
    expect(db.tables.children!.find((c) => c.id === AMINA)).toMatchObject({ private_of: null, school_id: SCHOOL, user_id: LEARNER })
  })

  test('a second call answers the same twin and makes nothing', async () => {
    const db = world()
    const first = await ensureOwnWorkspace(db, AMINA, LEARNER)
    const second = await ensureOwnWorkspace(db, AMINA, LEARNER)
    expect(second).toBe(first)
    expect(privateSchools(db)).toHaveLength(1)
    expect(twinRows(db)).toHaveLength(1)
    // The parent finds the same twin.
    expect(await ensureOwnWorkspace(db, AMINA, PARENT)).toBe(first)
    expect(await twinOfChild(db, AMINA)).toEqual({ id: first })
  })

  test('the twin keeps the parent\'s name and the sandbox of the school, so the hand-back screen and the clean-up still work', async () => {
    const db = world()
    await ensureOwnWorkspace(db, AMINA, LEARNER)
    expect(twinRows(db)[0]).toMatchObject({ parent_first_name: 'Thandi', parent_relation: 'mum' })
    expect(privateSchools(db)[0]).toMatchObject({ sandbox_id: 'box-1' })
  })

  test('the school child\'s own login, an approved parent and no one else may make it', async () => {
    for (const who of [STRANGER, PENDING_PARENT, TEACHER]) {
      const db = world()
      await expect(ensureOwnWorkspace(db, AMINA, who), who).rejects.toBeInstanceOf(OwnWorkspaceError)
      expect(privateSchools(db)).toHaveLength(0)
      expect(twinRows(db)).toHaveLength(0)
    }
    const db = world()
    await expect(ensureOwnWorkspace(db, AMINA, PARENT)).resolves.toBeTruthy()
  })

  test('a learner with no login of their own is served through an approved parent', async () => {
    const db = world('ZA', { children: [{ id: AMINA, school_id: SCHOOL, first_name: 'Amina', last_name: null, grade: 6, user_id: null, private_of: null }] })
    const twinId = await ensureOwnWorkspace(db, AMINA, PARENT)
    expect(twinRows(db)[0]).toMatchObject({ id: twinId, user_id: null, private_of: AMINA })
  })

  test('a twin has no twin, and a child that does not exist has none', async () => {
    const db = world()
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    await expect(ensureOwnWorkspace(db, twinId, LEARNER)).rejects.toBeInstanceOf(OwnWorkspaceError)
    await expect(ensureOwnWorkspace(db, '99999999-9999-4999-8999-999999999999', LEARNER)).rejects.toBeTruthy()
  })
})

describe('addOwnGrade', () => {
  async function started(country = 'ZA', over: Record<string, Row[]> = {}) {
    const db = world(country, over)
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    return { db, twinId, personal: privateSchools(db)[0]!.id as string }
  }

  test('a South African twin gets the class, the enrolment, the approved CAPS map with its topics and the line of the log', async () => {
    const { db, twinId, personal } = await started()
    const out = await addOwnGrade(db, twinId, 7, LEARNER, NOW)
    const caps = capsMapOf(7)!

    const own = db.tables.classes!.filter((c) => c.school_id === personal)
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ name: 'Grade 7 (my own)', grade: 7, subject: 'Mathematics', teacher_id: LEARNER, year: 2026 })
    expect(String(own[0]!.join_code)).toMatch(/^[A-Z2-9]{6}$/)
    expect(db.tables.enrolments!.filter((e) => e.child_id === twinId)).toEqual([expect.objectContaining({ class_id: own[0]!.id })])

    const maps = db.tables.curriculum_maps!.filter((m) => m.class_id === own[0]!.id)
    expect(maps).toHaveLength(1)
    expect(maps[0]).toMatchObject({ status: 'approved', draft: caps.stored })
    expect(maps[0]!.approved_at).toBe(NOW.toISOString())
    const topics = db.tables.topics!.filter((t) => t.map_id === maps[0]!.id)
    expect(topics).toHaveLength(caps.rows.length)
    expect(topics.map((t) => t.name)).toEqual(caps.rows.map((r) => r.name))

    expect(db.tables.activity_log).toEqual([expect.objectContaining({ school_id: personal, class_id: own[0]!.id, text: `Loaded the CAPS map for Grade 7: ${caps.rows.length} topics`, tool: 'use_caps_map' })])
    expect(out).toEqual({ classId: own[0]!.id, grade: 7, created: true, topics: caps.rows.length })
  })

  test('every grade 1 to 12 gets its own CAPS map', async () => {
    const { db, twinId } = await started()
    for (let grade = 1; grade <= 12; grade++) {
      const out = await addOwnGrade(db, twinId, grade, LEARNER, NOW)
      expect(out.topics, `Grade ${grade}`).toBe(capsMapOf(grade)!.rows.length)
    }
    expect(db.tables.curriculum_maps).toHaveLength(12)
    expect(new Set(db.tables.classes!.map((c) => c.join_code)).size).toBe(13)
  })

  test('Grade 13, Grade 0 and a grade that is not a whole number are refused, and nothing is written', async () => {
    const { db, twinId } = await started()
    for (const bad of [13, 0, -2, 6.5, Number.NaN, '7' as unknown as number]) {
      await expect(addOwnGrade(db, twinId, bad, LEARNER, NOW), String(bad)).rejects.toBeInstanceOf(OwnWorkspaceError)
    }
    expect(db.tables.classes).toHaveLength(1)
    expect(db.tables.curriculum_maps).toHaveLength(0)
    expect(db.tables.enrolments).toHaveLength(1)
  })

  test('a second call for the same grade adds nothing', async () => {
    const { db, twinId } = await started()
    const first = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    const again = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    expect(again).toEqual({ ...first, created: false })
    expect(db.tables.classes).toHaveLength(2)
    expect(db.tables.curriculum_maps).toHaveLength(1)
    expect(db.tables.topics).toHaveLength(first.topics)
    expect(db.tables.enrolments).toHaveLength(2)
    expect(db.tables.activity_log).toHaveLength(1)
  })

  test('a Kenyan twin gets the class and the enrolment and no map', async () => {
    const { db, twinId, personal } = await started('KE')
    const out = await addOwnGrade(db, twinId, 8, LEARNER, NOW)
    expect(db.tables.classes!.filter((c) => c.school_id === personal)).toEqual([expect.objectContaining({ name: 'Grade 8 (my own)', grade: 8, subject: 'Mathematics' })])
    expect(db.tables.enrolments!.filter((e) => e.child_id === twinId)).toHaveLength(1)
    expect(db.tables.curriculum_maps).toHaveLength(0)
    expect(db.tables.topics).toHaveLength(0)
    expect(db.tables.activity_log).toHaveLength(0)
    expect(out).toMatchObject({ grade: 8, created: true, topics: 0 })
  })

  test('the parent who acts for the learner owns the class; a stranger may not add a grade', async () => {
    const { db, twinId, personal } = await started()
    await addOwnGrade(db, twinId, 6, PARENT, NOW)
    expect(db.tables.classes!.find((c) => c.school_id === personal)).toMatchObject({ teacher_id: PARENT })
    await expect(addOwnGrade(db, twinId, 7, STRANGER, NOW)).rejects.toBeInstanceOf(OwnWorkspaceError)
    await expect(addOwnGrade(db, twinId, 7, TEACHER, NOW)).rejects.toBeInstanceOf(OwnWorkspaceError)
    expect(db.tables.classes!.filter((c) => c.school_id === personal)).toHaveLength(1)
  })

  test('the school child is not a private workspace: no grade is added to it', async () => {
    const { db } = await started()
    await expect(addOwnGrade(db, AMINA, 7, LEARNER, NOW)).rejects.toBeInstanceOf(OwnWorkspaceError)
    expect(db.tables.classes).toHaveLength(1)
  })

  test('nothing of the school child, its class or its school changes', async () => {
    const { db, twinId } = await started()
    const before = JSON.stringify([db.tables.schools![0], db.tables.classes![0], db.tables.children!.find((c) => c.id === AMINA), db.tables.enrolments![0]])
    await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    await addOwnGrade(db, twinId, 7, LEARNER, NOW)
    expect(JSON.stringify([db.tables.schools![0], db.tables.classes![0], db.tables.children!.find((c) => c.id === AMINA), db.tables.enrolments![0]])).toBe(before)
  })
})

describe('the overview and the teacher\'s read-only view', () => {
  async function played() {
    const db = world()
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    const g6 = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    const g7 = await addOwnGrade(db, twinId, 7, LEARNER, NOW)
    const topicOf = (classId: string, at: number) => {
      const map = db.tables.curriculum_maps!.find((m) => m.class_id === classId)!
      return db.tables.topics!.filter((t) => t.map_id === map.id)[at]!
    }
    const t6 = topicOf(g6.classId, 0)
    const t7 = topicOf(g7.classId, 1)
    const session = (topic: Row, when: string, results: boolean[], status = 'done') => {
      const id = crypto.randomUUID()
      db.tables.sessions!.push({ id, child_id: twinId, status, topic_id: topic.id, topic_name: topic.name, finished_at: status === 'done' ? when : null, created_at: when, planned_for: when.slice(0, 10) })
      for (const correct of results) db.tables.session_items!.push({ id: crypto.randomUUID(), session_id: id, phase: 'try', correct })
      db.tables.session_items!.push({ id: crypto.randomUUID(), session_id: id, phase: 'warmup', correct: true })
      return id
    }
    session(t6, '2026-11-10T16:00:00Z', [true, true, false, true, false])
    session(t6, '2026-11-11T16:00:00Z', [true, true, true, false, true])
    session(t7, '2026-11-12T16:00:00Z', [true, false, false, false, true])
    session(t7, '2026-11-13T16:00:00Z', [true], 'planned')
    db.tables.gaps!.push(
      { id: 'gap-open', child_id: twinId, topic_id: t6.id, topic_name: t6.name, stage: 'new', created_at: '2026-11-10T17:00:00Z', fixed_at: null },
      { id: 'gap-fixed', child_id: twinId, topic_id: t7.id, topic_name: t7.name, stage: 'fixed', created_at: '2026-11-01T17:00:00Z', fixed_at: '2026-11-12T17:00:00Z' },
    )
    return { db, twinId, g6, g7, t6, t7 }
  }

  test('getOwnOverview lists the grades with their topics and the learner\'s own count in each', async () => {
    const { db, twinId, g6, g7 } = await played()
    const overview = await getOwnOverview(db, twinId, NOW)
    expect(overview.map((g) => g.grade)).toEqual([6, 7])
    expect(overview[0]).toMatchObject({ classId: g6.classId, grade: 6, name: 'Grade 6 (my own)', topics: g6.topics, score: { right: 7, asked: 10 } })
    expect(overview[1]).toMatchObject({ classId: g7.classId, grade: 7, name: 'Grade 7 (my own)', topics: g7.topics, score: { right: 2, asked: 5 } })
  })

  test('a twin with no grade has an empty overview', async () => {
    const db = world()
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    expect(await getOwnOverview(db, twinId, NOW)).toEqual([])
  })

  test('the class\'s teacher gets the twin\'s summary: the grades, the topics practised with counts, the gaps and the last finished sessions', async () => {
    const { db, t6, t7, g6 } = await played()
    const summary = await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: HOME_CLASS, childId: AMINA, now: NOW })
    expect(summary).not.toBeNull()
    expect(summary!.firstName).toBe('Amina')
    expect(summary!.grades.map((g) => g.grade)).toEqual([6, 7])
    const six = summary!.grades[0]!
    expect(six).toMatchObject({ classId: g6.classId, topics: g6.topics, score: { right: 7, asked: 10 } })
    expect(six.practised).toEqual([expect.objectContaining({ name: t6.name, score: { right: 7, asked: 10 } })])
    expect(summary!.grades[1]!.practised).toEqual([expect.objectContaining({ name: t7.name, score: { right: 2, asked: 5 } })])
    expect(summary!.gaps.open).toEqual([expect.objectContaining({ topicName: t6.name, grade: 6 })])
    expect(summary!.gaps.fixed).toEqual([expect.objectContaining({ topicName: t7.name, grade: 7 })])
    // The finished sessions only (the planned one is not here), newest first, with the right of the asked (the warm-up is not counted).
    expect(summary!.sessions).toEqual([
      { date: '2026-11-12T16:00:00Z', topic: t7.name, right: 2, asked: 5 },
      { date: '2026-11-11T16:00:00Z', topic: t6.name, right: 4, asked: 5 },
      { date: '2026-11-10T16:00:00Z', topic: t6.name, right: 3, asked: 5 },
    ])
  })

  test('only the last ten finished sessions are listed', async () => {
    const { db, twinId, t6 } = await played()
    for (let day = 1; day <= 12; day++) {
      const id = crypto.randomUUID()
      db.tables.sessions!.push({ id, child_id: twinId, status: 'done', topic_id: t6.id, topic_name: t6.name, finished_at: `2026-10-${String(day).padStart(2, '0')}T16:00:00Z`, created_at: '2026-10-01T00:00:00Z' })
    }
    const summary = await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: HOME_CLASS, childId: AMINA, now: NOW })
    expect(summary!.sessions).toHaveLength(10)
    expect(summary!.sessions[0]!.date).toBe('2026-11-12T16:00:00Z')
  })

  test('another teacher, a class the child is not in, the twin\'s own id and a learner with no twin all get nothing', async () => {
    const { db, twinId } = await played()
    expect(await getOwnWorkspaceForTeacher(db, { teacherId: OTHER_TEACHER, classId: HOME_CLASS, childId: AMINA, now: NOW })).toBeNull()
    expect(await getOwnWorkspaceForTeacher(db, { teacherId: STRANGER, classId: HOME_CLASS, childId: AMINA, now: NOW })).toBeNull()
    const elsewhere = '22222222-2222-4222-8222-2222222222ff'
    db.tables.classes!.push({ id: elsewhere, school_id: SCHOOL, teacher_id: TEACHER, name: '5A', grade: 5, subject: 'Mathematics' })
    expect(await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: elsewhere, childId: AMINA, now: NOW })).toBeNull()
    // The twin is not enrolled in the teacher's class, so the twin's own id gets nothing either.
    expect(await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: HOME_CLASS, childId: twinId, now: NOW })).toBeNull()
    // A learner in the teacher's class who never opened My own.
    db.tables.children!.push({ id: 'child-bo', school_id: SCHOOL, first_name: 'Bo', grade: 6, user_id: null, private_of: null })
    db.tables.enrolments!.push({ class_id: HOME_CLASS, child_id: 'child-bo' })
    expect(await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: HOME_CLASS, childId: 'child-bo', now: NOW })).toBeNull()
  })

  test('it never writes', async () => {
    const { db } = await played()
    const writes: string[] = []
    const from = db.from.bind(db) as unknown as (t: string) => unknown
    ;(db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const q = from(table) as Record<string, (...a: unknown[]) => unknown>
      for (const m of ['insert', 'update', 'delete', 'upsert']) {
        const original = q[m]
        if (original) q[m] = (...a: unknown[]) => (writes.push(`${m} ${table}`), original.apply(q, a))
      }
      return q
    }
    const before = JSON.stringify(db.tables)
    await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: HOME_CLASS, childId: AMINA, now: NOW })
    await getOwnOverview(db, (await twinOfChild(db, AMINA))!.id, NOW)
    expect(writes).toEqual([])
    expect(JSON.stringify(db.tables)).toBe(before)
  })
})

describe('practising in My own', () => {
  const ctx = (db: MemoryDb, schoolId: string): ToolContext => ({ db, schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => NOW })

  test('a choice of a topic of the twin\'s Grade 7 map is planned for the twin, and the school child\'s sessions and gaps are not touched', async () => {
    const db = world('ZA', {
      // The school child has a map, a gap and a planned session of its own.
      curriculum_maps: [{ id: 'school-map', class_id: HOME_CLASS, status: 'approved' }],
      topics: [{ id: 'school-topic', map_id: 'school-map', name: 'Adding decimals', family: 'decimals', term: 4, position: 1, prerequisite_ids: [] }],
      gaps: [{ id: 'school-gap', child_id: AMINA, topic_id: 'school-topic', topic_name: 'Adding decimals', stage: 'new', created_at: '2026-10-01T08:00:00Z', fixed_at: null }],
      lessons: [{ id: 'school-lesson', child_id: AMINA, topic_name: 'Adding decimals', format: 'reading', content: {} }],
      sessions: [{ id: 'school-session', child_id: AMINA, lesson_id: 'school-lesson', status: 'planned', planned_for: '2026-11-20', topic_id: 'school-topic', topic_name: 'Adding decimals', format: 'reading', warmup: [], created_at: '2026-11-10T08:00:00Z' }],
    })
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    const personal = privateSchools(db)[0]!.id as string
    const g7 = await addOwnGrade(db, twinId, 7, LEARNER, NOW)
    const map = db.tables.curriculum_maps!.find((m) => m.class_id === g7.classId)!
    const topic = db.tables.topics!.find((t) => t.map_id === map.id)!
    const schoolBefore = JSON.stringify([db.tables.sessions![0], db.tables.gaps![0], db.tables.lessons![0]])

    const plan = (await planNextSession.run(ctx(db, personal), { childId: twinId, practice: true, choice: { topicId: topic.id as string, topicName: topic.name as string } })) as SessionPlan

    expect(plan).toMatchObject({ planned: true, reused: false, topicName: topic.name, topicId: topic.id, plannedFor: '2026-11-14' })
    const planned = db.tables.sessions!.filter((s) => s.child_id === twinId)
    expect(planned).toEqual([expect.objectContaining({ id: plan.sessionId, status: 'planned', topic_id: topic.id })])
    expect(db.tables.lessons!.filter((l) => l.child_id === twinId)).toHaveLength(1)
    // Nothing of the school child moved: its session is still planned for its own day, and its gap and lesson are as they were.
    expect(JSON.stringify([db.tables.sessions![0], db.tables.gaps![0], db.tables.lessons![0]])).toBe(schoolBefore)
    expect(db.tables.sessions!.filter((s) => s.child_id === AMINA)).toHaveLength(1)
    expect(db.tables.gaps!.filter((g) => g.child_id === twinId)).toHaveLength(0)
  })

  test('the agent for the school child\'s school cannot plan for the twin, and the twin cannot practise a topic of the school child\'s map', async () => {
    const db = world('ZA', {
      curriculum_maps: [{ id: 'school-map', class_id: HOME_CLASS, status: 'approved' }],
      topics: [{ id: 'school-topic', map_id: 'school-map', name: 'Adding decimals', family: 'decimals', term: 4, position: 1, prerequisite_ids: [] }],
    })
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    const personal = privateSchools(db)[0]!.id as string
    await addOwnGrade(db, twinId, 7, LEARNER, NOW)
    await expect(planNextSession.run(ctx(db, SCHOOL), { childId: twinId, practice: true })).rejects.toThrow(/not in this school/)
    const refused = (await planNextSession.run(ctx(db, personal), { childId: twinId, practice: true, choice: { topicId: 'school-topic', topicName: 'Adding decimals' } })) as SessionPlan
    expect(refused.planned).toBe(false)
    expect(db.tables.sessions).toHaveLength(0)
  })
})

// ---- P95c: a learner's own curriculum is a second private class of a grade ---------------------------------------------------------------

describe('which class is the CAPS one (one rule, in one place)', () => {
  test('a CAPS class is named exactly "Grade {N} (my own)"', () => {
    expect(capsClassName(6)).toBe('Grade 6 (my own)')
    expect(capsClassName(12)).toBe('Grade 12 (my own)')
    expect(isCapsClassName('Grade 6 (my own)', 6)).toBe(true)
    expect(isCapsClassName('Grade 6 (my own)', 7)).toBe(false)
    expect(isCapsClassName("My school's Term 1 plan", 6)).toBe(false)
  })

  test('isCapsClassName without a grade is true for any name a CAPS class could have, so a learner cannot give an own curriculum such a name', () => {
    expect(isCapsClassName('Grade 9 (my own)')).toBe(true)
    expect(isCapsClassName('grade 9 (MY OWN)')).toBe(true)
    expect(isCapsClassName('  Grade 11 (my own) ')).toBe(true)
    expect(isCapsClassName('Grade 9 (my own) plan')).toBe(false)
    expect(isCapsClassName('Grade 13 (my own)')).toBe(false)
    expect(isCapsClassName('My own')).toBe(false)
  })
})

describe('a grade that has an own curriculum of the same grade', () => {
  async function withOwnClass(grade: number, name = "My school's Term 1 plan", over: Record<string, Row[]> = {}) {
    const db = world('ZA', over)
    const twinId = await ensureOwnWorkspace(db, AMINA, LEARNER)
    const personal = privateSchools(db)[0]!.id as string
    // What P97's upload makes: a private class named by the learner, with the learner enrolled. Its map is the learner's own.
    const id = 'own-curriculum-class'
    db.tables.classes!.push({ id, school_id: personal, teacher_id: LEARNER, name, grade, subject: 'Mathematics', year: 2026, join_code: 'OWNC11', created_at: '2026-11-01T08:00:00.000Z' })
    db.tables.enrolments!.push({ class_id: id, child_id: twinId })
    db.tables.curriculum_maps!.push({ id: 'own-map', class_id: id, status: 'approved', draft: { name }, approved_at: '2026-11-01T09:00:00.000Z', created_at: '2026-11-01T08:30:00.000Z' })
    return { db, twinId, personal, ownClassId: id }
  }

  test('adding that grade makes the CAPS class: the own class never blocks it and never gets a CAPS map', async () => {
    const { db, twinId, personal, ownClassId } = await withOwnClass(6)
    const out = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    expect(out.created).toBe(true)
    expect(out.classId).not.toBe(ownClassId)
    const mine = db.tables.classes!.filter((c) => c.school_id === personal)
    expect(mine.map((c) => c.name).sort()).toEqual(["My school's Term 1 plan", 'Grade 6 (my own)'].sort())
    expect(mine.find((c) => c.id === out.classId)).toMatchObject({ name: 'Grade 6 (my own)', grade: 6 })
    // The CAPS map is on the CAPS class only; the own class keeps its one map, untouched.
    expect(db.tables.curriculum_maps!.filter((m) => m.class_id === ownClassId)).toEqual([expect.objectContaining({ id: 'own-map', draft: { name: "My school's Term 1 plan" } })])
    const capsMaps = db.tables.curriculum_maps!.filter((m) => m.class_id === out.classId)
    expect(capsMaps).toHaveLength(1)
    expect(capsMaps[0]).toMatchObject({ status: 'approved', draft: capsMapOf(6)!.stored })
    expect(out.topics).toBe(capsMapOf(6)!.rows.length)
    expect(db.tables.enrolments!.filter((e) => e.child_id === twinId).map((e) => e.class_id).sort()).toEqual([ownClassId, out.classId].sort())
  })

  test('a second call for the grade finds the CAPS class, not the own class, and adds nothing', async () => {
    const { db, twinId, ownClassId } = await withOwnClass(6)
    const first = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    const again = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    expect(again).toEqual({ ...first, created: false })
    expect(again.classId).not.toBe(ownClassId)
    expect(db.tables.classes!.filter((c) => c.grade === 6 && c.school_id !== SCHOOL)).toHaveLength(2)
    expect(db.tables.curriculum_maps!.filter((m) => m.class_id === first.classId)).toHaveLength(1)
  })

  test('the CAPS class made first and the own class made after it do not meet either: the grade adds nothing', async () => {
    const { db, twinId } = await started6()
    const first = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    db.tables.classes!.push({ id: 'later-own', school_id: privateSchools(db)[0]!.id, teacher_id: LEARNER, name: 'Term 2 plan', grade: 6, subject: 'Mathematics', year: 2026, join_code: 'OWNC22', created_at: '2026-11-13T08:00:00.000Z' })
    db.tables.enrolments!.push({ class_id: 'later-own', child_id: twinId })
    expect(await addOwnGrade(db, twinId, 6, LEARNER, NOW)).toEqual({ ...first, created: false })
    expect(db.tables.curriculum_maps!.filter((m) => m.class_id === 'later-own')).toHaveLength(0)
  })

  async function started6() {
    const db = world()
    return { db, twinId: await ensureOwnWorkspace(db, AMINA, LEARNER) }
  }

  test('an own curriculum of one grade does not stop another grade from being added', async () => {
    const { db, twinId } = await withOwnClass(6)
    const out = await addOwnGrade(db, twinId, 9, LEARNER, NOW)
    expect(out).toMatchObject({ grade: 9, created: true })
    expect(db.tables.classes!.find((c) => c.id === out.classId)).toMatchObject({ name: 'Grade 9 (my own)' })
  })

  test('listOwnClasses says which class is the CAPS one, in grade order with the CAPS class before an own class of the same grade', async () => {
    const { db, twinId, ownClassId } = await withOwnClass(6)
    const caps7 = await addOwnGrade(db, twinId, 7, LEARNER, NOW)
    const caps6 = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    const classes = await listOwnClasses(db, twinId)
    expect(classes).toEqual([
      { id: caps6.classId, name: 'Grade 6 (my own)', grade: 6, caps: true },
      { id: ownClassId, name: "My school's Term 1 plan", grade: 6, caps: false },
      { id: caps7.classId, name: 'Grade 7 (my own)', grade: 7, caps: true },
    ])
  })

  test('with no CAPS class of that grade the own class is listed alone, and is not a CAPS class', async () => {
    const { db, twinId, ownClassId } = await withOwnClass(9)
    expect(await listOwnClasses(db, twinId)).toEqual([{ id: ownClassId, name: "My school's Term 1 plan", grade: 9, caps: false }])
  })

  test('the class My maths shows first is the CAPS class of the learner\'s grade, even when an own class of that grade is older', async () => {
    const { db, twinId, ownClassId } = await withOwnClass(6)
    expect(await defaultOwnClass(db, twinId)).toBe(ownClassId)
    const caps6 = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    expect(await defaultOwnClass(db, twinId)).toBe(caps6.classId)
  })

  test('getOwnOverview answers every class with caps, an own class too, with its own name', async () => {
    const { db, twinId, ownClassId } = await withOwnClass(6)
    const caps6 = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    const overview = await getOwnOverview(db, twinId, NOW)
    expect(overview.map((g) => [g.classId, g.caps, g.name])).toEqual([
      [caps6.classId, true, 'Grade 6 (my own)'],
      [ownClassId, false, "My school's Term 1 plan"],
    ])
  })

  test('the teacher\'s read-only view lists the own class as a class of its own, with caps false', async () => {
    const { db, twinId, ownClassId } = await withOwnClass(6)
    const caps6 = await addOwnGrade(db, twinId, 6, LEARNER, NOW)
    const summary = await getOwnWorkspaceForTeacher(db, { teacherId: TEACHER, classId: HOME_CLASS, childId: AMINA, now: NOW })
    expect(summary!.grades.map((g) => [g.classId, g.caps])).toEqual([[caps6.classId, true], [ownClassId, false]])
  })
})
