import type { JemmaDb } from '../../src/db'
import { ok as okTool } from '../../src/tools/context'

// 1x1 transparent PNG
export const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

const TOPIC = 'Adding fractions with different denominators'

export type Sandbox = {
  schoolId: string
  teacherId: string
  classId: string
  mapId: string
  testId: string
  oldTestId: string
  aminaId: string
  thaboId: string
  paperId: string
  paperPaths: string[]
  cleanup(): Promise<void>
}

const ok = async <T>(q: Parameters<typeof okTool<T>>[0]) => okTool(q)

/** A small marked school in jemma-dev: one class, two learners, two tests, photos in storage. */
export async function createSandbox(db: JemmaDb, tag: string, runner: 'cloud' | 'desktop' = 'cloud'): Promise<Sandbox> {
  const email = `${tag}-teacher@example.test`
  const created = await db.auth.admin.createUser({ email, password: `${tag}-Passw0rd!`, email_confirm: true })
  if (created.error) throw created.error
  const teacherId = created.data.user.id

  const [school] = await ok(
    db.from('schools').insert({ name: `${tag} School`, country: 'ZA', ai_runner: runner }).select('id'),
  )
  const schoolId = school!.id
  await ok(db.from('profiles').insert({ user_id: teacherId, role: 'teacher', display_name: 'Ms Test', school_id: schoolId }).select())
  const [cls] = await ok(
    db
      .from('classes')
      .insert({ school_id: schoolId, teacher_id: teacherId, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Maths', join_code: `${tag}`.slice(-12) })
      .select('id'),
  )
  const classId = cls!.id
  const kids = await ok(
    db
      .from('children')
      .insert([
        { school_id: schoolId, first_name: 'Amina', grade: 6 },
        { school_id: schoolId, first_name: 'Thabo', grade: 6 },
      ])
      .select('id, first_name'),
  )
  const aminaId = kids.find((k) => k.first_name === 'Amina')!.id
  const thaboId = kids.find((k) => k.first_name === 'Thabo')!.id
  await ok(db.from('enrolments').insert([{ class_id: classId, child_id: aminaId }, { class_id: classId, child_id: thaboId }]).select())

  const [map] = await ok(
    db.from('curriculum_maps').insert({ class_id: classId, status: 'approved', approved_at: new Date().toISOString() }).select('id'),
  )
  const mapId = map!.id
  const [topic] = await ok(
    db.from('topics').insert({ map_id: mapId, term: 1, position: 1, name: TOPIC, family: 'fractions' }).select('id'),
  )
  const topicId = topic!.id
  await ok(db.from('curriculum_docs').insert({ class_id: classId, storage_path: `${tag}/curriculum.png`, title: 'Grade 6 plan', pages: 1 }).select())

  const tests = await ok(
    db
      .from('tests')
      .insert([
        { class_id: classId, title: 'Test 1', written_on: '2026-09-01', out_of: 2, topic_ids: [topicId] },
        { class_id: classId, title: 'Test 2', written_on: '2026-10-01', out_of: 2, topic_ids: [topicId] },
      ])
      .select('id, title'),
  )
  const oldTestId = tests.find((t) => t.title === 'Test 1')!.id
  const testId = tests.find((t) => t.title === 'Test 2')!.id
  const keyItems = [
    { n: 1, prompt: '1/2 + 1/4', answer: '3/4', marks: 1, topicName: TOPIC, confidence: 1 },
    { n: 2, prompt: '2/3 + 1/6', answer: '5/6', marks: 1, topicName: TOPIC, confidence: 1 },
  ]
  await ok(
    db
      .from('answer_keys')
      .insert([
        { test_id: oldTestId, status: 'approved', items: keyItems },
        { test_id: testId, status: 'approved', items: keyItems, memo_path: `${tag}/memo.png` },
      ])
      .select(),
  )

  const paths = [`${tag}/memo.png`, `${tag}/curriculum.png`, `${tag}/amina-p1.png`, `${tag}/amina-old.png`]
  for (const p of paths) {
    const up = await db.storage.from('papers').upload(p, PNG_BYTES, { contentType: 'image/png', upsert: true })
    if (up.error) throw up.error
    const up2 = await db.storage.from('curriculum').upload(p, PNG_BYTES, { contentType: 'image/png', upsert: true })
    if (up2.error) throw up2.error
  }

  const marked = async (tid: string, childId: string, rights: boolean[]) => {
    const [paper] = await ok(
      db
        .from('papers')
        .insert({ test_id: tid, child_id: childId, owner: 'teacher', kind: 'test', status: 'marked', name_read: 'x', total: rights.filter(Boolean).length })
        .select('id'),
    )
    await ok(
      db
        .from('question_results')
        .insert(
          rights.map((r, i) => ({
            paper_id: paper!.id,
            child_id: childId,
            n: i + 1,
            prompt: keyItems[i]!.prompt,
            answer_read: r ? keyItems[i]!.answer : '2/6',
            read_confidence: 0.95,
            correct: r,
            mark: r ? 1 : 0,
            topic_id: topicId,
            topic_name: TOPIC,
            misconception: r ? null : 'Adds the tops and the bottoms',
          })),
        )
        .select(),
    )
    return paper!.id
  }
  await marked(oldTestId, aminaId, [true, false])
  const paperId = await marked(testId, aminaId, [false, false])
  await marked(testId, thaboId, [true, true])
  await ok(db.from('paper_pages').insert([{ paper_id: paperId, page_no: 1, storage_path: `${tag}/amina-p1.png` }]).select())

  await ok(
    db
      .from('attendance')
      .insert(
        Array.from({ length: 10 }, (_, i) => ({
          child_id: aminaId,
          day: `2026-10-${String(i + 1).padStart(2, '0')}`,
          status: (i === 4 ? 'away' : 'here') as 'away' | 'here',
        })),
      )
      .select(),
  )
  await ok(
    db
      .from('observations')
      .insert([
        { child_id: aminaId, author_id: teacherId, kind: 'confidence', text: 'Hesitant to answer aloud' },
        { child_id: aminaId, author_id: teacherId, kind: 'effort', text: 'Finishes homework' },
      ])
      .select(),
  )
  await ok(
    db
      .from('activities')
      .insert([
        { child_id: aminaId, kind: 'sport', name: 'Netball', days: ['Tue'], since: 'Jan 2026', created_by: teacherId },
        { child_id: aminaId, kind: 'music', name: 'Choir', days: ['Thu'], since: 'Feb 2026', created_by: teacherId },
      ])
      .select(),
  )

  return {
    schoolId, teacherId, classId, mapId, testId, oldTestId, aminaId, thaboId, paperId,
    paperPaths: paths,
    async cleanup() {
      await db.storage.from('papers').remove(paths)
      await db.storage.from('curriculum').remove(paths)
      await db.from('schools').delete().eq('id', schoolId)
      await db.auth.admin.deleteUser(teacherId)
    },
  }
}
