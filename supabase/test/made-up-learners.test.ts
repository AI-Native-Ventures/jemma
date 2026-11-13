import { afterAll, describe, expect, test } from 'vitest'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { buildTable, findPatterns, type LongViewRecord } from '../../packages/profiling/src/logic/long-view'
import { createClassRecord } from '../../apps/web/lib/class-writes'
import { createSandbox, deleteSandbox } from '../seed/demo'
import { addMadeUpLearners, isSandboxClass } from '../seed/demo-learners'

// "Add made-up learners" on real rows: an empty demo school, a class in any grade and subject, six learners with history in one tap.

const admin: JemmaDb = createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const sandboxes: string[] = []
const schools: string[] = []

async function emptySchool() {
  const s = await createSandbox(admin, { kind: 'empty' })
  sandboxes.push(s.sandboxId)
  const { data: profile } = await admin.from('profiles').select('user_id').eq('school_id', s.schoolId).single()
  return { ...s, teacherId: profile!.user_id }
}

async function makeClass(school: { schoolId: string; teacherId: string }, name: string, grade: number, subject: string) {
  const r = await createClassRecord(admin, { userId: school.teacherId, schoolId: school.schoolId, name, grade, subject, code: 'ZZZZZZ', learners: [] })
  return r.classId
}

async function recordsOf(childIds: string[]): Promise<Map<string, LongViewRecord[]>> {
  const { data, error } = await admin.from('learner_records').select('*').in('child_id', childIds).limit(5000)
  if (error) throw new Error(error.message)
  const by = new Map<string, LongViewRecord[]>()
  for (const r of data ?? []) {
    const rec: LongViewRecord = {
      id: r.id, source: r.source as LongViewRecord['source'], grade: r.grade, year: r.year, term: r.term, happenedOn: r.happened_on, loggedAt: r.logged_at,
      teacherName: r.teacher_name, title: r.title, family: r.family, topicName: r.topic_name, marks: r.marks, outOf: r.out_of,
      quality: r.quality as 'clear' | 'unclear', text: r.text, present: r.present, total: r.total, subject: r.subject,
    }
    by.set(r.child_id, [...(by.get(r.child_id) ?? []), rec])
  }
  return by
}

afterAll(async () => {
  await Promise.all(sandboxes.map((id) => deleteSandbox(admin, id).catch(() => undefined)))
  if (schools.length) await admin.from('schools').delete().in('id', schools)
}, 120_000)

describe('addMadeUpLearners', () => {
  test('Natural Sciences Grade 9: six learners, enrolled, with history and a grid the finder reads', async () => {
    const school = await emptySchool()
    const classId = await makeClass(school, '9A Natural Sciences', 9, 'Natural Sciences')
    expect(await isSandboxClass(admin, classId)).toBe(true)

    const t0 = Date.now()
    const r = await addMadeUpLearners(admin, { classId })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Date.now() - t0).toBeLessThan(12_000)
    expect(r.childIds).toHaveLength(6)
    expect(new Set(r.names).size).toBe(6)

    const kids = await admin.from('children').select('id, grade, school_id').in('id', r.childIds)
    expect(kids.data!.every((k) => k.grade === 9 && k.school_id === school.schoolId)).toBe(true)
    const enrolled = await admin.from('enrolments').select('child_id').eq('class_id', classId)
    expect(enrolled.data!.map((e) => e.child_id).sort()).toEqual([...r.childIds].sort())
    const attendance = await admin.from('attendance').select('child_id', { count: 'exact', head: true }).in('child_id', r.childIds)
    expect(attendance.count).toBe(60)

    const records = await recordsOf(r.childIds)
    let patterns = 0
    for (const id of r.childIds) {
      const mine = records.get(id) ?? []
      expect(mine.length).toBeGreaterThan(20)
      const grades = new Set(mine.map((x) => x.grade))
      expect(Math.min(...grades)).toBe(7)
      expect(Math.max(...grades)).toBe(9)
      const found = findPatterns(buildTable(mine, []).table)
      expect(found.length).toBeLessThanOrEqual(1)
      for (const p of found) expect(p.subject).toBe('Natural Sciences')
      patterns += found.length
    }
    // About half carry a planted pattern; nothing else becomes one.
    expect(patterns).toBe(3)
    const families = new Set(flat(records).filter((x) => x.subject === 'Natural Sciences').map((x) => x.family))
    expect(families).toEqual(new Set(['life_living', 'matter_materials', 'energy_change', 'earth_beyond']))
  }, 120_000)

  test('a second tap makes six other learners', async () => {
    const school = await emptySchool()
    const classId = await makeClass(school, '5B Mathematics', 5, 'Mathematics')
    const a = await addMadeUpLearners(admin, { classId })
    const b = await addMadeUpLearners(admin, { classId })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.names.filter((n) => b.names.includes(n))).toEqual([])
    const enrolled = await admin.from('enrolments').select('child_id', { count: 'exact', head: true }).eq('class_id', classId)
    expect(enrolled.count).toBe(12)
  }, 120_000)

  test('the class strands: the approved map first, neutral ones for an Other subject, any grade from 1 to 12', async () => {
    const school = await emptySchool()
    const maths = await makeClass(school, '4C Mathematics', 4, 'Mathematics')
    const map = await admin.from('curriculum_maps').insert({ class_id: maths, status: 'approved', draft: { terms: [] }, approved_at: new Date().toISOString() }).select('id').single()
    expect(map.error).toBeNull()
    const topics = await admin.from('topics').insert([
      { map_id: map.data!.id, term: 1, position: 1, name: 'Equivalent fractions', short_name: 'Equivalent fractions', family: 'fractions', misconceptions: [] },
      { map_id: map.data!.id, term: 1, position: 2, name: 'Adding decimals', short_name: 'Adding decimals', family: 'decimals', misconceptions: [] },
    ])
    expect(topics.error).toBeNull()
    const a = await addMadeUpLearners(admin, { classId: maths })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const own = [...(await recordsOf(a.childIds)).values()].flat().filter((x) => x.subject === 'Mathematics')
    expect(new Set(own.map((x) => x.family))).toEqual(new Set(['fractions', 'decimals']))

    const other = await makeClass(school, 'Woodwork 10', 10, 'Woodwork')
    const b = await addMadeUpLearners(admin, { classId: other })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    const woodwork = [...(await recordsOf(b.childIds)).values()].flat().filter((x) => x.subject === 'Woodwork')
    expect(new Set(woodwork.map((x) => x.family))).toEqual(new Set(['knowledge', 'skills', 'application']))

    for (const grade of [1, 12]) {
      const c = await makeClass(school, `Grade ${grade} English`, grade, 'English')
      const r = await addMadeUpLearners(admin, { classId: c })
      expect(r.ok, `grade ${grade}`).toBe(true)
    }
  }, 180_000)

  test('a real school (no sandbox) is refused and nothing is added', async () => {
    const school = await admin.from('schools').insert({ name: 'made-up learners test school without a sandbox', country: 'ZA', sandbox_id: null }).select('id').single()
    schools.push(school.data!.id)
    // A class needs a teacher: borrow the one of an empty demo school for the row only.
    const demo = await emptySchool()
    const cls = await admin
      .from('classes')
      .insert({ school_id: school.data!.id, teacher_id: demo.teacherId, name: 'Real 6A', grade: 6, year: new Date().getUTCFullYear(), subject: 'Mathematics', join_code: 'QQQQQQ' })
      .select('id')
      .single()
    expect(await isSandboxClass(admin, cls.data!.id)).toBe(false)
    const r = await addMadeUpLearners(admin, { classId: cls.data!.id })
    expect(r).toEqual({ ok: false, error: 'Made-up learners can only be added in the demo school.' })
    expect((await admin.from('children').select('id').eq('school_id', school.data!.id)).data).toEqual([])
  }, 120_000)
})

const flat = (records: Map<string, LongViewRecord[]>) => [...records.values()].flat()
